import { ExternalLink } from "lucide-react";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/_components/ui/sheet";
import {
  cellText,
  type ResultTable,
  resolvePointer,
  safeSourceUrl,
} from "@/lib/artifacts/result-table";

/** Actual declared columns are the reading layer; the immutable row stays inspectable. */
export function ResultTableRowDetails({
  table,
  index,
}: {
  table: ResultTable;
  index: number;
}) {
  const row = table.rows[index];
  const titleColumn =
    table.columns.find((column) => /\/(?:title|name)$/i.test(column.path)) ??
    table.columns[0];
  const titleValue = titleColumn
    ? resolvePointer(row, titleColumn.path)
    : undefined;
  const title =
    typeof titleValue === "string" || typeof titleValue === "number"
      ? String(titleValue)
      : "";
  return (
    <>
      <SheetHeader>
        <SheetTitle className="break-words pr-6 text-xl">
          {title || `结果 · 第 ${index + 1} 行`}
        </SheetTitle>
        <SheetDescription>
          工具返回 · 未核验。字段值保持原样，不代表网页核验或法律结论。
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-6 px-6 pb-6">
        <dl className="divide-y divide-border/60">
          {table.columns.map((column) => {
            const value = resolvePointer(row, column.path);
            const url = safeSourceUrl(value);
            return (
              <div className="space-y-1.5 py-3 first:pt-0" key={column.path}>
                <dt className="text-xs text-muted-foreground">
                  {column.label}
                </dt>
                <dd className="break-words whitespace-pre-wrap text-sm leading-6">
                  {url ? (
                    <a
                      className="inline-flex max-w-full items-center gap-1.5 break-all underline-offset-4 hover:underline"
                      href={url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {cellText(value)}
                      <ExternalLink className="size-3.5 shrink-0" />
                    </a>
                  ) : (
                    cellText(value)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        <details className="border-t border-border/60 pt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            技术详情
          </summary>
          <dl className="mt-4 space-y-2 break-all text-xs text-muted-foreground">
            <dt>来源调用</dt>
            <dd className="font-mono text-foreground">
              {table.source.toolCallId}
            </dd>
            <dt>来源时间</dt>
            <dd>
              {table.source.completedAt} ({table.source.timeBasis})
            </dd>
          </dl>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-4 text-xs leading-6">
            {JSON.stringify(row, null, 2)}
          </pre>
        </details>
      </div>
    </>
  );
}
