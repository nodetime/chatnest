// biome-ignore-all lint/performance/noAwaitInLoops: Sequential bounded parser I/O is required for backpressure and admission budgets.
"use strict";
/* Standalone Node >=22.13 worker, traced with its pinned runtime dependencies.
 * Pure-text parser, not a security sandbox: deployment container CPU/RSS/disk limits remain required. */
const { parentPort, workerData } = require("node:worker_threads");
const { Readable } = require("node:stream");
const { dirname } = require("node:path");
const MAX_TOTAL = 128 * 1024 * 1024,
  MAX_XML = 32 * 1024 * 1024,
  MAX_XML_TOTAL = 64 * 1024 * 1024;
class ParseLimitError extends Error {}
function fail(message) {
  throw new ParseLimitError(message);
}
const crcTable = Array.from({ length: 256 }, (_, initialValue) => {
  let value = initialValue;
  for (let i = 0; i < 8; i += 1) {
    value = (value >>> 1) ^ (value & 1 ? 0xed_b8_83_20 : 0);
  }
  return value >>> 0;
});
function crcChunk(initialCrc, chunk) {
  let crc = initialCrc;
  for (const byte of chunk) {
    crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  }
  return crc >>> 0;
}
function collector() {
  const result = { characters: 0, segments: [], status: "ready", warnings: [] };
  return {
    add(ref, sourceText) {
      const text = String(sourceText).replaceAll(String.fromCharCode(0), "");
      for (let offset = 0; offset < text.length; offset += 4000) {
        const available = 1_000_000 - result.characters;
        if (available <= 0 || result.segments.length >= 20_000) {
          result.status = "truncated";
          break;
        }
        const part = text.slice(offset, offset + Math.min(4000, available));
        result.segments.push({
          ref: offset ? `${ref}:offset:${offset}` : ref,
          text: part,
        });
        result.characters += part.length;
        if (part.length < Math.min(4000, text.length - offset)) {
          result.status = "truncated";
        }
      }
    },
    finish() {
      if (result.status === "truncated") {
        result.warnings.push(
          "仅保留前 1,000,000 字符或 20,000 段；其余内容未读取到上下文。"
        );
      }
      if (!result.characters) {
        result.status = "no_extractable_text";
      }
      return result;
    },
    result,
  };
}
function metadataScanner(name, workbook) {
  if (
    name !== "[Content_Types].xml" &&
    name !== "xl/workbook.xml" &&
    !name.endsWith(".rels")
  ) {
    return null;
  }
  const { SaxesParser } = require("saxes");
  const parser = new SaxesParser({ xmlns: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  parser.on("doctype", () => fail("XML DTD/实体不受支持。"));
  parser.on("error", () => fail("Office 元数据 XML 损坏。"));
  parser.on("opentag", (node) => {
    const attribute = (key) => node.attributes[key]?.value ?? "";
    if (
      name === "[Content_Types].xml" &&
      /macroEnabled|vbaProject|macrosheet/i.test(attribute("ContentType"))
    ) {
      fail("暂不支持含宏的 Office 格式，请另存为普通 DOCX/XLSX。");
    }
    if (
      name.endsWith(".rels") &&
      node.local === "Relationship" &&
      /\/(vbaProject|xlMacrosheet|xlIntlMacrosheet)$/i.test(attribute("Type"))
    ) {
      fail("暂不支持含宏的 Office 格式，请另存为普通 DOCX/XLSX。");
    }
    if (name === "xl/workbook.xml") {
      if (node.local === "workbookPr") {
        workbook.date1904 = ["1", "true"].includes(attribute("date1904"));
      }
      if (node.local === "sheet") {
        const id = Object.values(node.attributes).find(
          (item) =>
            item.local === "id" &&
            item.uri ===
              "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        )?.value;
        const sheetName = attribute("name");
        if (!id || id.length > 512 || !sheetName || sheetName.length > 31) {
          fail("XLSX 工作表名称或关系无效。");
        }
        workbook.sheets.push({ id, name: sheetName });
        if (workbook.sheets.length > 50) {
          fail("XLSX 超过 50 张工作表。");
        }
      }
    }
    if (
      name === "xl/_rels/workbook.xml.rels" &&
      node.local === "Relationship"
    ) {
      workbook.relations.push({
        id: attribute("Id"),
        mode: attribute("TargetMode"),
        target: attribute("Target"),
        type: attribute("Type"),
      });
      if (workbook.relations.length > 4096) {
        fail("XLSX 工作簿关系超过 4096 限制。");
      }
    }
  });
  return {
    close() {
      parser.write(decoder.decode()).close();
    },
    write(chunk) {
      parser.write(decoder.decode(chunk, { stream: true }));
    },
  };
}
async function zipPreflight(bytes, mime) {
  const yauzl = require("yauzl");
  const zip = await new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
      (e, z) => (e ? reject(e) : resolve(z))
    )
  );
  const seen = new Set(),
    spans = [],
    entries = [];
  const workbook = { date1904: false, relations: [], sheets: [] };
  let count = 0,
    declared = 0,
    actual = 0,
    xmlTotal = 0;
  try {
    await new Promise((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry) => {
        (async () => {
          const name = entry.fileName;
          count += 1;
          if (count > 4096) {
            fail("ZIP 条目超过 4096 限制。");
          }
          if (
            name.startsWith("/") ||
            name.includes("\\") ||
            name.split("/").some((p) => p === ".." || p === ".") ||
            name.includes("\0") ||
            /^[a-z]:/i.test(name) ||
            seen.has(name)
          ) {
            fail("ZIP 路径无效或条目重复。");
          }
          seen.add(name);
          entries.push(entry);
          // ExcelJS streams LOCAL records while yauzl trusts CENTRAL records. Require identical
          // interpretation and a contiguous indexed archive, not a parser-differential ZIP polyglot.
          const offset = entry.relativeOffsetOfLocalHeader;
          if (
            offset + 30 > bytes.length ||
            bytes.readUInt32LE(offset) !== 0x04_03_4b_50
          ) {
            fail("ZIP 本地文件头无效。");
          }
          const flags = bytes.readUInt16LE(offset + 6),
            method = bytes.readUInt16LE(offset + 8),
            nameSize = bytes.readUInt16LE(offset + 26),
            extraSize = bytes.readUInt16LE(offset + 28);
          if (
            flags !== entry.generalPurposeBitFlag ||
            method !== entry.compressionMethod ||
            !bytes
              .subarray(offset + 30, offset + 30 + nameSize)
              .equals(entry.fileNameRaw)
          ) {
            fail("ZIP 本地与中央文件头不一致。");
          }
          const dataEnd =
            offset + 30 + nameSize + extraSize + entry.compressedSize;
          if (dataEnd > bytes.length) {
            fail("ZIP 数据范围无效。");
          }
          if (
            !(flags & 8) &&
            (bytes.readUInt32LE(offset + 18) !== entry.compressedSize ||
              bytes.readUInt32LE(offset + 22) !== entry.uncompressedSize)
          ) {
            fail("ZIP 文件长度不一致。");
          }
          spans.push({
            compressed: entry.compressedSize,
            crc: entry.crc32,
            descriptor: Boolean(flags & 8),
            end: dataEnd,
            inflated: entry.uncompressedSize,
            start: offset,
          });
          if (entry.generalPurposeBitFlag & 1) {
            fail("LOCKED");
          }
          if (
            /(?:^|\/)(?:vbaProject\.bin$|macrosheets\/|embeddings\/)/i.test(
              name
            )
          ) {
            fail("暂不支持宏或嵌入式对象，请另存为普通 DOCX/XLSX。");
          }
          declared += entry.uncompressedSize;
          if (declared > MAX_TOTAL) {
            fail("ZIP 解压总量超过 128 MiB。");
          }
          const xml = /\.(xml|rels)$/i.test(name);
          if (xml && entry.uncompressedSize > MAX_XML) {
            fail("单个 XML 超过 32 MiB。");
          }
          const scanner = metadataScanner(name, workbook);
          const stream = await new Promise((res, rej) =>
            zip.openReadStream(entry, (e, s) => (e ? rej(e) : res(s)))
          );
          let entryBytes = 0,
            tail = "",
            crc = 0xff_ff_ff_ff;
          for await (const chunk of stream) {
            crc = crcChunk(crc, chunk);
            entryBytes += chunk.length;
            actual += chunk.length;
            if (actual > MAX_TOTAL) {
              fail("ZIP 实际解压总量超过 128 MiB。");
            }
            if (xml) {
              xmlTotal += chunk.length;
              if (entryBytes > MAX_XML || xmlTotal > MAX_XML_TOTAL) {
                fail("XML 超过 32/64 MiB 预算。");
              }
              // OOXML is UTF-8 by specification; reject alternate encoding to avoid DTD scanner ambiguity.
              if (chunk.includes(0)) {
                fail("XML 编码不受支持。");
              }
              const value = tail + chunk.toString("utf8");
              if (/<!\s*(DOCTYPE|ENTITY)/i.test(value)) {
                fail("XML DTD/实体不受支持。");
              }
              tail = value.slice(-100);
              scanner?.write(chunk);
            }
          }
          scanner?.close();
          if ((crc ^ 0xff_ff_ff_ff) >>> 0 !== entry.crc32) {
            fail("ZIP 校验和不一致。");
          }
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (
    eocd < 0 ||
    eocd + 22 > bytes.length ||
    eocd + 22 + bytes.readUInt16LE(eocd + 20) !== bytes.length
  ) {
    fail("ZIP 目录无效。");
  }
  const centralStart = bytes.readUInt32LE(eocd + 16);
  spans.sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    if (span.start !== cursor) {
      fail("ZIP 含重叠、隐藏或未索引条目。");
    }
    const next = i + 1 < spans.length ? spans[i + 1].start : centralStart;
    let descriptorAt = span.end;
    if (span.descriptor) {
      if (
        descriptorAt + 4 <= bytes.length &&
        bytes.readUInt32LE(descriptorAt) === 0x08_07_4b_50
      ) {
        descriptorAt += 4;
      }
      if (
        descriptorAt + 12 !== next ||
        bytes.readUInt32LE(descriptorAt) !== span.crc ||
        bytes.readUInt32LE(descriptorAt + 4) !== span.compressed ||
        bytes.readUInt32LE(descriptorAt + 8) !== span.inflated
      ) {
        fail("ZIP 数据描述符无效或超出预算。");
      }
    } else if (next !== span.end) {
      fail("ZIP 含隐藏或未索引条目。");
    }
    cursor = next;
  }
  if (cursor !== centralStart) {
    fail("ZIP 目录范围无效。");
  }
  const main = mime.includes("wordprocessing")
    ? "word/document.xml"
    : "xl/workbook.xml";
  if (!seen.has("[Content_Types].xml") || !seen.has(main)) {
    fail("Office 文件格式与扩展名不一致或已损坏。");
  }
  return { entries, workbook };
}
// Repackage validated XML as a STREAM, never eager embedded media. ExcelJS's reader
// otherwise has an ordering race when sheets precede workbook.xml (even its own writer does this).
// Canonical local records also remove CENTRAL vs LOCAL parser interpretation differences.
async function* orderedWorkbookStream(bytes, entries, workbook) {
  const yauzl = require("yauzl");
  const zip = await new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
      (e, z) => (e ? reject(e) : resolve(z))
    )
  );
  const entryByName = new Map(entries.map((entry) => [entry.fileName, entry]));
  const relationById = new Map(
    workbook.relations.map((relation) => [relation.id, relation])
  );
  if (
    relationById.size !== workbook.relations.length ||
    new Set(workbook.sheets.map((sheet) => sheet.name.toLowerCase())).size !==
      workbook.sheets.length
  ) {
    fail("XLSX 工作表名称或关系重复。");
  }
  const worksheetEntries = [];
  const { posix } = require("node:path");
  for (const sheet of workbook.sheets) {
    const relation = relationById.get(sheet.id);
    if (
      !relation ||
      relation.mode === "External" ||
      /^[a-z][a-z0-9+.-]*:/i.test(relation.target) ||
      !relation.type.endsWith("/worksheet")
    ) {
      fail("XLSX 包含缺失、外部或暂不支持的工作表关系。");
    }
    let target;
    try {
      target = decodeURIComponent(relation.target);
    } catch {
      fail("XLSX 工作表路径编码无效。");
    }
    const targetName = posix.normalize(
      target.startsWith("/") ? target.slice(1) : posix.join("xl", target)
    );
    const sourceEntry = entryByName.get(targetName);
    if (
      !sourceEntry ||
      !targetName.endsWith(".xml") ||
      targetName.startsWith("../")
    ) {
      fail("XLSX 工作表关系指向缺失或无效条目。");
    }
    worksheetEntries.push({
      ...sourceEntry,
      fileName: `xl/worksheets/sheet${worksheetEntries.length + 1}.xml`,
      sourceEntry,
    });
  }
  const xmlEscape = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const inlineEntry = (fileName, text) => {
    const inlineData = Buffer.from(text);
    return {
      crc32: (crcChunk(0xff_ff_ff_ff, inlineData) ^ 0xff_ff_ff_ff) >>> 0,
      fileName,
      inlineData,
      uncompressedSize: inlineData.length,
    };
  };
  const selected = [
    inlineEntry(
      "xl/workbook.xml",
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="${workbook.date1904 ? 1 : 0}"/><sheets>${workbook.sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`
    ),
    inlineEntry(
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbook.sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`
    ),
    ...[entryByName.get("xl/styles.xml")].filter(Boolean),
    entryByName.get("xl/sharedStrings.xml") ??
      inlineEntry(
        "xl/sharedStrings.xml",
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>'
      ),
    ...worksheetEntries,
  ];
  let offset = 0;
  const central = [];
  try {
    for (const entry of selected) {
      const name = Buffer.from(entry.fileName, "utf8"),
        header = Buffer.alloc(30);
      header.writeUInt32LE(0x04_03_4b_50);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0x8_00, 6);
      header.writeUInt32LE(entry.crc32, 14);
      header.writeUInt32LE(entry.uncompressedSize, 18);
      header.writeUInt32LE(entry.uncompressedSize, 22);
      header.writeUInt16LE(name.length, 26);
      const index = Buffer.alloc(46);
      index.writeUInt32LE(0x02_01_4b_50);
      index.writeUInt16LE(20, 4);
      index.writeUInt16LE(20, 6);
      index.writeUInt16LE(0x8_00, 8);
      index.writeUInt32LE(entry.crc32, 16);
      index.writeUInt32LE(entry.uncompressedSize, 20);
      index.writeUInt32LE(entry.uncompressedSize, 24);
      index.writeUInt16LE(name.length, 28);
      index.writeUInt32LE(offset, 42);
      central.push(index, name);
      yield header;
      yield name;
      if (entry.inlineData) {
        yield entry.inlineData;
      } else {
        const stream = await new Promise((resolve, reject) =>
          zip.openReadStream(entry.sourceEntry ?? entry, (e, s) =>
            e ? reject(e) : resolve(s)
          )
        );
        for await (const chunk of stream) {
          yield chunk;
        }
      }
      offset += 30 + name.length + entry.uncompressedSize;
    }
    const cd = Buffer.concat(central),
      end = Buffer.alloc(22);
    end.writeUInt32LE(0x06_05_4b_50);
    end.writeUInt16LE(selected.length, 8);
    end.writeUInt16LE(selected.length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(offset, 16);
    yield cd;
    yield end;
  } finally {
    zip.close();
  }
}
function textOf(node) {
  if (node.type === "text") {
    return node.value;
  }
  if (node.type === "tab") {
    return "\t";
  }
  if (node.type === "break") {
    return "\n";
  }
  return (node.children || []).map(textOf).join("");
}
async function parse(bytes, mime) {
  const out = collector();
  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]))
  ) {
    return {
      characters: 0,
      segments: [],
      status: "locked",
      warnings: ["Office 文件已加密，请上传本地解密后的 DOCX/XLSX 副本。"],
    };
  }
  if (mime === "application/pdf") {
    if (bytes.subarray(0, 5).toString() !== "%PDF-") {
      fail("PDF 文件头无效。");
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Only trusted, bundled assets; never fetch font/CMap URLs supplied by a PDF.
    const pdfAssets = dirname(
      require.resolve("pdfjs-dist/package.json")
    ).replaceAll("\\", "/");
    const task = pdfjs.getDocument({
      cMapPacked: true,
      cMapUrl: `${pdfAssets}/cmaps/`,
      data: new Uint8Array(bytes),
      disableAutoFetch: true,
      disableFontFace: true,
      isEvalSupported: false,
      isOffscreenCanvasSupported: false,
      standardFontDataUrl: `${pdfAssets}/standard_fonts/`,
      stopAtErrors: true,
      useSystemFonts: false,
      useWorkerFetch: false,
    });
    let doc;
    try {
      doc = await task.promise;
      if (doc.numPages > 300) {
        fail("PDF 超过 300 页限制。");
      }
      let empty = 0;
      for (let page = 1; page <= doc.numPages; page += 1) {
        const p = await doc.getPage(page);
        const text = await p.getTextContent();
        const value = text.items
          .filter((i) => typeof i.str === "string")
          .map((i) => i.str + (i.hasEOL ? "\n" : " "))
          .join("")
          .trim();
        if (value) {
          out.add(`page:${page}`, value);
        } else {
          empty += 1;
          out.result.warnings.push(`page:${page} 未提取到文字，可能是扫描页。`);
        }
        p.cleanup();
      }
      if (empty === doc.numPages) {
        out.result.warnings.push(
          "扫描件未执行 OCR，请先在本地 OCR 后重新上传。"
        );
      }
      return out.finish();
    } catch (e) {
      if (e.name === "PasswordException") {
        return {
          characters: 0,
          segments: [],
          status: "locked",
          warnings: ["PDF 已加密，请上传本地解密后的副本。"],
        };
      }
      throw e;
    } finally {
      await task.destroy();
    }
  }
  if (mime === "text/plain" || mime === "text/csv") {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      fail("请使用 UTF-8 文本文件。");
    }
    if (text.includes("\0")) {
      fail("文本包含二进制内容。");
    }
    if (mime === "text/plain") {
      let line = 0;
      for (const value of text.split(/\r\n|\n|\r/)) {
        line += 1;
        out.add(`line:${line}`, value);
      }
    } else {
      const Papa = require("papaparse");
      let row = 0;
      Papa.parse(text, {
        skipEmptyLines: false,
        step(result) {
          if (
            result.errors.some(
              (error) => error.code !== "UndetectableDelimiter"
            )
          ) {
            fail("CSV 格式损坏。");
          }
          row += 1;
          out.add(`row:${row}`, JSON.stringify(result.data));
        },
      });
    }
    return out.finish();
  }
  const { entries, workbook } = await zipPreflight(bytes, mime);
  const mediaCount = entries.filter((entry) =>
    /^(word|xl)\/(media|charts)\//.test(entry.fileName)
  ).length;
  if (mediaCount) {
    out.result.warnings.push(
      `仅提取文字；${mediaCount} 个嵌入图片/图表文件未分析，未执行 OCR。`
    );
  }
  if (mime.includes("wordprocessing")) {
    const mammoth = require("mammoth");
    let paragraph = 0,
      table = 0;
    await mammoth.convertToHtml(
      { buffer: bytes },
      {
        externalFileAccess: false,
        transformDocument(doc) {
          function walk(node, location = "") {
            if (node.type === "table") {
              table += 1;
              const tableNo = table;
              for (const [r, row] of (node.children || []).entries()) {
                for (const [c, cell] of (row.children || []).entries()) {
                  walk(cell, `table:${tableNo}:row:${r + 1}:cell:${c + 1}:`);
                }
              }
              return;
            }
            if (node.type === "paragraph") {
              paragraph += 1;
              out.add(`${location}paragraph:${paragraph}`, textOf(node));
              return;
            }
            for (const child of node.children || []) {
              walk(child, location);
            }
          }
          walk(doc);
          return { ...doc, children: [] };
        },
      }
    );
    return out.finish();
  }
  if (mime.includes("spreadsheet")) {
    const Excel = require("exceljs");
    let sheets = 0,
      cells = 0;
    // WorkbookReader drains unknown/media entries; deferred worksheet temp files live in worker's private TMPDIR.
    // Preflight's 64 MiB total XML bounds all deferred worksheet disk writes (128 MiB total inflate).
    const reader = new Excel.stream.xlsx.WorkbookReader(
      Readable.from(orderedWorkbookStream(bytes, entries, workbook)),
      {
        entries: "ignore",
        hyperlinks: "ignore",
        sharedStrings: "cache",
        styles: "cache",
        worksheets: "emit",
      }
    );
    for await (const sheet of reader) {
      sheets += 1;
      if (sheets > 50 || (reader.model?.sheets?.length ?? 0) > 50) {
        fail("XLSX 超过 50 张工作表。");
      }
      const sheetName = sheet.name;
      for await (const row of sheet) {
        row.eachCell({ includeEmpty: false }, (cell) => {
          cells += 1;
          if (cells > 100_000) {
            fail("XLSX 超过 100,000 个非空单元格。");
          }
          let { value } = cell;
          if (value && typeof value === "object") {
            if (value instanceof Date) {
              value = value.toISOString();
            } else if ("formula" in value || "sharedFormula" in value) {
              value = value.result ?? "[公式无缓存结果；未计算]";
            } else if ("richText" in value) {
              value = value.richText.map((t) => t.text).join("");
            } else if ("text" in value) {
              value = value.text;
            } else if ("error" in value) {
              value = value.error;
            } else {
              value = JSON.stringify(value);
            }
          }
          if (value !== null && value !== undefined) {
            out.add(
              `sheet:${JSON.stringify(sheetName)}!${cell.address}`,
              String(value)
            );
          }
        });
      }
    }
    if ((reader.model?.sheets?.length ?? 0) > 50) {
      fail("XLSX 超过 50 张工作表。");
    }
    return out.finish();
  }
  fail("文档格式不受支持。");
}
(async () => {
  try {
    const result = await parse(Buffer.from(workerData.bytes), workerData.mime);
    parentPort.postMessage({ extraction: result, ok: true });
  } catch (error) {
    const message = String(error.message || "");
    if (message === "LOCKED") {
      parentPort.postMessage({
        extraction: {
          characters: 0,
          segments: [],
          status: "locked",
          warnings: ["文件已加密，请上传本地解密后的副本。"],
        },
        ok: true,
      });
    } else {
      parentPort.postMessage({
        error:
          error instanceof ParseLimitError
            ? message.slice(0, 180)
            : "文档读取失败：格式损坏或超出解析预算，请另存为支持的格式。",
        ok: false,
      });
    }
  }
})();
