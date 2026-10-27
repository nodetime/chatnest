import { isProtectedResultTable, parseResultTable } from "./result-table";
import type { Document } from "./types";

export type LibraryEntry = {
  id: string;
  title: string;
  kind: Document["kind"];
  createdAt: string;
  chatId: string | null;
};

export function projectLibraryEntry(document: Document): LibraryEntry | null {
  const table = parseResultTable(document.content);
  if (isProtectedResultTable(document.content) && !table) {
    return null;
  }
  return {
    chatId: table?.chatId ?? null,
    createdAt: document.createdAt.toISOString(),
    id: document.id,
    kind: document.kind,
    title: document.title,
  };
}
