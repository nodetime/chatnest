import { parse } from "papaparse";

/** Reject shifted columns or broken quoting without rewriting source values. */
export function isValidSheetCsv(content: string | null): boolean {
  if (!content?.trim()) {
    return false;
  }
  const { data, errors } = parse<string[]>(content, {
    delimiter: ",",
    skipEmptyLines: "greedy",
  });
  const width = data[0]?.length ?? 0;
  return (
    errors.length === 0 &&
    width > 0 &&
    data.every((row) => row.length === width)
  );
}
