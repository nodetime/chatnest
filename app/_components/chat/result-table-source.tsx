"use client";

import { Info, XIcon } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/_components/ui/sheet";
import type { ResultSource } from "@/server/artifacts/result-table";

// The same pure content is used in the Sheet and offline rendering tests. Raw
// names and values are evidence, not translated display labels.
export function ResultTableSourceDetails({ source }: { source: ResultSource }) {
  return (
    <dl className="space-y-4 break-all text-xs">
      {Object.entries(source).map(([field, value]) => (
        <div className="space-y-1" key={field}>
          <dt className="text-muted-foreground">{field}</dt>
          <dd className="font-mono text-foreground">{value}</dd>
          {field === "timeBasis" && (
            <dd className="text-muted-foreground">
              {value === "message-recorded"
                ? "消息记录时间：从历史消息恢复时采用的记录时间，不代表工具的实际完成时间。"
                : "工具完成时间：记录工具返回结果的时间，不代表来源内容的发布时间。"}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

export function ResultTableSource({
  source,
  compact = false,
}: {
  source: ResultSource;
  compact?: boolean;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          aria-label="来源详情"
          className="h-9 shrink-0 gap-1.5 px-2.5 text-[13px]"
          size="sm"
          variant="ghost"
        >
          <Info className="size-3.5" />
          <span
            className={
              compact
                ? "hidden @min-[760px]:inline @max-[500px]:inline"
                : undefined
            }
          >
            来源
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent
        className="chat-workbench min-w-0 overflow-y-auto sm:max-w-lg"
        showCloseButton={false}
      >
        <SheetClose asChild>
          <Button
            aria-label="关闭来源详情"
            className="absolute top-4 right-4"
            size="icon-sm"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </SheetClose>
        <SheetHeader>
          <SheetTitle>来源详情</SheetTitle>
          <SheetDescription>
            工具返回 · 未核验。来源字段保持原值，不代表网页核验或法律结论。
          </SheetDescription>
        </SheetHeader>
        <div className="min-w-0 px-6 pb-6">
          <ResultTableSourceDetails source={source} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
