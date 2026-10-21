import { AdminStorage } from "@/components/admin/admin-storage";
export default function StoragePage() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">文件存储</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          配置平台图片上传能力；存储路径只由服务器运维环境管理，不在浏览器保存凭据。
        </p>
      </div>
      <AdminStorage />
    </>
  );
}
