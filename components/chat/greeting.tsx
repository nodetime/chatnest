export function Greeting() {
  return (
    <div
      className="mx-auto mb-8 w-full max-w-[800px] px-6 text-center sm:mb-9"
      data-testid="greeting"
    >
      <p className="mb-3 text-xs font-medium tracking-[0.14em] text-muted-foreground">
        ChatNest
      </p>
      <h1 className="text-[28px] font-medium leading-tight tracking-tight sm:text-[34px]">
        有什么我可以帮你？
      </h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        描述你的目标，或添加文件作为起点。
      </p>
    </div>
  );
}
