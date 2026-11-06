"use client";

import { useTheme } from "next-themes";
import { parse, unparse } from "papaparse";
import {
  type MouseEvent,
  memo,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import DataGrid, { textEditor } from "react-data-grid";
import "react-data-grid/lib/styles.css";

type SheetEditorProps = {
  content: string;
  saveContent: (content: string, isCurrentVersion: boolean) => void;
  currentVersionIndex: number;
  isCurrentVersion: boolean;
  status: string;
};
type Row = Record<string, string | number>;

function sourceUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    // A non-URL cell is rendered as ordinary text.
  }
}

function keepSourceClick(event: MouseEvent<HTMLAnchorElement>) {
  event.stopPropagation();
}
function hideUnavailableImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.hidden = true;
}

const PureSpreadsheetEditor = ({
  content,
  saveContent,
  isCurrentVersion,
  status,
}: SheetEditorProps) => {
  const { resolvedTheme } = useTheme();
  const data = useMemo(
    () => parse<string[]>(content, { skipEmptyLines: true }).data,
    [content]
  );
  const headers = useMemo(() => {
    const count = Math.max(1, ...data.map((row) => row.length));
    return Array.from({ length: count }, (_, index) => data[0]?.[index] ?? "");
  }, [data]);
  const columns = useMemo(
    () => [
      {
        frozen: true,
        key: "rowNumber",
        name: "",
        renderCell: ({ rowIdx }: { rowIdx: number }) => rowIdx + 1,
        width: 44,
      },
      ...headers.map((header, index) => {
        const imageColumn = /主图|图片|image|photo/i.test(header);
        return {
          key: String(index),
          minWidth: 100,
          name: header || `列 ${index + 1}`,
          renderCell: ({ row }: { row: Row }) => {
            const value = String(row[index] ?? "");
            const href = sourceUrl(value);
            return (
              <div className="h-full overflow-auto whitespace-pre-wrap break-words py-2 text-sm leading-relaxed">
                {href ? (
                  <a
                    className="inline-flex max-w-full flex-col gap-1 text-primary underline underline-offset-2"
                    href={href}
                    onClick={keepSourceClick}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {imageColumn && (
                      // biome-ignore lint/performance/noImgElement: External source URLs are displayed unchanged without a Next image proxy.
                      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError handles resource failure, not user interaction.
                      <img
                        alt="商品主图"
                        className="h-20 w-28 rounded object-contain"
                        loading="lazy"
                        onError={hideUnavailableImage}
                        referrerPolicy="no-referrer"
                        src={href}
                      />
                    )}
                    {imageColumn
                      ? "查看原图"
                      : /链接|url|link/i.test(header)
                        ? "打开来源"
                        : value}
                  </a>
                ) : (
                  value
                )}
              </div>
            );
          },
          renderEditCell:
            isCurrentVersion && status !== "streaming" ? textEditor : undefined,
          width: imageColumn
            ? 132
            : /判断|等级|来源平台/.test(header)
              ? 120
              : /链接|url|link/i.test(header)
                ? 140
                : /名称|标题/.test(header)
                  ? 190
                  : 240,
        };
      }),
    ],
    [headers, isCurrentVersion, status]
  );
  const initialRows = useMemo(
    () =>
      (data.length > 0 ? data.slice(1) : [[""]]).map((row, index) => {
        const item: Row = { id: index };
        headers.forEach((_, column) => {
          item[column] = row[column] ?? "";
        });
        return item;
      }),
    [data, headers]
  );
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const handleRowsChange = useCallback(
    (newRows: Row[]) => {
      if (!isCurrentVersion || status === "streaming") {
        return;
      }
      setRows(newRows);
      saveContent(
        unparse([
          headers,
          ...newRows.map((row) =>
            headers.map((_, index) => String(row[index] ?? ""))
          ),
        ]),
        true
      );
    },
    [headers, isCurrentVersion, status, saveContent]
  );
  return (
    <DataGrid
      aria-label="对比与数据表格"
      className={resolvedTheme === "dark" ? "rdg-dark" : "rdg-light"}
      columns={columns}
      defaultColumnOptions={{ resizable: true }}
      enableVirtualization
      headerRowHeight={44}
      onRowsChange={handleRowsChange}
      rowHeight={128}
      rows={rows}
      style={{ height: "100%" }}
    />
  );
};

export const SpreadsheetEditor = memo(PureSpreadsheetEditor);
