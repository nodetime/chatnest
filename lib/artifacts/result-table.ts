import { z } from "zod";
import type { ResultEvidenceLedger } from "../agent/result-evidence";

const forbidden = new Set(["__proto__", "prototype", "constructor"]);
export function pointerTokens(pointer: string): string[] {
  if (pointer === "") {
    return [];
  }
  if (!pointer.startsWith("/") || pointer.length > 1024) {
    throw new Error("Invalid JSON Pointer");
  }
  return pointer
    .slice(1)
    .split("/")
    .map((token) => {
      if (/~(?:[^01]|$)/.test(token)) {
        throw new Error("Invalid JSON Pointer escape");
      }
      const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
      if (forbidden.has(key)) {
        throw new Error("Unsafe JSON Pointer field");
      }
      return key;
    });
}
export function resolvePointer(value: unknown, pointer: string): unknown {
  let current = value;
  for (const key of pointerTokens(pointer)) {
    if (
      Array.isArray(current) &&
      (!/^(0|[1-9]\d*)$/.test(key) ||
        !Number.isSafeInteger(Number(key)) ||
        Number(key) >= current.length)
    ) {
      throw new Error("Invalid JSON Pointer array index");
    }
    if (
      !current ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    ) {
      return;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
const pointerSchema = z
  .string()
  .max(1024)
  .refine((value) => {
    try {
      pointerTokens(value);
      return true;
    } catch {
      return false;
    }
  }, "Invalid JSON Pointer");
export const resultColumnSchema = z
  .object({ label: z.string().min(1).max(120).optional(), path: pointerSchema })
  .strict();
export const createResultTableSchema = z
  .object({
    columns: z.array(resultColumnSchema).min(1).max(30).optional(),
    rowsPath: pointerSchema,
    sourceToolCallId: z.string().min(1).max(200),
    title: z.string().trim().min(1).max(200),
  })
  .strict();
export const resultSourceSchema = z
  .object({
    completedAt: z.iso.datetime(),
    serverId: z.string().min(1).max(200),
    serverName: z.string().min(1).max(200),
    timeBasis: z.enum(["tool-completed", "message-recorded"]),
    toolCallId: z.string().min(1).max(200),
    toolName: z.string().min(1).max(200),
  })
  .strict();
export type ResultSource = z.infer<typeof resultSourceSchema>;
export const resultViewSchema = z
  .object({
    filter: z.string().max(500),
    sort: z
      .array(
        z
          .object({ direction: z.enum(["ASC", "DESC"]), path: pointerSchema })
          .strict()
      )
      .max(3),
    visibleColumns: z.array(pointerSchema).max(30),
  })
  .strict();
export type ResultView = z.infer<typeof resultViewSchema>;
const resultTableSchema = z
  .object({
    chatId: z.string().min(1).max(200),
    columns: z
      .array(
        z
          .object({ label: z.string().min(1).max(120), path: pointerSchema })
          .strict()
      )
      .max(30),
    notes: z.string().max(10_000),
    rows: z
      .array(
        z.custom<Record<string, unknown>>(
          (value) =>
            !!value && typeof value === "object" && !Array.isArray(value)
        )
      )
      .max(500),
    rowsPath: pointerSchema,
    source: resultSourceSchema,
    type: z.literal("result-table"),
    version: z.literal(1),
    view: resultViewSchema,
  })
  .strict();
export type ResultTable = z.infer<typeof resultTableSchema>;
export function isProtectedResultTable(
  content: string | null | undefined
): boolean {
  if (!content) {
    return false;
  }
  try {
    const parsed = JSON.parse(content);
    return parsed?.type === "result-table";
  } catch {
    for (const match of content.matchAll(
      /("(?:\\.|[^"\\])*")\s*:\s*("(?:\\.|[^"\\])*")/g
    )) {
      try {
        if (
          JSON.parse(match[1]) === "type" &&
          JSON.parse(match[2]) === "result-table"
        ) {
          return true;
        }
      } catch {
        /* malformed string pairs are not a discriminator */
      }
    }
    return false;
  }
}
export function parseResultTable(
  content: string | null | undefined
): ResultTable | null {
  if (!content || new TextEncoder().encode(content).byteLength > 1024 * 1024) {
    return null;
  }
  try {
    const parsed = resultTableSchema.safeParse(JSON.parse(content));
    return parsed.success && validView(parsed.data, parsed.data.view)
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}
export function validView(table: ResultTable, view: ResultView): boolean {
  const paths = new Set(table.columns.map((c) => c.path));
  return (
    new Set(view.visibleColumns).size === view.visibleColumns.length &&
    view.visibleColumns.every((p) => paths.has(p)) &&
    view.sort.every((s) => paths.has(s.path))
  );
}
export function buildResultTable(
  ledger: ResultEvidenceLedger,
  input: z.infer<typeof createResultTableSchema>,
  chatId: string
): ResultTable {
  const parsed = createResultTableSchema.parse(input);
  const entry = ledger.get(parsed.sourceToolCallId);
  if (!entry) {
    throw new Error(
      "Source unavailable: choose a recent successful JSON MCP output; outputs over 2 MiB are not eligible."
    );
  }
  const rows = resolvePointer(entry.value, parsed.rowsPath);
  if (
    !Array.isArray(rows) ||
    rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))
  ) {
    throw new Error(
      "rowsPath must select an array of objects from the original MCP JSON."
    );
  }
  if (rows.length > 500) {
    throw new Error("Result table limit is 500 rows; no rows were copied.");
  }
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const columns =
    parsed.columns ??
    fields.map((key) => ({
      label: key,
      path: `/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
    }));
  if (columns.length > 30) {
    throw new Error(
      "Result table limit is 30 columns; select original fields explicitly."
    );
  }
  if (new Set(columns.map((c) => c.path)).size !== columns.length) {
    throw new Error("Duplicate column paths");
  }
  // Validate every pointer against actual arrays, even where a field is absent in other rows.
  for (const column of columns) {
    for (const row of rows) {
      resolvePointer(row, column.path);
    }
  }
  const normalized = columns.map((c) => ({
    label: c.label ?? pointerTokens(c.path).at(-1) ?? "value",
    path: c.path,
  }));
  const table = resultTableSchema.parse({
    chatId,
    columns: normalized,
    notes: "",
    rows: structuredClone(rows),
    rowsPath: parsed.rowsPath,
    source: entry.source,
    type: "result-table",
    version: 1,
    view: {
      filter: "",
      sort: [],
      visibleColumns: normalized.map((c) => c.path),
    },
  });
  if (
    new TextEncoder().encode(JSON.stringify(table)).byteLength >
    1024 * 1024
  ) {
    throw new Error(
      "Result table envelope exceeds 1 MiB UTF-8; no rows were copied."
    );
  }
  return table;
}
export function cellText(value: unknown): string {
  return value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() !== value || /\s/.test(value)) {
    return null;
  }
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}
export function resultRows(table: ResultTable, view: ResultView = table.view) {
  const filter = view.filter.toLocaleLowerCase();
  const rows = table.rows
    .map((raw, sourceIndex) => ({ raw, sourceIndex }))
    .filter(
      ({ raw }) =>
        !filter ||
        table.columns.some((c) =>
          cellText(resolvePointer(raw, c.path))
            .toLocaleLowerCase()
            .includes(filter)
        )
    );
  return rows.sort((a, b) => {
    for (const sort of view.sort) {
      const av = resolvePointer(a.raw, sort.path),
        bv = resolvePointer(b.raw, sort.path);
      if (av === null || av === undefined || bv === null || bv === undefined) {
        if (
          (av === null || av === undefined) &&
          bv !== null &&
          bv !== undefined
        ) {
          return 1;
        }
        if (
          av !== null &&
          av !== undefined &&
          (bv === null || bv === undefined)
        ) {
          return -1;
        }
        continue;
      }
      const comparison =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : cellText(av).localeCompare(cellText(bv), undefined, {
              numeric: true,
            });
      if (comparison) {
        return sort.direction === "ASC" ? comparison : -comparison;
      }
    }
    return a.sourceIndex - b.sourceIndex;
  });
}
export function resultCsv(
  table: ResultTable,
  view: ResultView = table.view
): string {
  const columns = table.columns.filter((c) =>
    view.visibleColumns.includes(c.path)
  );
  const escapeCsvCell = (value: unknown) => {
    let text = cellText(value);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: CSV injection includes leading control characters.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) {
      text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [
    columns.map((c) => escapeCsvCell(c.label)).join(","),
    ...resultRows(table, view).map(({ raw }) =>
      columns.map((c) => escapeCsvCell(resolvePointer(raw, c.path))).join(",")
    ),
  ].join("\r\n");
}

export class ResultTableMutationError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function withResultTableView(
  table: ResultTable,
  view: ResultView,
  notes: string
): ResultTable {
  const parsed = resultViewSchema.safeParse(view);
  if (
    !parsed.success ||
    !validView(table, parsed.data) ||
    typeof notes !== "string" ||
    notes.length > 10_000
  ) {
    throw new ResultTableMutationError(400, "Invalid view or notes");
  }
  const result = parseResultTable(
    JSON.stringify({ ...table, notes, view: parsed.data })
  );
  if (!result) {
    throw new ResultTableMutationError(
      400,
      "Updated result table exceeds the 1 MiB envelope budget"
    );
  }
  return result;
}

export function assertGenericDocumentDeletionAllowed(
  contents: (string | null | undefined)[]
): void {
  if (contents.some(isProtectedResultTable)) {
    throw new ResultTableMutationError(
      403,
      "Result table history is immutable; generic version deletion is not allowed."
    );
  }
}
