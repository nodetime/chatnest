import { type ResultTable, resultRows } from "@/lib/artifacts/result-table";

// Bound generic previews so the conversation stays primary. Result previews
// show up to four filtered rows plus the 38px header and 1px bottom border.
export function documentPreviewLayout(table: ResultTable | null) {
  if (!table) {
    return { height: 128, showFade: true };
  }
  const rowCount = resultRows(table, table.view).length;
  return {
    height: 38 + Math.max(2, Math.min(4, rowCount)) * 38 + 1,
    showFade: rowCount > 4,
  };
}
