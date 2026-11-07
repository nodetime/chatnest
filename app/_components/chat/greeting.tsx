export function Greeting() {
  return (
    <div className="mb-6 w-full text-left" data-testid="greeting">
      <h1 className="text-[28px] font-semibold leading-[1.35] tracking-tight sm:text-[32px]">
        今天想完成什么？
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        从一个问题、一张图片或一份文件开始。
      </p>
    </div>
  );
}
