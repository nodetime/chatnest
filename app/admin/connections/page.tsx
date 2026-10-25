import { AdminConnections } from "@/app/_components/admin/admin-connections";

export default function ConnectionsPage() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">工具连接</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          配置助手可使用的外部工具，个人偏好仍在工作台设置中调整。
        </p>
      </div>
      <AdminConnections />
    </>
  );
}
