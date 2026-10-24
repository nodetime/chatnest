import { AdminModels } from "@/app/_components/admin/admin-models";
export default function ModelsPage() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">模型</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          管理平台模型服务。保存后从下一次请求生效，不影响正在生成的内容。
        </p>
      </div>
      <AdminModels />
    </>
  );
}
