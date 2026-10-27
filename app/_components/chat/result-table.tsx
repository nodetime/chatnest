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
import { type ReactNode, useEffect, useMemo, useState } from "react";
import DataGrid, { type Column, type SortColumn } from "react-data-grid";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/_components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/_components/ui/sheet";
import { Textarea } from "@/app/_components/ui/textarea";
import {
  cellText,
  type ResultTable,
  type ResultView,
  resolvePointer,
  resultCsv,
  resultRows,
  safeSourceUrl,
} from "@/server/domain/document/result-table";
import { ResultTableRowDetails } from "./result-table-row-details";
import { ResultTableSource } from "./result-table-source";
import "react-data-grid/lib/styles.css";

type Props = {
  renderHeader?: (controls: ReactNode) => ReactNode;
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
  renderHeader,
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
        renderCell: ({ row }) => (
          <span className="text-muted-foreground">{row.sourceIndex + 1}</span>
        ),
        width: 46,
      },
      ...table.columns
        .filter((column) => view.visibleColumns.includes(column.path))
        .map((column, index, visibleColumns) => ({
          frozen: index === 0,
          key: column.path,
          minWidth: 120,
          name: column.label,
          renderCell: ({ row }: { row: (typeof rows)[number] }) => {
            const value = resolvePointer(row.raw, column.path);
            const url = safeSourceUrl(value);
            return url ? (
              <a
                className={`inline-flex max-w-full items-center gap-1 truncate text-primary underline-offset-4 hover:underline ${index === 0 ? "font-medium" : ""}`}
                href={url}
                rel="noopener noreferrer"
                target="_blank"
                title={url}
              >
                {new URL(url).hostname}
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              <span
                className={index === 0 ? "font-medium" : undefined}
                title={cellText(value)}
              >
                {cellText(value)}
              </span>
            );
          },
          resizable: true,
          sortable: true,
          // Only the trailing secondary field absorbs spare canvas. The primary
          // record anchor and user-resized widths retain their own geometry.
          width:
            index > 0 && index === visibleColumns.length - 1
              ? `minmax(${index === 0 ? 220 : 140}px, 1fr)`
              : index === 0
                ? 220
                : 140,
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
        <span className="hidden @min-[760px]:inline @max-[500px]:inline [[data-slot=sheet-content]_&]:inline">
          {saving ? "正在保存…" : "保存"}
        </span>
      </Button>
    ) : null;
  const controls = (
    <div
      className="flex shrink-0 items-center gap-0.5 @max-[500px]:order-3 @max-[500px]:min-h-11 @max-[500px]:w-full @max-[500px]:overflow-x-auto @max-[500px]:border-t @max-[500px]:border-border/70 @max-[500px]:pt-1"
      data-testid="result-table-controls"
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label="筛选结果选项"
            className="relative h-9 gap-1.5 px-2.5 text-[13px]"
            title={view.filter ? `筛选：${view.filter}` : "筛选结果"}
            variant="ghost"
          >
            <ListFilter className="size-3.5" />
            <span className="hidden @min-[760px]:inline @max-[500px]:inline">
              筛选
            </span>
            {!!view.filter && (
              <span
                aria-label="已启用筛选"
                className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-ring"
                role="img"
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="chat-workbench w-72 p-3">
          <label
            className="mb-2 block text-xs text-muted-foreground"
            htmlFor={`result-filter-${documentId}`}
          >
            筛选所有字段
          </label>
          <Input
            aria-label="筛选结果"
            className="h-9 text-[13px] shadow-none"
            disabled={saving}
            id={`result-filter-${documentId}`}
            onChange={(event) =>
              setView((current) => ({ ...current, filter: event.target.value }))
            }
            placeholder="输入关键词…"
            value={view.filter}
          />
          {!!view.filter && (
            <Button
              className="mt-2 h-8 text-xs"
              disabled={saving}
              onClick={() => setView((current) => ({ ...current, filter: "" }))}
              variant="ghost"
            >
              清除筛选
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label="选择显示列"
            className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors hover:bg-accent"
            variant="ghost"
          >
            <Columns3 className="size-3.5" />
            <span className="hidden @min-[760px]:inline @max-[500px]:inline">
              列
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="chat-workbench max-h-72 w-56 overflow-auto p-2"
          collisionPadding={8}
        >
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
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label="导出结果"
            className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            variant="ghost"
          >
            <Download className="size-3.5" />
            <span className="hidden @min-[760px]:inline @max-[500px]:inline">
              导出
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="chat-workbench flex w-48 flex-col gap-1 p-1.5"
          collisionPadding={8}
        >
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
        </PopoverContent>
      </Popover>
      <ResultTableSource compact source={table.source} />
      <Sheet
        data-testid="result-notes-sheet"
        onOpenChange={setNotesOpen}
        open={notesOpen}
      >
        <SheetTrigger asChild>
          <Button
            aria-label="个人备注"
            className="relative h-9 gap-1.5 px-2.5 text-[13px]"
            variant="ghost"
          >
            <NotebookPen className="size-3.5" />
            <span className="hidden @min-[760px]:inline @max-[500px]:inline">
              备注
            </span>
            {!!notes && (
              <span
                aria-label="已有备注"
                className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-ring"
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
                <span className="text-xs text-muted-foreground" role="status">
                  尚未保存
                </span>
              )}
              {saveControl}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {saveControl}
    </div>
  );
  return (
    <div
      className="@container flex h-full w-full min-h-0 min-w-0 flex-col bg-background"
      data-testid="result-table"
    >
      {!inline &&
        (renderHeader ? (
          renderHeader(controls)
        ) : (
          <div
            className="shrink-0 border-b px-3 py-2"
            data-testid="result-table-toolbar"
          >
            {controls}
          </div>
        ))}
      {!inline && !!error && (
        <p className="shrink-0 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <DataGrid
          className={`chatnest-result-grid ${resolvedTheme === "dark" ? "rdg-dark" : "rdg-light"}`}
          columns={columns}
          headerRowHeight={inline ? 38 : 42}
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
          rowHeight={inline ? 38 : 46}
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
          {detail !== null && (
            <ResultTableRowDetails index={detail} table={table} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
