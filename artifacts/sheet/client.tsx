import { parse, unparse } from "papaparse";
import { toast } from "sonner";
import { Artifact } from "@/components/chat/create-artifact";
import {
  CopyIcon,
  LineChartIcon,
  RedoIcon,
  SparklesIcon,
  UndoIcon,
} from "@/components/chat/icons";
import { ResultTableView } from "@/components/chat/result-table";
import { SpreadsheetEditor } from "@/components/chat/sheet-editor";
import {
  isProtectedResultTable,
  parseResultTable,
  resultCsv,
} from "@/lib/artifacts/result-table";

type Metadata = Record<string, never>;

export const sheetArtifact = new Artifact<"sheet", Metadata>({
  actions: [
    {
      description: "View Previous version",
      icon: <UndoIcon size={18} />,
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("prev");
      },
    },
    {
      description: "View Next version",
      icon: <RedoIcon size={18} />,
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("next");
      },
    },
    {
      description: "Copy as .csv",
      icon: <CopyIcon />,
      onClick: async ({ content }) => {
        const table = parseResultTable(content);
        if (table) {
          await navigator.clipboard.writeText(resultCsv(table));
          toast.success("已复制 CSV");
          return;
        }
        if (isProtectedResultTable(content)) {
          toast.error("结果表格格式无效，请重新打开。");
          return;
        }
        const parsed = parse<string[]>(content, { skipEmptyLines: true });

        const nonEmptyRows = parsed.data.filter((row) =>
          row.some((cell) => cell.trim() !== "")
        );

        const cleanedCsv = unparse(nonEmptyRows);

        navigator.clipboard.writeText(cleanedCsv);
        toast.success("Copied csv to clipboard!");
      },
    },
  ],
  content: ({
    content,
    currentVersionIndex,
    onSaveContent,
    status,
    isCurrentVersion,
    isReadonly,
    documentId,
    expectedVersion,
    onResultTableSaved,
  }) => {
    const table = parseResultTable(content);
    if (table) {
      return (
        <ResultTableView
          documentId={documentId}
          expectedVersion={expectedVersion}
          key={`${documentId}:${expectedVersion}`}
          onSaved={onResultTableSaved}
          readOnly={isReadonly || !isCurrentVersion}
          table={table}
        />
      );
    }
    if (isProtectedResultTable(content)) {
      return (
        <div className="p-6 text-sm text-destructive" role="alert">
          结果表格格式无效或版本暂不支持；原始数据保持只读。
        </div>
      );
    }
    return (
      <SpreadsheetEditor
        content={content}
        currentVersionIndex={currentVersionIndex}
        isCurrentVersion={isCurrentVersion && !isReadonly}
        saveContent={onSaveContent}
        status={status}
      />
    );
  },
  description: "Useful for working with spreadsheets",
  initialize: () => null,
  kind: "sheet",
  onStreamPart: ({ setArtifact, streamPart }) => {
    if (streamPart.type === "data-sheetDelta") {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: streamPart.data,
        isVisible: true,
        status: "streaming",
      }));
    }
  },
  toolbar: [
    {
      description: "Format and clean data",
      icon: <SparklesIcon />,
      onClick: ({ sendMessage }) => {
        sendMessage({
          parts: [
            { text: "Can you please format and clean the data?", type: "text" },
          ],
          role: "user",
        });
      },
    },
    {
      description: "Analyze and visualize data",
      icon: <LineChartIcon />,
      onClick: ({ sendMessage }) => {
        sendMessage({
          parts: [
            {
              text: "Can you please analyze and visualize the data by creating a new code artifact in python?",
              type: "text",
            },
          ],
          role: "user",
        });
      },
    },
  ],
});
