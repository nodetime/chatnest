// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes the task example selection handlers.
"use client";

import { ArrowUpRight } from "lucide-react";

const taskExamples = [
  {
    description: "根据产品图片，查找相似商品与来源",
    label: "找线索",
    prompt:
      "根据这张产品图片查找相似商品，整理来源链接，并标出需要进一步核对的线索。",
  },
  {
    description: "比较两份材料的相同点与关键差异",
    label: "做比较",
    prompt: "比较这两份材料，逐项整理相同点、关键差异和需要补充的依据。",
  },
  {
    description: "将材料整理成线索清单与对比表",
    label: "整理产物",
    prompt: "将这些材料整理成线索清单与对比表，保留来源和待核对项。",
  },
];

export function Greeting() {
  return (
    <div className="mb-6 w-full text-center md:mb-7" data-testid="greeting">
      <h1 className="text-balance text-[25px] font-medium leading-[1.6] tracking-[-0.035em] md:text-[clamp(30px,2.6vw,34px)] md:leading-[1.4]">
        AI 侵权线索引擎 <span className="font-normal">Agent</span>
      </h1>
    </div>
  );
}

export function TaskExamples({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <section aria-label="任务示例" className="flex flex-col gap-px pt-[22px]">
      {taskExamples.map((example) => (
        <button
          className="group grid w-full min-w-0 grid-cols-[45px_minmax(0,1fr)] items-start gap-2.5 rounded-lg px-0.5 py-2.5 text-left text-xs leading-[1.6] transition-colors hover:bg-[var(--workbench-selection)] md:grid-cols-[55px_minmax(0,1fr)_16px] md:gap-3.5 md:px-2 md:py-[11px] md:text-[13px]"
          key={example.label}
          onClick={() => onSelect(example.prompt)}
          type="button"
        >
          <span className="text-[11px] text-muted-foreground md:text-xs">
            {example.label}
          </span>
          <span className="break-words">{example.description}</span>
          <ArrowUpRight
            aria-hidden="true"
            className="mt-0.5 hidden size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 md:block"
          />
        </button>
      ))}
    </section>
  );
}
