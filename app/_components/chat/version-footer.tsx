"use client";

import { motion } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon, DiffIcon } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { useArtifact } from "@/app/_hooks/use-artifact";
import { cn, getDocumentTimestampByIndex } from "@/app/_lib/utils";
import { isProtectedResultTable } from "@/server/artifacts/result-table";
import type { Document } from "@/server/db/schema";
import { LoaderIcon } from "./icons";

type VersionFooterProps = {
  chatId?: string;
  isReadonly?: boolean;
  handleVersionChange: (type: "next" | "prev" | "toggle" | "latest") => void;
  documents: Document[] | undefined;
  currentVersionIndex: number;
  mode: "edit" | "diff";
  setMode: Dispatch<SetStateAction<"edit" | "diff">>;
};

export const VersionFooter = ({
  handleVersionChange,
  chatId,
  isReadonly,
  documents,
  currentVersionIndex,
  mode,
  setMode,
}: VersionFooterProps) => {
  const { artifact } = useArtifact();

  const { mutate } = useSWRConfig();
  const [isMutating, setIsMutating] = useState(false);

  const protectedTable = isProtectedResultTable(artifact.content);
  const isFirst = currentVersionIndex === 0;
  const isLast = documents
    ? currentVersionIndex === documents.length - 1
    : true;
  const handlePrevious = useCallback(() => {
    handleVersionChange("prev");
  }, [handleVersionChange]);

  const handleNext = useCallback(() => {
    handleVersionChange("next");
  }, [handleVersionChange]);

  const handleToggleMode = useCallback(() => {
    setMode(mode === "diff" ? "edit" : "diff");
  }, [mode, setMode]);

  const handleRestore = useCallback(async () => {
    if (!documents || isReadonly || isProtectedResultTable(artifact.content)) {
      return;
    }

    setIsMutating(true);

    try {
      const key = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/document?id=${artifact.documentId}&chatId=${chatId ?? ""}`;
      const response = await fetch(
        `${key}&timestamp=${getDocumentTimestampByIndex(documents, currentVersionIndex)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        throw new Error("恢复版本失败，请重试。");
      }
      await mutate(key);
      handleVersionChange("latest");
    } catch {
      toast.error("恢复版本失败，原版本保持不变。");
    } finally {
      setIsMutating(false);
    }
  }, [
    artifact.documentId,
    artifact.content,
    isReadonly,
    chatId,
    currentVersionIndex,
    documents,
    mutate,
    handleVersionChange,
  ]);

  const handleLatest = useCallback(() => {
    setMode("edit");
    handleVersionChange("latest");
  }, [handleVersionChange, setMode]);

  if (!documents) {
    return null;
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="z-10 flex w-full shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/50 bg-background px-3 py-2"
      exit={{ opacity: 0, transition: { duration: 0 } }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            aria-label="上一版本"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            disabled={isFirst}
            onClick={handlePrevious}
            type="button"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="min-w-[4rem] text-center text-xs tabular-nums text-muted-foreground">
            第{currentVersionIndex + 1}/{documents.length}版
          </span>
          <button
            aria-label="下一版本"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            disabled={isLast}
            onClick={handleNext}
            type="button"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>

        {!isLast && !protectedTable && (
          <button
            aria-label="查看更改"
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              mode === "diff" && "bg-muted text-foreground"
            )}
            onClick={handleToggleMode}
            title="查看更改"
            type="button"
          >
            <DiffIcon className="size-4" />
          </button>
        )}
      </div>

      {!isLast && (
        <div className="flex flex-wrap gap-2">
          {!protectedTable && (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-all duration-150 hover:opacity-90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
              disabled={isMutating || isReadonly || protectedTable}
              onClick={handleRestore}
              type="button"
            >
              恢复此版本
              {isMutating ? (
                <div className="animate-spin">
                  <LoaderIcon size={14} />
                </div>
              ) : null}
            </button>
          )}
          <button
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-all duration-150 hover:bg-muted active:scale-[0.98]"
            onClick={handleLatest}
            type="button"
          >
            最新版本
          </button>
        </div>
      )}
    </motion.div>
  );
};
