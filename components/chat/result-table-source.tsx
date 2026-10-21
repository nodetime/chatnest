"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ResultSource } from "@/lib/artifacts/result-table";

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

export function ResultTableSource({ source }: { source: ResultSource }) {
  return (
    <Sheet>
      <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate" title={source.serverName}>
          {source.serverName}
        </span>
        <span className="shrink-0">未核验</span>
        <SheetTrigger asChild>
          <Button
            className="h-6 shrink-0 px-1.5 text-[11px] text-muted-foreground"
            size="sm"
            variant="ghost"
          >
            来源详情
          </Button>
        </SheetTrigger>
      </div>
      <SheetContent className="min-w-0 overflow-y-auto sm:max-w-lg">
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
