import { parse } from "papaparse";

function readSheetCells(content: string | null): string[][] | null {
  if (!content?.trim()) {
    return null;
  }
  const { data, errors } = parse<string[]>(content, {
    delimiter: ",",
    skipEmptyLines: true,
  });
  const width = data[0]?.length ?? 0;
  return errors.length === 0 &&
    width > 0 &&
    data.every((row) => row.length === width)
    ? data
    : null;
}

/** Reject shifted columns or broken quoting without rewriting source values. */
export function isValidSheetCsv(content: string | null): boolean {
  return readSheetCells(content) !== null;
}

/** Compare full snapshots by exact cell values, independent of CSV quoting. */
export function sheetCsvMatches(expected: string, saved: string): boolean {
  const expectedRows = readSheetCells(expected);
  const savedRows = readSheetCells(saved);
  return (
    expectedRows !== null &&
    savedRows !== null &&
    expectedRows.length === savedRows.length &&
    expectedRows.every(
      (row, index) =>
        row.length === savedRows[index].length &&
        row.every((cell, column) => cell === savedRows[index][column])
    )
  );
}
