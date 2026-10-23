// biome-ignore-all lint/performance/noJsxPropsBind: Small local view controls have explicit, scoped event handlers.
"use client";
import {
  Columns3,
  Download,
  ExternalLink,
  ListFilter,
  NotebookPen,
  Save,
  XIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import DataGrid, { type Column, type SortColumn } from "react-data-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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
  onPendingChange?: (pending: boolean) => void;
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
  onPendingChange,
}: Props) {
  const { resolvedTheme } = useTheme();
  const [view, setView] = useState<ResultView>(table.view);
  const [notes, setNotes] = useState(table.notes);
  const [detail, setDetail] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const dirty =
    JSON.stringify(view) !== JSON.stringify(table.view) ||
    notes !== table.notes;
  // Publish the real local view/notes/save state, never a second dirty model.
  useEffect(() => {
    onPendingChange?.(!readOnly && !inline && (dirty || saving));
  }, [dirty, saving, readOnly, inline, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
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
          minWidth: 140,
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
                {new URL(url).hostname}
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              <span title={cellText(value)}>{cellText(value)}</span>
            );
          },
          resizable: true,
          sortable: true,
          width: column.path.includes("title") ? 280 : 190,
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
  const saveControl =
    !readOnly && !inline && (dirty || saving) ? (
      <Button
        aria-label="保存视图与备注"
        className="h-9 shrink-0 gap-1.5 bg-[var(--workbench-selection)] text-[13px] text-foreground hover:bg-accent"
        disabled={saving || !documentId || !expectedVersion}
        onClick={save}
        size="sm"
        variant="secondary"
      >
        <Save className="size-3.5" />
        {saving ? "正在保存…" : "保存"}
      </Button>
    ) : null;
  return (
    <div
      className="flex h-full w-full min-h-0 min-w-0 flex-col bg-background"
      data-testid="result-table"
    >
      {!inline && (
        <div
          className="shrink-0 border-b border-border/70 px-3 py-2"
          data-testid="result-table-toolbar"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 basis-36 flex-1 sm:max-w-64">
              <ListFilter className="absolute top-3 left-2.5 size-3.5 text-muted-foreground" />
              <Input
                aria-label="筛选结果"
                className="h-9 pl-8 text-[13px] shadow-none"
                disabled={saving}
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
              <summary
                aria-label="选择显示列"
                className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors hover:bg-accent"
              >
                <Columns3 className="size-3.5" />列
              </summary>
              <div className="absolute top-10 right-0 z-20 max-h-72 w-56 overflow-auto rounded-lg border bg-popover p-2 shadow-md">
                {table.columns.map((column) => (
                  <label
                    className="flex cursor-pointer items-center min-h-9 gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-accent"
                    key={column.path}
                  >
                    <input
                      checked={view.visibleColumns.includes(column.path)}
                      disabled={saving}
                      onChange={() => toggleColumn(column.path)}
                      type="checkbox"
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            </details>
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <Download className="size-3.5" />
                导出
              </summary>
              <div className="absolute right-0 top-10 z-20 flex w-48 flex-col gap-1 rounded-lg border bg-popover p-1.5 shadow-md">
                <Button
                  className="h-9 gap-1 px-2.5 text-[13px]"
                  onClick={() =>
                    download(
                      "results.csv",
                      `\uFEFF${resultCsv(table, view)}`,
                      "text/csv;charset=utf-8"
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  <Download className="size-3.5" />
                  CSV · 当前视图
                </Button>
                <Button
                  className="h-9 px-2.5 text-[13px]"
                  onClick={() =>
                    download(
                      "results.json",
                      JSON.stringify(table, null, 2),
                      "application/json"
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  JSON · 原始快照
                </Button>
                <p className="px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                  CSV 仅含当前筛选和显示列；JSON 保留原始快照与已保存备注。
                </p>
              </div>
            </details>
            <ResultTableSource source={table.source} />
            <Sheet
              data-testid="result-notes-sheet"
              onOpenChange={setNotesOpen}
              open={notesOpen}
            >
              <SheetTrigger asChild>
                <Button
                  aria-label="个人备注"
                  className="h-9 gap-1.5 px-2.5 text-[13px]"
                  variant="ghost"
                >
                  <NotebookPen className="size-3.5" />
                  备注
                  {!!notes && (
                    <span
                      aria-label="已有备注"
                      className="size-1.5 rounded-full bg-ring"
                      role="img"
                    />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent
                className="chat-workbench overflow-y-auto sm:max-w-md"
                showCloseButton={false}
              >
                <SheetClose asChild>
                  <Button
                    aria-label="关闭个人备注"
                    className="absolute top-4 right-4"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <XIcon />
                  </Button>
                </SheetClose>
                <SheetHeader>
                  <SheetTitle>个人备注</SheetTitle>
                  <SheetDescription>
                    记录你的判断，不会改变原始来源字段。
                    {!readOnly && "关闭面板后草稿仍保留，请保存后再切换产物。"}
                  </SheetDescription>
                </SheetHeader>
                <div className="flex flex-1 flex-col gap-4 px-6 pb-6">
                  <Textarea
                    aria-label="备注内容"
                    className="min-h-48 resize-y text-sm leading-6"
                    disabled={readOnly || saving}
                    id={`result-notes-${documentId}`}
                    maxLength={10_000}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="添加备注…"
                    value={notes}
                  />
                  {!!readOnly && (
                    <p className="text-xs text-muted-foreground">只读版本</p>
                  )}
                  {!!error && (
                    <p className="text-xs text-destructive" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-3">
                    {!readOnly && dirty && !saving && (
                      <span
                        className="text-xs text-muted-foreground"
                        role="status"
                      >
                        尚未保存
                      </span>
                    )}
                    {saveControl}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <div className="ml-auto">{saveControl}</div>
          </div>
          {!!error && (
            <p className="pt-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <DataGrid
          className={`chatnest-result-grid ${resolvedTheme === "dark" ? "rdg-dark" : "rdg-light"}`}
          columns={columns}
          headerRowHeight={42}
          onCellClick={({ row }, event) => {
            if (!(event.target as HTMLElement).closest("a")) {
              setDetail(row.sourceIndex);
            }
          }}
          onSortColumnsChange={(sort) =>
            !saving &&
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
          rowHeight={46}
          rowKeyGetter={(row) => row.sourceIndex}
          rows={rows}
          sortColumns={sortColumns}
          style={{ border: 0, height: "100%" }}
        />
      </div>
      {!inline && (
        <div className="shrink-0 border-t border-border/50 px-4 py-2 text-xs tabular-nums text-muted-foreground">
          {rows.length} / {table.rows.length} 行
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
          className="chat-workbench overflow-y-auto sm:max-w-lg"
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
