import { Sparkles } from "lucide-react";

export function Greeting() {
  return (
    <div className="mb-7 w-full text-left" data-testid="greeting">
      <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles aria-hidden="true" className="size-3.5 text-ring" />
        你的 AI 工作台
      </p>
      <h1 className="[font-family:var(--workbench-display-font)] text-[28px] font-medium leading-[1.4] tracking-tight sm:text-[36px]">
        今天想完成什么？
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        从一个问题、一张图片或一份文件开始。
      </p>
    </div>
  );
}
