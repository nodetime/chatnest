export function AgentGeneralStatus({
  modelConfigured,
  uploadsConfigured,
  connectionCount,
}: {
  modelConfigured: boolean;
  uploadsConfigured: boolean;
  connectionCount: number;
}) {
  return (
    <section aria-label="服务状态" className="space-y-3">
      <h3 className="text-sm font-medium">服务状态</h3>
      <dl className="divide-y rounded-xl border px-4 text-sm">
        {[
          ["对话服务", modelConfigured ? "已设置" : "待管理员设置"],
          ["资料上传", uploadsConfigured ? "已开启" : "未开启"],
          ["检索工具", `${connectionCount} 个连接`],
        ].map(([label, value]) => (
          <div
            className="flex items-center justify-between gap-3 py-3.5"
            key={label}
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        服务状态由管理员设置，不代表实时连接检测结果。
      </p>
    </section>
  );
}
