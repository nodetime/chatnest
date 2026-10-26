// biome-ignore-all lint/performance/noAwaitInLoops: Parser admission intentionally rejects concurrency; these assertions must run sequentially.
// biome-ignore-all lint/suspicious/useAwait: Async injected resolvers intentionally use no external I/O.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const id = "11111111-1111-4111-8111-111111111111";
test("document parser extracts bounded UTF8 line refs and CSV row refs in isolated worker", async () => {
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const txt = await parseDocument(Buffer.from("第一行\n第二行"), "text/plain");
  assert.equal(txt.status, "ready");
  assert.deepEqual(
    txt.segments.map((s) => s.ref),
    ["line:1", "line:2"]
  );
  assert.equal(txt.segments[1].text, "第二行");
  const csv = await parseDocument(
    Buffer.from('name,note\n"测试","a\nb"'),
    "text/csv"
  );
  assert.deepEqual(
    csv.segments.map((s) => s.ref),
    ["row:1", "row:2"]
  );
  assert.equal(JSON.parse(csv.segments[1].text)[1], "a\nb");
  await assert.rejects(
    () => parseDocument(Buffer.from([0xff]), "text/plain"),
    /UTF|文本/
  );
});
test("documents support nonvision model and preview is serialized untrusted bounded source not bytes", async () => {
  const { prepareAttachmentContext } = await import("@/server/uploads/context");
  const source = {
    characters: 3004,
    segments: [{ ref: "paragraph:1", text: `文档正文${"x".repeat(3000)}` }],
    status: "ready" as const,
    warnings: [],
  };
  const msg = {
    parts: [
      { mediaType: "application/pdf", type: "file", url: `/api/files/${id}` },
    ],
  };
  const out = await prepareAttachmentContext(
    [msg],
    false,
    async () => ({
      bytes: Buffer.from("NOT MODEL"),
      extraction: source,
      mime: "application/pdf",
      name: "source.pdf",
      size: 9,
    }),
    false
  );
  const part = out[0].parts[0] as unknown as { type: string; text: string };
  assert.equal(part.type, "text");
  assert.match(part.text, /UNTRUSTED/);
  assert.match(part.text, /preview/);
  assert.match(part.text, /paragraph:1/);
  assert.ok(part.text.length < 4000);
  assert.ok(!part.text.includes("NOT MODEL"));
  assert.ok(!part.text.includes("/api/files"));
  assert.equal(msg.parts[0].type, "file");
});
test("readAttachment reauthorizes every call and enforces percall and round text limits", async () => {
  const { createAttachmentReader } = await import(
    "@/server/uploads/read-attachment"
  );
  let checks = 0;
  const reader = createAttachmentReader(async (assetId) => {
    checks += 1;
    assert.equal(assetId, id);
    return {
      extraction: {
        characters: 200_000,
        segments: Array.from({ length: 200 }, (_, i) => ({
          ref: `line:${i + 1}`,
          text: "x".repeat(1000),
        })),
        status: "ready",
        warnings: [],
      },
      mime: "text/plain",
      name: "test",
    };
  });
  const one = await reader({ assetId: id, limit: 100, startSegment: 0 });
  assert.ok(one.characters <= 16_000);
  assert.equal(one.nextSegment, 16);
  assert.equal(one.segments.length, 16);
  for (let i = 0; i < 5; i += 1) {
    await reader({ assetId: id, limit: 100, startSegment: 16 });
  }
  const last = await reader({ assetId: id, limit: 100, startSegment: 16 });
  assert.equal(last.characters, 4000);
  assert.equal(checks, 7);
  await assert.rejects(
    () => reader({ assetId: id, limit: 1, startSegment: 0 }),
    /预算|budget/
  );
});
test("production worker is standalone traced JS and no app environment is forwarded", async () => {
  const parser = await readFile("server/uploads/document-parser.ts", "utf8");
  const config = await readFile("next.config.ts", "utf8");
  assert.match(parser, /execArgv:\s*\[\]/);
  assert.match(parser, /resourceLimits/);
  assert.ok(!parser.includes("...process.env"));
  assert.match(config, /document-worker.cjs/);
});
function zip(
  entries: [string, string | Buffer][],
  deflate?: (data: Buffer) => Buffer
) {
  const locals: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value),
      n = Buffer.from(name);
    let crc = 0xff_ff_ff_ff;
    for (const b of data) {
      crc ^= b;
      for (let i = 0; i < 8; i += 1) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xed_b8_83_20 : 0);
      }
    }
    crc = (crc ^ 0xff_ff_ff_ff) >>> 0;
    const packed = deflate ? deflate(data) : data;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04_03_4b_50);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc, 14);
    h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(packed.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(n.length, 26);
    locals.push(h, n, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02_01_4b_50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += h.length + n.length + packed.length;
  }
  const cd = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
function docx(body: string, extra: [string, string | Buffer][] = []) {
  return zip([
    [
      "[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      "word/document.xml",
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`,
    ],
    ...extra,
  ]);
}
function pdf(pages: string[]) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  for (const text of pages) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${objects.length + 2} 0 R >>`
    );
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    );
  }
  let data = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(data.length);
    data += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const start = data.length;
  data +=
    `xref\n0 ${offsets.length}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(data);
}
test("PDF page refs and scan/locked states are explicit", async () => {
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const out = await parseDocument(
    pdf(["first", "second", ""]),
    "application/pdf"
  );
  assert.equal(out.status, "ready");
  assert.equal(out.segments[1].ref, "page:2");
  assert.match(out.segments[1].text, /second/);
  assert.match(out.warnings.join(), /page:3/);
  const scan = await parseDocument(pdf([""]), "application/pdf");
  assert.equal(scan.status, "no_extractable_text");
  const locked = await parseDocument(
    Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  assert.equal(locked.status, "locked");
});
test("DOCX keeps Chinese paragraph/table refs without fictional pages or external image fetch", async () => {
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const out = await parseDocument(
    docx(
      "<w:p><w:r><w:t>中文段落</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格内容</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"
    ),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  assert.equal(out.status, "ready");
  assert.equal(out.segments[0].text, "中文段落");
  assert.match(out.segments[1].ref, /table:1:row:1:cell:1:paragraph/);
  assert.ok(!out.segments.some((s) => s.ref.startsWith("page:")));
});
test("XLSX streaming retains sheet, sparse cell, date and cached formula values only", async () => {
  const Excel = await import("exceljs");
  const book = new Excel.default.Workbook();
  const first = book.addWorksheet("商品");
  first.getCell("A1").value = "中文商品";
  first.getCell("D8").value = 42;
  first.getCell("E9").value = new Date("2026-10-21T00:00:00Z");
  first.getCell("E10").value = { formula: "D8*2", result: 84 };
  first.getCell("E11").value = {
    formula: 'WEBSERVICE("http://never.example")',
  };
  book.addWorksheet("库存").getCell("B2").value = "仓库";
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const out = await parseDocument(
    Buffer.from(await book.xlsx.writeBuffer()),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  assert.equal(out.status, "ready");
  assert.ok(
    out.segments.some((s) => s.ref === 'sheet:"商品"!D8' && s.text === "42")
  );
  assert.ok(
    out.segments.some(
      (s) => s.ref.endsWith("!E9") && s.text.includes("2026-10-21")
    )
  );
  assert.ok(
    out.segments.some((s) => s.ref.endsWith("!E10") && s.text === "84")
  );
  assert.ok(out.segments.some((s) => s.ref.includes("库存")));
  assert.ok(!out.segments.some((s) => s.text.includes("WEBSERVICE")));
});
test("ZIP preflight rejects traversal duplicate DTD macros corruption and declared inflate budgets", async () => {
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const mime =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  for (const bytes of [
    zip([["../bad.xml", "x"]]),
    zip([
      ["a.xml", "x"],
      ["a.xml", "y"],
    ]),
    docx("<!DOCTYPE bad>"),
    zip([["word/vbaProject.bin", "x"]]),
    Buffer.from("PK damaged"),
  ]) {
    await assert.rejects(() => parseDocument(bytes, mime));
  }
  const large = zip([["huge.xml", "x"]]);
  large.writeUInt32LE(33 * 1024 * 1024, 22);
  const c = large.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  large.writeUInt32LE(33 * 1024 * 1024, c + 24);
  await assert.rejects(() => parseDocument(large, mime));
});
test("text output truncation and busy parser admission are explicit", async () => {
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const running = parseDocument(
    Buffer.from("x".repeat(1_000_020)),
    "text/plain"
  );
  await assert.rejects(
    () => parseDocument(Buffer.from("x"), "text/plain"),
    /繁忙/
  );
  const out = await running;
  assert.equal(out.status, "truncated");
  assert.equal(out.characters, 1_000_000);
  assert.ok(out.warnings.length);
});
test("documents persist quota-accounted extraction and read tool checks actual committed association", async () => {
  const service = await readFile("server/uploads/service.ts", "utf8");
  const schema = await readFile(
    "server/infrastructure/persistence/drizzle/schema.ts",
    "utf8"
  );
  // P2:chat 编排迁 application/chat/send-message.ts
  const useCase = await readFile(
    "server/application/chat/send-message.ts",
    "utf8"
  );
  assert.match(service, /derivedBytes/);
  assert.match(service, /readAttachmentAsset/);
  assert.match(service, /asset\.associated/);
  assert.match(schema, /derivedBytes/);
  assert.match(useCase, /readAttachmentTool/);
  assert.match(useCase, /supportsTools\s*,/);
});
test("composer admits documents without vision and exposes truthful reading/error/retry states", async () => {
  const composer = await readFile(
    "app/_components/chat/multimodal-input.tsx",
    "utf8"
  );
  const preview = await readFile(
    "app/_components/chat/preview-attachment.tsx",
    "utf8"
  );
  const menu = await readFile("app/_components/chat/composer-menu.tsx", "utf8");
  const admin = await readFile(
    "app/_components/admin/admin-storage.tsx",
    "utf8"
  );
  assert.match(composer, /ATTACHMENT_ACCEPT/);
  assert.match(composer, /isImageMime\(.*contentType/);
  assert.match(preview, /extractionLabels/);
  assert.match(preview, /onRetry/);
  assert.match(menu, /DOCX/);
  assert.ok(!admin.includes("当前不支持\n            PDF"));
});
test("private originals above image limit are stream-verified and canonical actual images still require vision", async () => {
  const { LocalUploadStore } = await import("@/server/uploads/local-store");
  const { mkdtemp, rm, realpath } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createHash } = await import("node:crypto");
  const dir = await realpath(await mkdtemp(join(tmpdir(), "document-store-")));
  try {
    const store = new LocalUploadStore(dir);
    const bytes = Buffer.alloc(6 * 1024 * 1024, 1);
    await store.write(id, bytes);
    assert.deepEqual(await store.read(id, bytes.length), bytes);
    await store.verify(
      id,
      bytes.length,
      createHash("sha256").update(bytes).digest("hex")
    );
    await assert.rejects(() => store.verify(id, bytes.length, "bad"));
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
  const { prepareAttachmentContext } = await import("@/server/uploads/context");
  await assert.rejects(
    () =>
      prepareAttachmentContext(
        [
          {
            parts: [
              {
                mediaType: "application/pdf",
                type: "file",
                url: `/api/files/${id}`,
              },
            ],
          },
        ],
        false,
        async () => ({
          bytes: Buffer.from("x"),
          mime: "image/png",
          name: "x",
          size: 1,
        })
      ),
    /视觉|图片/
  );
});
test("ZIP local headers cannot disagree with preflight central names or hide extra unindexed entries", async () => {
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const mime =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const bad = zip([["innocent.txt", "<!DOCTYPE x>"]]);
  const name = Buffer.from("evilxxxx.xml");
  name.copy(bad, 30);
  await assert.rejects(() => parseDocument(bad, mime));
  // Valid DOCX plus an unindexed local ZIP entry before the central directory.
  const good = docx("<w:p><w:r><w:t>x</w:t></w:r></w:p>");
  const single = zip([["hidden.xml", "<!DOCTYPE x>"]]);
  const singleEnd = single.readUInt32LE(single.length - 6);
  const centralStart = good.readUInt32LE(good.length - 6);
  const hidden = Buffer.concat([
    good.subarray(0, centralStart),
    single.subarray(0, singleEnd),
    good.subarray(centralStart),
  ]);
  hidden.writeUInt32LE(centralStart + singleEnd, hidden.length - 6);
  await assert.rejects(() =>
    parseDocument(
      hidden,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
  );
});
test("cheap storage enabled/ownership/quota admission precedes expensive document parsing", async () => {
  const source = await readFile("server/uploads/service.ts", "utf8");
  const start = source.indexOf("export async function registerUpload");
  const body = source.slice(start);
  assert.ok(
    body.indexOf("await preflightUpload") >= 0 &&
      body.indexOf("await preflightUpload") <
        body.indexOf("await file.arrayBuffer")
  );
  assert.ok(
    body.indexOf("await preflightUpload") < body.indexOf("await parseDocument")
  );
});
test("worker hard deadline terminates CPU work without blocking loop and cleans private temp on timeout/exit", async () => {
  const { runParserWorker } = await import("@/server/uploads/document-parser");
  const { mkdtemp, rm, writeFile, stat } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "parser-probe-"));
  // Concurrent application/test processes legitimately own other scratch directories.
  // Capture and assert only each worker's reported TMPDIR, never a global inventory.
  const marker = join(dir, "scratch-path");
  const report = `require('node:fs').writeFileSync(${JSON.stringify(marker)},process.env.TMPDIR);`;
  const assertOwnScratchRemoved = async () => {
    const scratch = await readFile(marker, "utf8");
    assert.ok(scratch.includes("chatnest-document-"));
    await assert.rejects(() => stat(scratch), { code: "ENOENT" });
  };
  try {
    const worker = join(dir, "worker.cjs");
    await writeFile(worker, `${report}while(true){}`);
    let responsive = false;
    setTimeout(() => {
      responsive = true;
    }, 5);
    await assert.rejects(
      () =>
        runParserWorker(Buffer.from("x"), "text/plain", {
          deadlineMs: 1000,
          workerFile: worker,
        }),
      /超时/
    );
    assert.equal(responsive, true);
    await assertOwnScratchRemoved();
    await writeFile(worker, `${report}process.exit(0)`);
    await assert.rejects(
      () =>
        runParserWorker(Buffer.from("x"), "text/plain", {
          deadlineMs: 5000,
          workerFile: worker,
        }),
      /终止/
    );
    await assertOwnScratchRemoved();
    await writeFile(
      worker,
      `const {parentPort}=require('node:worker_threads');const {statSync}=require('node:fs');parentPort.postMessage({ok:true,extraction:{status:'ready',characters:0,warnings:[],segments:[{ref:'env',text:JSON.stringify({directory:process.env.TMPDIR,keys:Object.keys(process.env).sort(),mode:statSync(process.env.TMPDIR).mode&511})}]}});`
    );
    const result = await runParserWorker(Buffer.from("x"), "text/plain", {
      deadlineMs: 5000,
      workerFile: worker,
    });
    const env = JSON.parse(result.segments[0].text);
    assert.equal(env.mode, 0o700);
    assert.deepEqual(env.keys, ["NODE_ENV", "TEMP", "TMP", "TMPDIR"]);
    await assert.rejects(() => stat(env.directory), { code: "ENOENT" });
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
test("XLSX absolute OOXML worksheet relationship targets retain real sheet names", async () => {
  const mime =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const bytes = zip([
    [
      "xl/worksheets/sheet1.xml",
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>测试</t></is></c></row></sheetData></worksheet>',
    ],
    [
      "[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    ],
    [
      "xl/workbook.xml",
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="中文工作表" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1"/></Relationships>',
    ],
  ]);
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const out = await parseDocument(bytes, mime);
  assert.equal(out.segments[0].ref, 'sheet:"中文工作表"!A1');
});
test("historical attachment reads keep canonical UI data but do not replay unbounded source text to model", async () => {
  const { prepareAttachmentContext } = await import("@/server/uploads/context");
  const original = {
    parts: [
      {
        input: { assetId: id },
        output: {
          assetId: id,
          characters: 16_000,
          name: "文档",
          segments: [{ ref: "line:1", text: "HISTORIC_RAW_SENTINEL" }],
          status: "ready",
        },
        state: "output-available",
        toolCallId: "call",
        toolName: "readAttachment",
        type: "dynamic-tool",
      },
    ],
  };
  const out = await prepareAttachmentContext([original], false, async () => {
    throw new Error("no file read");
  });
  assert.ok(!JSON.stringify(out).includes("HISTORIC_RAW_SENTINEL"));
  assert.ok(JSON.stringify(original).includes("HISTORIC_RAW_SENTINEL"));
  assert.match(JSON.stringify(out), /HISTORICAL_ATTACHMENT_READ_METADATA/);
});
test("Node worker construction bypasses browser-worker bundler rewriting; CJS still explicitly traced", async () => {
  const source = await readFile("server/uploads/document-parser.ts", "utf8");
  assert.match(source, /Reflect\.construct\(Worker/);
  assert.ok(!source.includes("new Worker("));
});
test("repeated document references do not duplicate source preview budget", async () => {
  const { prepareAttachmentContext } = await import("@/server/uploads/context");
  const message = {
    parts: [{ mediaType: "text/plain", type: "file", url: `/api/files/${id}` }],
  };
  const result = await prepareAttachmentContext(
    [message, message],
    false,
    async () => ({
      extraction: {
        characters: 3000,
        segments: [{ ref: "line:1", text: "x".repeat(3000) }],
        status: "ready",
        warnings: [],
      },
      mime: "text/plain",
      name: "x.txt",
      size: 3,
    })
  );
  const sources = result.map((m) =>
    JSON.parse((m.parts[0] as unknown as { text: string }).text)
  );
  assert.equal(
    sources.reduce(
      (count, s) =>
        count +
        s.preview.reduce(
          (n: number, p: { text: string }) => n + p.text.length,
          0
        ),
      0
    ),
    2000
  );
});
test("external DOCX image/hyperlink relationships are never fetched and source HTML is never returned", async () => {
  const { createServer } = await import("node:http");
  let calls = 0;
  const server = createServer((_req, res) => {
    calls += 1;
    res.end("EXTERNAL_SECRET_SENTINEL");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/private.png`;
    const bytes = docx(
      '<w:p><w:hyperlink r:id="rLink"><w:r><w:t>外链标题</w:t></w:r></w:hyperlink><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:link="rImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>',
      [
        [
          "word/_rels/document.xml.rels",
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${url}" TargetMode="External"/><Relationship Id="rLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${url}" TargetMode="External"/></Relationships>`,
        ],
      ]
    );
    const { parseDocument } = await import("@/server/uploads/document-parser");
    const out = await parseDocument(
      bytes,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    assert.equal(out.segments[0].text, "外链标题");
    assert.equal(calls, 0);
    assert.ok(!JSON.stringify(out).includes("EXTERNAL_SECRET_SENTINEL"));
    assert.ok(!JSON.stringify(out).includes("<a "));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
test("ZIP entries and actual inflated XML totals enforce independent hard budgets", async () => {
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const { deflateRawSync } = await import("node:zlib");
  const mime =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  await assert.rejects(
    () =>
      parseDocument(
        zip(
          Array.from({ length: 4097 }, (_, i) => [`e${i}.bin`, Buffer.alloc(0)])
        ),
        mime
      ),
    /4096/
  );
  const xml = Buffer.alloc(22 * 1024 * 1024, 120);
  const compressed = zip(
    [
      ["a.xml", xml],
      ["b.xml", xml],
      ["c.xml", xml],
    ],
    deflateRawSync
  );
  assert.ok(compressed.length < 100_000);
  await assert.rejects(() => parseDocument(compressed, mime), /XML/);
  const declared = zip([["huge.bin", "x"]], deflateRawSync);
  const c = declared.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  declared.writeUInt32LE(129 * 1024 * 1024, 22);
  declared.writeUInt32LE(129 * 1024 * 1024, c + 24);
  await assert.rejects(() => parseDocument(declared, mime), /128 MiB/);
  const xmlDeclared = zip([["huge.xml", "x"]], deflateRawSync);
  const xc = xmlDeclared.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  xmlDeclared.writeUInt32LE(33 * 1024 * 1024, 22);
  xmlDeclared.writeUInt32LE(33 * 1024 * 1024, xc + 24);
  await assert.rejects(() => parseDocument(xmlDeclared, mime), /32 MiB/);
  const falseSize = zip([["lie.bin", "x".repeat(200_000)]], deflateRawSync);
  const lc = falseSize.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  falseSize.writeUInt32LE(1, 22);
  falseSize.writeUInt32LE(1, lc + 24);
  await assert.rejects(() => parseDocument(falseSize, mime));
});
test("page count and XLSX sheet/cell count budgets reject before claiming ready", async () => {
  const { parseDocument } = await import("@/server/uploads/document-parser");
  await assert.rejects(
    () =>
      parseDocument(
        pdf(Array.from({ length: 301 }, () => "")),
        "application/pdf"
      ),
    /300/
  );
  const Excel = await import("exceljs");
  const book = new Excel.default.Workbook();
  for (let i = 0; i < 51; i += 1) {
    book.addWorksheet(`s${i}`).getCell("A1").value = "x";
  }
  await assert.rejects(
    async () =>
      parseDocument(
        Buffer.from(await book.xlsx.writeBuffer()),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ),
    /50/
  );
  const sheet =
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    Array.from(
      { length: 100_001 },
      (_, i) =>
        `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>x</t></is></c></row>`
    ).join("") +
    "</sheetData></worksheet>";
  const bytes = zip([
    [
      "[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    ],
    [
      "xl/workbook.xml",
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="test" sheetId="1" r:id="r1"/></sheets></workbook>',
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ],
    ["xl/worksheets/sheet1.xml", sheet],
  ]);
  await assert.rejects(
    () =>
      parseDocument(
        bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ),
    /100,000/
  );
});
test("macro terminology in ordinary document text does not become package macro detection", async () => {
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const result = await parseDocument(
    docx(
      "<w:p><w:r><w:t>Explain vbaProject.bin and macroEnabled documents</w:t></w:r></w:p>"
    ),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  assert.equal(result.status, "ready");
  assert.match(result.segments[0].text, /vbaProject.bin/);
});
test("valid single-column/single-cell CSV defaults to comma instead of treating delimiter warning as failure", async () => {
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const rows = await parseDocument(Buffer.from("name\nalice\nbob"), "text/csv");
  assert.equal(rows.segments.length, 3);
  assert.equal(JSON.parse(rows.segments[1].text)[0], "alice");
  const one = await parseDocument(Buffer.from("hello"), "text/csv");
  assert.equal(one.status, "ready");
  await assert.rejects(
    () => parseDocument(Buffer.from('name,note\n"bad,quote'), "text/csv"),
    /CSV/
  );
});
test("all actual worksheet relationship targets are read or explicitly rejected, never silently omitted", async () => {
  const entries: [string, string | Buffer][] = [
    [
      "[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    ],
    [
      "xl/workbook.xml",
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="普通" sheetId="1" r:id="r1"/><sheet name="自定义" sheetId="2" r:id="r2"/></sheets></workbook>',
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/custom.xml"/></Relationships>',
    ],
    ...["sheet1.xml", "custom.xml"].map(
      (name, i) =>
        [
          `xl/worksheets/${name}`,
          `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>text${i}</t></is></c></row></sheetData></worksheet>`,
        ] as [string, string]
    ),
  ];
  const { parseDocument } = await import("@/server/uploads/document-parser");
  const mime =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const result = await parseDocument(zip(entries), mime);
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[1].ref, 'sheet:"自定义"!A1');
  assert.equal(result.segments[1].text, "text1");
  await assert.rejects(() =>
    parseDocument(
      zip(entries.filter((e) => !e[0].endsWith("custom.xml"))),
      mime
    )
  );
});
test("Next proxy buffers the bounded document multipart envelope without changing application raw limits", async () => {
  const config = await readFile("next.config.ts", "utf8");
  assert.match(config, /proxyClientMaxBodySize:\s*"65mb"/);
  const { MAX_REQUEST_BYTES, MAX_FILE_BYTES } = await import(
    "@/server/uploads/validation"
  );
  const { MAX_DOCUMENT_BYTES } = await import(
    "@/server/uploads/document-types"
  );
  assert.equal(MAX_FILE_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_DOCUMENT_BYTES, 64 * 1024 * 1024);
  assert.ok(MAX_REQUEST_BYTES < 65 * 1024 * 1024);
});
test("production config traces standalone worker transitive runtime rather than only top package globs", async () => {
  const config = await readFile("next.config.ts", "utf8");
  assert.match(config, /@vercel\/nft/);
  assert.match(config, /PHASE_PRODUCTION_BUILD/);
  assert.match(config, /nodeFileTrace/);
  assert.match(config, /@napi-rs\/canvas/);
});
test("round source budget is shared across assets and seeded by actual deduplicated preview characters", async () => {
  const { AttachmentRoundBudget } = await import(
    "@/server/uploads/document-budget"
  );
  const { createAttachmentReader } = await import(
    "@/server/uploads/read-attachment"
  );
  const { prepareAttachmentContext } = await import("@/server/uploads/context");
  const budget = new AttachmentRoundBudget();
  const id2 = "22222222-2222-4222-8222-222222222222";
  const metadata = async (assetId: string) => ({
    extraction: {
      characters: 3,
      segments: [{ ref: "line:1", text: assetId === id ? "abc" : "defgh" }],
      status: "ready" as const,
      warnings: [],
    },
    mime: "text/plain",
    name: "x.txt",
    size: 3,
  });
  await prepareAttachmentContext(
    [
      {
        parts: [
          { mediaType: "text/plain", type: "file", url: `/api/files/${id}` },
          { mediaType: "text/plain", type: "file", url: `/api/files/${id2}` },
          { mediaType: "text/plain", type: "file", url: `/api/files/${id}` },
        ],
      },
    ],
    false,
    metadata,
    true,
    budget
  );
  assert.equal(budget.remainingCharacters, 99_992);
  let checks = 0;
  const reader = createAttachmentReader(async () => {
    checks += 1;
    return {
      extraction: {
        characters: 200_000,
        segments: Array.from({ length: 200 }, (_, i) => ({
          ref: `line:${i}`,
          text: "x".repeat(1000),
        })),
        status: "ready",
        warnings: [],
      },
      mime: "text/plain",
      name: "source",
    };
  }, budget);
  for (let i = 0; i < 6; i += 1) {
    const out = await reader({
      assetId: i % 2 ? id : id2,
      limit: 100,
      startSegment: 0,
    });
    assert.equal(out.characters, 16_000);
  }
  const tail = await reader({ assetId: id2, limit: 100, startSegment: 0 });
  assert.equal(tail.characters, 3000);
  assert.equal(tail.remainingRoundCharacters, 992);
  await assert.rejects(
    () => reader({ assetId: id, limit: 100, startSegment: 0 }),
    /预算/
  );
  assert.equal(checks, 8);
});
test("host native parser dependency seeds retain pnpm resolution links in Next route trace", async () => {
  const host = await readFile("server/uploads/document-parser.ts", "utf8");
  const config = await readFile("next.config.ts", "utf8");
  for (const name of ["mammoth", "exceljs", "yauzl", "saxes", "papaparse"]) {
    assert.ok(
      host.includes(`require.resolve("${name}")`),
      `${name} has native resolve seed`
    );
    assert.ok(
      config
        .slice(config.indexOf("serverExternalPackages"))
        .includes(`"${name}"`)
    );
  }
});
