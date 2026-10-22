// biome-ignore-all lint/performance/noJsxPropsBind: Small local view controls have explicit, scoped event handlers.
"use client";
import {
  ChevronDown,
  Columns3,
  Download,
  ExternalLink,
  ListFilter,
  Save,
  XIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useMemo, useState } from "react";
import DataGrid, { type Column, type SortColumn } from "react-data-grid";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  cellText,
  type ResultTable,
  type ResultView,
  resolvePointer,
  resultCsv,
  resultRows,
  safeSourceUrl,
} from "@/lib/artifacts/result-table";
import { ResultTableSource } from "./result-table-source";
import "react-data-grid/lib/styles.css";

type Props = {
  table: ResultTable;
  documentId?: string;
  expectedVersion?: string;
  readOnly?: boolean;
  inline?: boolean;
  onSaved?: (content: string) => Promise<void> | void;
};
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ResultTableView({
  table,
  documentId,
  expectedVersion,
  readOnly = false,
  inline = false,
  onSaved,
}: Props) {
  const { resolvedTheme } = useTheme();
  const [view, setView] = useState<ResultView>(table.view);
  const [notes, setNotes] = useState(table.notes);
  const [detail, setDetail] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    JSON.stringify(view) !== JSON.stringify(table.view) ||
    notes !== table.notes;
  const rows = useMemo(() => resultRows(table, view), [table, view]);
  const columns = useMemo<Column<(typeof rows)[number]>[]>(
    () => [
      {
        frozen: true,
        key: "__index",
        name: "#",
        renderCell: ({ row }) => row.sourceIndex + 1,
        width: 46,
      },
      ...table.columns
        .filter((column) => view.visibleColumns.includes(column.path))
        .map((column) => ({
          key: column.path,
          name: column.label,
          renderCell: ({ row }: { row: (typeof rows)[number] }) => {
            const value = resolvePointer(row.raw, column.path);
            const url = safeSourceUrl(value);
            return url ? (
              <a
                className="inline-flex max-w-full items-center gap-1 truncate text-primary underline-offset-4 hover:underline"
                href={url}
                rel="noopener noreferrer"
                target="_blank"
                title={url}
              >
                {cellText(value)}
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              <span title={cellText(value)}>{cellText(value)}</span>
            );
          },
          resizable: true,
          sortable: true,
          width: column.path.includes("title") ? 240 : 160,
        })),
    ],
    [table.columns, view.visibleColumns]
  );
  const sortColumns: SortColumn[] = view.sort.map((sort) => ({
    columnKey: sort.path,
    direction: sort.direction,
  }));
  const save = async () => {
    if (!documentId || !expectedVersion || readOnly || saving) {
      return;
    }
    setSaving(true);
    setError("");
    // IDs and expected version belong to this mounted table, never the next opened artifact.
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/document/result-table`,
        {
          body: JSON.stringify({
            chatId: table.chatId,
            expectedVersion,
            id: documentId,
            notes,
            view,
          }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? "版本已更新，请重新打开最新表格后保存。"
            : "保存失败，视图和备注尚未保存，请重试。"
        );
      }
      await onSaved?.(body[0].content);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "保存失败，请重试。"
      );
    } finally {
      setSaving(false);
    }
  };
  const toggleColumn = (path: string) =>
    setView((current) => ({
      ...current,
      visibleColumns: current.visibleColumns.includes(path)
        ? current.visibleColumns.filter((item) => item !== path)
        : table.columns
            .filter(
              (item) =>
                current.visibleColumns.includes(item.path) || item.path === path
            )
            .map((item) => item.path),
    }));
  return (
    <div
      className="flex h-full w-full min-h-0 min-w-0 flex-col bg-background"
      data-testid="result-table"
    >
      {!inline && (
        <div
          className="shrink-0 border-b border-border/50 px-3 py-2"
          data-testid="result-table-toolbar"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 basis-36 flex-1">
              <ListFilter className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
              <Input
                aria-label="筛选结果"
                className="h-8 pl-8 text-xs"
                onChange={(event) =>
                  setView((current) => ({
                    ...current,
                    filter: event.target.value,
                  }))
                }
                placeholder="筛选所有字段…"
                value={view.filter}
              />
            </div>
            <details className="relative">
              <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border px-2.5 text-xs">
                <Columns3 className="size-3.5" />列
              </summary>
              <div className="absolute top-10 right-0 z-20 max-h-72 w-56 overflow-auto rounded-lg border bg-popover p-2 shadow-md">
                {table.columns.map((column) => (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs"
                    key={column.path}
                  >
                    <input
                      checked={view.visibleColumns.includes(column.path)}
                      onChange={() => toggleColumn(column.path)}
                      type="checkbox"
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            </details>
            <details className="relative">
              <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-ring">
                <Download className="size-3.5" />
                导出
              </summary>
              <div className="absolute right-0 top-10 z-20 flex w-48 flex-col gap-1 rounded-lg border bg-popover p-1.5 shadow-md">
                <Button
                  className="h-8 gap-1 px-2.5 text-xs"
                  onClick={() =>
                    download(
                      "results.csv",
                      `\uFEFF${resultCsv(table, view)}`,
                      "text/csv;charset=utf-8"
                    )
                  }
                  size="sm"
                  variant="outline"
                >
                  <Download className="size-3.5" />
                  CSV · 当前视图
                </Button>
                <Button
                  className="h-8 px-2.5 text-xs"
                  onClick={() =>
                    download(
                      "results.json",
                      JSON.stringify(table, null, 2),
                      "application/json"
                    )
                  }
                  size="sm"
                  variant="outline"
                >
                  JSON · 原始快照
                </Button>
              </div>
            </details>
          </div>
        </div>
      )}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <DataGrid
          className={`chatnest-result-grid ${resolvedTheme === "dark" ? "rdg-dark" : "rdg-light"}`}
          columns={columns}
          headerRowHeight={38}
          onCellClick={({ row }, event) => {
            if (!(event.target as HTMLElement).closest("a")) {
              setDetail(row.sourceIndex);
            }
          }}
          onSortColumnsChange={(sort) =>
            setView((current) => ({
              ...current,
              sort: sort.slice(-3).map((item) => ({
                direction: item.direction,
                path: item.columnKey,
              })),
            }))
          }
          renderers={{
            noRowsFallback: (
              <div className="p-6 text-sm text-muted-foreground">
                {table.rows.length
                  ? "没有匹配的结果，请调整筛选条件。"
                  : "工具返回了空结果数组。"}
              </div>
            ),
          }}
          rowHeight={38}
          rowKeyGetter={(row) => row.sourceIndex}
          rows={rows}
          sortColumns={sortColumns}
          style={{ border: 0, height: "100%" }}
        />
      </div>
      {!inline && (
        <div className="shrink-0 space-y-1 border-t border-border/50 px-3 py-2">
          <Collapsible defaultOpen={false}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="shrink-0 tabular-nums">
                  {rows.length} / {table.rows.length} 行
                </span>
                <span className="shrink-0">源数据只读</span>
                <ResultTableSource source={table.source} />
              </div>
              <CollapsibleTrigger asChild>
                <Button
                  className="group h-7 max-w-full gap-1.5 px-0 text-xs hover:bg-transparent"
                  variant="ghost"
                >
                  <ChevronDown className="size-3.5 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
                  个人备注
                  {!!notes && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                      已有备注
                    </span>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="pt-1 pb-2">
              <Textarea
                aria-label="个人备注"
                className="max-h-40 min-h-14 resize-y text-xs"
                disabled={readOnly}
                id={`result-notes-${documentId}`}
                maxLength={10_000}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="记录你的判断，不会改变原始来源字段。"
                value={notes}
              />
            </CollapsibleContent>
          </Collapsible>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {error ? (
              <p
                className="min-w-0 flex-1 text-xs text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : dirty ? (
              <p
                className="min-w-0 flex-1 text-[11px] text-muted-foreground"
                role="status"
              >
                {readOnly
                  ? "只读预览：筛选与排序不保存。"
                  : "视图或备注尚未保存。"}
              </p>
            ) : (
              <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                点击行查看原始字段 · CSV 为当前视图，JSON 保留完整快照。
              </p>
            )}
            {!readOnly && (
              <Button
                className="h-7 shrink-0 gap-1.5 text-xs"
                disabled={!dirty || saving || !documentId || !expectedVersion}
                onClick={save}
                size="sm"
                variant="secondary"
              >
                <Save className="size-3" />
                {saving ? "正在保存…" : "保存视图与备注"}
              </Button>
            )}
          </div>
        </div>
      )}
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
          }
        }}
        open={detail !== null}
      >
        <SheetContent
          className="overflow-y-auto sm:max-w-lg"
          showCloseButton={false}
        >
          <SheetClose asChild>
            <Button
              aria-label="关闭原始结果"
              className="absolute top-4 right-4"
              size="icon-sm"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </SheetClose>
          <SheetHeader>
            <SheetTitle>原始结果 · 第 {(detail ?? 0) + 1} 行</SheetTitle>
            <SheetDescription>
              工具返回 · 未核验。字段值保持原样，不代表网页核验或法律结论。
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            <dl className="space-y-2 break-all text-xs text-muted-foreground">
              <dt>来源调用</dt>
              <dd className="font-mono text-foreground">
                {table.source.toolCallId}
              </dd>
              <dt>来源时间</dt>
              <dd>
                {table.source.completedAt} ({table.source.timeBasis})
              </dd>
            </dl>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-4 text-xs leading-6">
              {detail === null
                ? ""
                : JSON.stringify(table.rows[detail], null, 2)}
            </pre>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
