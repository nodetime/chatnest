import type { ChatMessage } from "../types";
import { assetIdFromRef } from "./refs";
import {
  MAX_CONTEXT_BYTES,
  MAX_FILE_BYTES,
  MAX_IMAGES,
  UploadError,
} from "./validation";
export type ResolvedAsset = {
  bytes: Buffer;
  mime: string;
  name: string;
  size: number;
};
export async function prepareAttachmentContext<T extends { parts: unknown[] }>(
  messages: T[],
  vision: boolean,
  resolve: (id: string) => Promise<ResolvedAsset>
): Promise<T[]> {
  // Validate the whole context before any storage reads or downstream side effects.
  const refs: string[] = [];
  for (const message of messages) {
    let count = 0;
    for (const value of message.parts) {
      const part = value as { type?: string; url?: string; mediaType?: string };
      if (part.type !== "file") {
        continue;
      }
      count += 1;
      if (typeof part.url !== "string") {
        throw new UploadError(400, "附件引用无效。");
      }
      try {
        refs.push(assetIdFromRef(part.url));
      } catch (error) {
        // biome-ignore lint/style/useErrorCause: Sanitize this boundary error; underlying errors may contain private paths or request content.
        throw new UploadError(400, (error as Error).message);
      }
      if (!["image/png", "image/jpeg"].includes(part.mediaType ?? "")) {
        throw new UploadError(400, "仅支持 JPEG/PNG 图片，请重新上传。");
      }
    }
    if (count > MAX_IMAGES) {
      throw new UploadError(400, "每条消息最多 15 张图片。");
    }
  }
  if (refs.length && !vision) {
    throw new UploadError(
      400,
      "所选模型不支持图片，请选择支持视觉的模型；草稿已保留。"
    );
  }
  let total = 0;
  const assets = new Map<string, ResolvedAsset>();
  for (const id of refs) {
    // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
    const asset = assets.get(id) ?? (await resolve(id));
    assets.set(id, asset);
    if (
      asset.size < 1 ||
      asset.size > MAX_FILE_BYTES ||
      asset.bytes.length !== asset.size
    ) {
      throw new UploadError(400, "附件大小无效。");
    }
    total += asset.size;
    if (total > MAX_CONTEXT_BYTES) {
      throw new UploadError(
        400,
        "当前会话图片总量超过 20 MiB，请新建会话或减少图片。"
      );
    }
  }
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((value) => {
      const part = value as { type?: string; url: string };
      if (part.type !== "file") {
        return value;
      }
      const asset = assets.get(assetIdFromRef(part.url));
      if (!asset) {
        throw new UploadError(400, "附件引用无效。");
      }
      return {
        ...part,
        filename: asset.name,
        mediaType: asset.mime,
        url: `data:${asset.mime};base64,${asset.bytes.toString("base64")}`,
      };
    }),
  })) as T[];
}
export function messageAssetIds(messages: Pick<ChatMessage, "parts">[]) {
  return [
    ...new Set(
      messages.flatMap((message) =>
        message.parts
          .filter((p) => p.type === "file")
          .map((p) => assetIdFromRef(p.url))
      )
    ),
  ];
}
