import { getEnv } from "@/server/shared/env";
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function uploadBasePath() {
  const { NEXT_PUBLIC_BASE_PATH, IS_DEMO } = getEnv();
  return NEXT_PUBLIC_BASE_PATH ?? (IS_DEMO === "1" ? "/demo" : "");
}
export function assetRef(id: string) {
  return `${uploadBasePath()}/api/files/${id}`;
}
export function assetIdFromRef(ref: string, basePath = uploadBasePath()) {
  const prefix = `${basePath}/api/files/`;
  const id = ref.startsWith(prefix) ? ref.slice(prefix.length) : "";
  if (!UUID_PATTERN.test(id)) {
    throw new Error("仅支持本平台上传的图片；旧版外部附件请重新上传。");
  }
  return id;
}
