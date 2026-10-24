import Link from "next/link";

export function UploadUnavailableHint({
  isPlatformAdmin = false,
}: {
  isPlatformAdmin?: boolean;
}) {
  return isPlatformAdmin ? (
    <>
      未连接图片存储，请前往
      <Link className="underline underline-offset-2" href="/admin/storage">
        平台管理
      </Link>
      查看。
    </>
  ) : (
    <>未连接图片存储，请联系管理员开启上传。</>
  );
}
