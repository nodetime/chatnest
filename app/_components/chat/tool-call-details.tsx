"use client";

import { MoreHorizontal, XIcon } from "lucide-react";
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
import type { ToolPart } from "../ai-elements/tool";

// JSON strings stay quoted: false, 0, "", and null are actual returned values,
// not absent output. No normalization of provider names, keys or raw errors.
export function ToolCallDetailsContent({ part }: { part: ToolPart }) {
  const name =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const fields = [
    ["工具名称", name],
    ["调用参数", part.input],
    ["返回结果", part.output],
    ["原始错误", part.errorText],
  ] as const;
  return (
    <dl className="min-w-0 space-y-5 text-xs">
      {fields.map(([label, value]) => (
        <div className="min-w-0 space-y-2" key={label}>
          <dt className="font-medium text-muted-foreground">{label}</dt>
          <dd>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 font-mono leading-5 [overflow-wrap:anywhere]">
              {value === undefined ? "未记录" : JSON.stringify(value, null, 2)}
            </pre>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Lives next to the disclosure button, not inside its collapsible body. Radix
// owns the dialog, Escape, focus trap and return to the exact triggering row.
export function ToolCallDetails({
  part,
  onOpenChange,
}: {
  part: ToolPart;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          aria-label="查看调用详情"
          className="size-9 shrink-0 text-muted-foreground"
          size="icon-sm"
          title="查看调用详情"
          variant="ghost"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        className="min-w-0 overflow-y-auto sm:max-w-lg"
        showCloseButton={false}
      >
        <SheetClose asChild>
          <Button
            aria-label="关闭调用详情"
            className="absolute top-4 right-4"
            size="icon-sm"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </SheetClose>
        <SheetHeader>
          <SheetTitle>调用详情</SheetTitle>
          <SheetDescription>
            原始工具名称、参数、返回结果与错误记录。
          </SheetDescription>
        </SheetHeader>
        <div className="min-w-0 px-6 pb-6">
          <ToolCallDetailsContent part={part} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
