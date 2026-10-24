import { isPlatformAdmin } from "@/lib/admin/access";
import { sameOriginBrowserControl } from "@/lib/agent/browser-policy";
import { UploadCapacityError } from "@/lib/uploads/capacity";
import { UploadError } from "@/lib/uploads/validation";

type User = { id?: string; type?: string } | null | undefined;
export function authorizeUploadRequest(
  user: User,
  request: Request,
  write: boolean,
  admin = false
) {
  if (!user?.id) {
    throw new UploadError(401, "请登录后访问附件。");
  }
  if (
    ((write || admin) && user.type !== "regular") ||
    (admin && !isPlatformAdmin(user))
  ) {
    throw new UploadError(
      403,
      admin ? "仅平台管理员可以管理存储。" : "请使用正式账号上传图片。"
    );
  }
  const sameOrigin = request.headers.has("host")
    ? sameOriginBrowserControl(request)
    : request.headers.get("origin") === new URL(request.url).origin;
  if (write && !sameOrigin) {
    throw new UploadError(403, "请求来源不匹配。");
  }
  return user.id;
}
export function mayReadAsset(
  asset: {
    ownerId: string;
    state: string;
    chatOwnerId: string | null;
    visibility: string | null;
    associated: boolean;
  },
  userId: string
) {
  if (!["draft", "used"].includes(asset.state)) {
    return false;
  }
  if (asset.chatOwnerId && asset.chatOwnerId !== asset.ownerId) {
    return false;
  }
  if (asset.state === "draft") {
    return userId === asset.ownerId;
  }
  return (
    asset.associated &&
    asset.chatOwnerId === asset.ownerId &&
    (userId === asset.ownerId || asset.visibility === "public")
  );
}
export function uploadErrorResponse(error: unknown) {
  const known =
    error instanceof UploadError || error instanceof UploadCapacityError;
  return Response.json(
    {
      cause: known
        ? error.message
        : "附件服务暂不可用，请联系管理员或稍后重试。",
      code: "bad_request:attachment",
      error: known
        ? error.message
        : "附件服务暂不可用，请联系管理员或稍后重试。",
      message: known
        ? error.message
        : "附件服务暂不可用，请联系管理员或稍后重试。",
    },
    {
      headers: { "Cache-Control": "private, no-store" },
      status: known ? error.status : 503,
    }
  );
}

export function requireFinalizedUpload(rows: { id: string }[]) {
  if (rows.length !== 1) {
    throw new UploadError(409, "上传会话已失效，请重新选择图片。");
  }
}
