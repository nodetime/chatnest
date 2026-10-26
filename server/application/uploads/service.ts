import { getEnv } from "@/server/shared/env";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  ATTACHMENT_MIMES,
  type DocumentExtraction,
  isImageMime,
  isReadableExtraction,
  MAX_DOCUMENT_BYTES,
} from "@/server/domain/attachment/document-types";
import {
  assetIdFromRef,
  assetRef,
  UUID_PATTERN,
} from "@/server/domain/attachment/refs";
import type { DBMessage } from "@/server/infrastructure/persistence/drizzle/schema";
import { parseDocument } from "@/server/infrastructure/uploads/document-parser";
import {
  LocalUploadStore,
  quotaLimits,
  storageDirectory,
} from "@/server/infrastructure/uploads/local-store";
import {
  mayReadAsset,
  requireFinalizedUpload,
} from "@/server/shared/uploads/security";
import {
  MAX_CONTEXT_BYTES,
  MAX_FILE_BYTES,
  MAX_IMAGES,
  safeDisplayName,
  UploadError,
  validateAttachment,
} from "@/server/shared/uploads/validation";

const sql = postgres(getEnv().POSTGRES_URL ?? "");
// Shared lock serializes quota reservation, lifecycle pinning and safe deletion across processes.
const LOCK = 73_624_910;
type Asset = {
  id: string;
  ownerId: string;
  chatId: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  state: string;
  createdAt: Date;
  extraction: DocumentExtraction | null;
  derivedBytes: number;
};
function store() {
  return new LocalUploadStore(storageDirectory());
}
export async function storageStatus() {
  let configured = true;
  try {
    storageDirectory();
    quotaLimits();
  } catch {
    configured = false;
  }
  const [row] =
    await sql`SELECT "enabled","revision" FROM upload_settings WHERE "id"='workspace'`;
  if (!row) {
    throw new UploadError(503, "请先运行数据库迁移。");
  }
  return {
    configured,
    driver: "local",
    enabled: row.enabled as boolean,
    formats: ATTACHMENT_MIMES,
    maxContextBytes: MAX_CONTEXT_BYTES,
    maxDocumentBytes: MAX_DOCUMENT_BYTES,
    maxFileBytes: MAX_FILE_BYTES,
    maxImages: MAX_IMAGES,
    parser: {
      concurrent: 1,
      deadlineMs: 20_000,
      maxCharacters: 1_000_000,
      node: ">=22.13",
    },
    revision: row.revision as number,
  };
}
export async function uploadsAvailable() {
  try {
    const status = await storageStatus();
    return status.enabled && status.configured;
  } catch {
    return false;
  }
}
export async function testStorage() {
  const id = randomUUID(),
    bytes = Buffer.from("private-storage-test");
  const local = store();
  try {
    await local.write(id, bytes);
    const read = await local.read(id, bytes.length);
    if (!read.equals(bytes)) {
      throw new Error("read mismatch");
    }
  } finally {
    await local.delete(id);
  }
  return { ok: true };
}
export async function configureStorage(
  enabled: boolean,
  revision: number,
  userId: string
) {
  if (enabled) {
    await testStorage();
  }
  const result = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
    return tx`UPDATE upload_settings SET "enabled"=${enabled},"revision"="revision"+1,updated_at=now(),updated_by=${userId} WHERE "id"='workspace' AND "revision"=${revision} RETURNING "revision"`;
  });
  if (!result.length) {
    throw new UploadError(409, "存储设置已更新，请刷新后重试。");
  }
  return storageStatus();
}
// Cheap admission avoids monopolizing the parser for disabled/cross-chat/full storage.
// The reservation transaction below repeats every mutable check with derived bytes under LOCK.
async function preflightUpload(ownerId: string, chatId: string, size: number) {
  storageDirectory();
  const limits = quotaLimits();
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_DOCUMENT_BYTES) {
    throw new UploadError(400, "附件必须非空且不超过 64 MiB。");
  }
  const [settings] =
    await sql`SELECT "enabled" FROM upload_settings WHERE "id"='workspace'`;
  if (!settings?.enabled) {
    throw new UploadError(503, "附件上传尚未开启，请联系平台管理员配置存储。");
  }
  const [chat] = await sql`SELECT user_id FROM chats WHERE "id"=${chatId}`;
  if (chat && chat.userId !== ownerId) {
    throw new UploadError(403, "会话不属于当前账号。");
  }
  const [quota] =
    await sql`SELECT COALESCE(SUM("size" + derived_bytes),0)::bigint AS total,COALESCE(SUM("size" + derived_bytes) FILTER (WHERE owner_id=${ownerId}),0)::bigint AS own,COUNT(*) FILTER (WHERE owner_id=${ownerId} AND chat_id=${chatId} AND "state" IN ('pending','draft'))::integer AS drafts FROM upload_assets`;
  if (
    Number(quota.total) + size > limits.deployment ||
    Number(quota.own) + size > limits.user
  ) {
    throw new UploadError(
      429,
      "附件存储配额已满，请移除未发送的附件或联系管理员。"
    );
  }
  if (quota.drafts >= MAX_IMAGES) {
    throw new UploadError(400, "本会话已有 15 个未发送附件，请先移除或发送。");
  }
}
export async function registerUpload(
  ownerId: string,
  chatId: string,
  file: File
) {
  await preflightUpload(ownerId, chatId, file.size);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = await validateAttachment(bytes, file.type, file.name);
  const extraction = isImageMime(mime)
    ? null
    : await parseDocument(bytes, mime);
  const derivedBytes = extraction
    ? Buffer.byteLength(JSON.stringify(extraction), "utf8")
    : 0;
  if (derivedBytes > 8 * 1024 * 1024) {
    throw new UploadError(422, "提取结果超过存储预算，请拆分文档。");
  }
  const id = randomUUID(),
    name = safeDisplayName(file.name),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  const limits = quotaLimits();
  const local = store();
  await purgeExpiredDrafts(10);
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
    const [settings] =
      await tx`SELECT "enabled" FROM upload_settings WHERE "id"='workspace'`;
    if (!settings?.enabled) {
      throw new UploadError(
        503,
        "附件上传尚未开启，请联系平台管理员配置存储。"
      );
    }
    const [chat] = await tx`SELECT user_id FROM chats WHERE "id"=${chatId}`;
    if (chat && chat.userId !== ownerId) {
      throw new UploadError(403, "会话不属于当前账号。");
    }
    const [quota] =
      await tx`SELECT COALESCE(SUM("size" + derived_bytes),0)::bigint AS total, COALESCE(SUM("size" + derived_bytes) FILTER (WHERE owner_id=${ownerId}),0)::bigint AS own, COUNT(*) FILTER (WHERE owner_id=${ownerId} AND chat_id=${chatId} AND "state" IN ('pending','draft'))::integer AS drafts FROM upload_assets`;
    if (
      Number(quota.total) + bytes.length + derivedBytes > limits.deployment ||
      Number(quota.own) + bytes.length + derivedBytes > limits.user
    ) {
      throw new UploadError(
        429,
        "附件存储配额已满，请移除未发送的附件或联系管理员。"
      );
    }
    if (quota.drafts >= MAX_IMAGES) {
      throw new UploadError(
        400,
        "本会话已有 15 个未发送附件，请先移除或发送。"
      );
    }
    await tx`INSERT INTO upload_assets ("id",owner_id,chat_id,"name","mime","size","sha256","state","extraction",derived_bytes) VALUES (${id},${ownerId},${chatId},${name},${mime},${bytes.length},${sha256},'pending',${extraction ? tx.json(extraction as never) : null},${derivedBytes})`;
  });
  try {
    await local.write(id, bytes);
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
      const [chat] = await tx`SELECT user_id FROM chats WHERE "id"=${chatId}`;
      if (chat && chat.userId !== ownerId) {
        throw new UploadError(403, "会话不属于当前账号。");
      }
      const finalized = await tx<
        { id: string }[]
      >`UPDATE upload_assets SET "state"='draft' WHERE "id"=${id} AND "state"='pending' RETURNING "id"`;
      requireFinalizedUpload(finalized);
    });
  } catch (error) {
    await sql`UPDATE upload_assets SET "state"='deleting' WHERE "id"=${id}`;
    await finishDeletion(id).catch(() => undefined);
    throw error;
  }
  return {
    contentType: mime,
    extraction: extraction
      ? {
          characters: extraction.characters,
          segments: extraction.segments.length,
          status: extraction.status,
          warnings: extraction.warnings,
        }
      : undefined,
    name,
    pathname: id,
    sha256,
    size: bytes.length,
    url: assetRef(id),
  };
}
async function authorizedAsset(id: string, userId: string, chatId?: string) {
  if (!UUID_PATTERN.test(id)) {
    throw new UploadError(404, "附件不存在。");
  }
  const [asset] = await sql<
    (Asset & {
      chatOwnerId: string | null;
      visibility: string | null;
      associated: boolean;
    })[]
  >`SELECT a.*,c.user_id AS "chatOwnerId",c."visibility",EXISTS(SELECT 1 FROM upload_asset_messages am JOIN messages m ON m."id"=am.message_id WHERE am.asset_id=a."id" AND m.chat_id=a.chat_id AND m."parts"::jsonb @> ${sql.json([{ type: "file", url: assetRef(id) }])}::jsonb) AS associated FROM upload_assets a LEFT JOIN chats c ON c."id"=a.chat_id WHERE a."id"=${id}`;
  if (
    !asset ||
    !mayReadAsset(asset, userId) ||
    (chatId && asset.chatId !== chatId)
  ) {
    throw new UploadError(404, "附件不存在或当前账号无权访问。");
  }
  return asset;
}
export async function readAssetForContext(
  id: string,
  userId: string,
  chatId: string
) {
  const asset = await authorizedAsset(id, userId, chatId);
  if (isImageMime(asset.mime)) {
    return readAsset(id, userId, chatId);
  }
  try {
    await store().verify(id, asset.size, asset.sha256);
  } catch {
    // biome-ignore lint/style/useErrorCause: Do not expose private filesystem diagnostics.
    throw new UploadError(410, "附件已失效，请重新上传。");
  }
  let remaining = 2000;
  const segments: { ref: string; text: string }[] = [];
  for (const segment of asset.extraction?.segments ?? []) {
    if (remaining <= 0) {
      break;
    }
    const text = segment.text.slice(0, remaining);
    segments.push({ ref: segment.ref, text });
    remaining -= text.length;
  }
  return {
    extraction: asset.extraction
      ? { ...asset.extraction, segments }
      : undefined,
    mime: asset.mime,
    name: asset.name,
    size: asset.size,
    totalSegments: asset.extraction?.segments.length,
  };
}
export async function readAsset(id: string, userId: string, chatId?: string) {
  const asset = await authorizedAsset(id, userId, chatId);
  let bytes: Buffer;
  try {
    bytes = await store().read(id, asset.size);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
      throw new Error("hash mismatch");
    }
  } catch {
    // biome-ignore lint/style/useErrorCause: Sanitize this boundary error; underlying errors may contain private paths or request content.
    throw new UploadError(410, "附件已失效，请重新上传。");
  }
  return {
    bytes,
    extraction: asset.extraction ?? undefined,
    mime: asset.mime,
    name: asset.name,
    size: asset.size,
  };
}
async function finishDeletion(id: string) {
  await store().delete(id);
  await sql`DELETE FROM upload_assets WHERE "id"=${id} AND "state"='deleting'`;
}
export async function deleteDraft(id: string, ownerId: string) {
  if (!UUID_PATTERN.test(id)) {
    throw new UploadError(404, "附件不存在。");
  }
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
    const [asset] =
      await tx`SELECT * FROM upload_assets WHERE "id"=${id} FOR UPDATE`;
    if (!asset || asset.ownerId !== ownerId) {
      throw new UploadError(404, "附件不存在。");
    }
    if (!["draft", "deleting"].includes(asset.state)) {
      throw new UploadError(409, "已发送或正在处理的附件不支持草稿删除。");
    }
    await tx`UPDATE upload_assets SET "state"='deleting' WHERE "id"=${id}`;
  });
  await finishDeletion(id);
  return { ok: true };
}
export async function purgeExpiredDrafts(limit = 25) {
  const ids = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
    return tx`UPDATE upload_assets SET "state"='deleting' WHERE "id" IN (SELECT "id" FROM upload_assets WHERE ("state" IN ('draft','pending') AND created_at<now()-interval '24 hours') OR "state"='deleting' ORDER BY created_at LIMIT ${Math.min(100, Math.max(1, limit))}) RETURNING "id"`;
  });
  for (const item of ids) {
    // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
    await finishDeletion(item.id).catch(() => undefined);
  }
}
// Commit new chat + canonical message + attachment association in ONE transaction.
// Draft DELETE uses the same lock, so no deletion can win between registration and persistence.
export async function commitUserMessage(input: {
  chatId: string;
  ownerId: string;
  visibility: "public" | "private";
  message: DBMessage;
}) {
  const ids = input.message.parts as { type: string; url?: string }[];
  const assets = [
    ...new Set(
      ids
        .filter((p) => p.type === "file")
        .map((p) => assetIdFromRef(p.url ?? ""))
    ),
  ];
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
    const [existing] =
      await tx`SELECT user_id FROM chats WHERE "id"=${input.chatId} FOR UPDATE`;
    if (existing && existing.userId !== input.ownerId) {
      throw new UploadError(403, "会话不属于当前账号。");
    }
    if (assets.length) {
      const rows =
        await tx`SELECT * FROM upload_assets WHERE "id" IN ${tx(assets)} FOR UPDATE`;
      if (
        rows.length !== assets.length ||
        rows.some(
          (row) =>
            row.ownerId !== input.ownerId ||
            row.chatId !== input.chatId ||
            !["draft", "used"].includes(row.state) ||
            (!isImageMime(row.mime) && !isReadableExtraction(row.extraction))
        )
      ) {
        throw new UploadError(409, "附件已移除或失效，请重新上传。");
      }
    }
    if (!existing) {
      await tx`INSERT INTO chats ("id",created_at,"title",user_id,"visibility") VALUES (${input.chatId},now(),'New chat',${input.ownerId},${input.visibility})`;
    }
    await tx`INSERT INTO messages ("id",chat_id,"role","parts","attachments",created_at) VALUES (${input.message.id},${input.chatId},'user',${tx.json(input.message.parts as never)},'[]'::json,${input.message.createdAt})`;
    for (const id of assets) {
      // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
      await tx`UPDATE upload_assets SET "state"='used' WHERE "id"=${id}`;
      await tx`INSERT INTO upload_asset_messages (asset_id,message_id) VALUES (${id},${input.message.id})`;
    }
  });
}
export async function cleanupDeletedChatAssets(chatId: string) {
  const rows = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
    const [chat] = await tx`SELECT "id" FROM chats WHERE "id"=${chatId}`;
    if (chat) {
      return [];
    }
    return tx`UPDATE upload_assets SET "state"='deleting' WHERE chat_id=${chatId} RETURNING "id"`;
  });
  for (const row of rows as { id: string }[]) {
    // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
    await finishDeletion(row.id).catch(() => undefined);
  }
}

// Tool-only boundary: current authenticated chat owner AND actual committed message association.
// A draft URL, public asset, forged file part or caller-provided chatId is not evidence of association.
export async function readAttachmentAsset(
  id: string,
  userId: string,
  chatId: string
) {
  if (!UUID_PATTERN.test(id)) {
    throw new UploadError(404, "附件不存在。");
  }
  const [asset] = await sql<
    (Asset & { chatOwnerId: string; associated: boolean })[]
  >`SELECT a.*,c.user_id AS "chatOwnerId",EXISTS(SELECT 1 FROM upload_asset_messages am JOIN messages m ON m."id"=am.message_id WHERE am.asset_id=a."id" AND m.chat_id=a.chat_id AND m."parts"::jsonb @> ${sql.json([{ type: "file", url: assetRef(id) }])}::jsonb) AS associated FROM upload_assets a JOIN chats c ON c."id"=a.chat_id WHERE a."id"=${id}`;
  if (
    !asset ||
    asset.ownerId !== userId ||
    asset.chatOwnerId !== userId ||
    asset.chatId !== chatId ||
    asset.state !== "used" ||
    !asset.associated ||
    !asset.extraction
  ) {
    throw new UploadError(404, "附件不存在或尚未关联当前会话。");
  }
  return { extraction: asset.extraction, mime: asset.mime, name: asset.name };
}
