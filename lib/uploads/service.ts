import "server-only";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import type { DBMessage } from "../db/schema";
import { LocalUploadStore, quotaLimits, storageDirectory } from "./local-store";
import { assetIdFromRef, assetRef, UUID_PATTERN } from "./refs";
import { mayReadAsset, requireFinalizedUpload } from "./security";
import {
  MAX_CONTEXT_BYTES,
  MAX_FILE_BYTES,
  MAX_IMAGES,
  safeDisplayName,
  UploadError,
  validateImage,
} from "./validation";

const sql = postgres(process.env.POSTGRES_URL ?? "");
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
    await sql`SELECT "enabled","revision" FROM "UploadSettings" WHERE "id"='workspace'`;
  if (!row) {
    throw new UploadError(503, "请先运行数据库迁移。");
  }
  return {
    configured,
    driver: "local",
    enabled: row.enabled as boolean,
    formats: ["image/jpeg", "image/png"],
    maxContextBytes: MAX_CONTEXT_BYTES,
    maxFileBytes: MAX_FILE_BYTES,
    maxImages: MAX_IMAGES,
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
    return tx`UPDATE "UploadSettings" SET "enabled"=${enabled},"revision"="revision"+1,"updatedAt"=now(),"updatedBy"=${userId} WHERE "id"='workspace' AND "revision"=${revision} RETURNING "revision"`;
  });
  if (!result.length) {
    throw new UploadError(409, "存储设置已更新，请刷新后重试。");
  }
  return storageStatus();
}
export async function registerUpload(
  ownerId: string,
  chatId: string,
  file: File
) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = await validateImage(bytes, file.type);
  const id = randomUUID(),
    name = safeDisplayName(file.name),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  const limits = quotaLimits();
  const local = store();
  await purgeExpiredDrafts(10);
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
    const [settings] =
      await tx`SELECT "enabled" FROM "UploadSettings" WHERE "id"='workspace'`;
    if (!settings?.enabled) {
      throw new UploadError(
        503,
        "图片上传尚未开启，请联系平台管理员配置存储。"
      );
    }
    const [chat] = await tx`SELECT "userId" FROM "Chat" WHERE "id"=${chatId}`;
    if (chat && chat.userId !== ownerId) {
      throw new UploadError(403, "会话不属于当前账号。");
    }
    const [quota] =
      await tx`SELECT COALESCE(SUM("size"),0)::bigint AS total, COALESCE(SUM("size") FILTER (WHERE "ownerId"=${ownerId}),0)::bigint AS own, COUNT(*) FILTER (WHERE "ownerId"=${ownerId} AND "chatId"=${chatId} AND "state" IN ('pending','draft'))::integer AS drafts FROM "UploadAsset"`;
    if (
      Number(quota.total) + bytes.length > limits.deployment ||
      Number(quota.own) + bytes.length > limits.user
    ) {
      throw new UploadError(
        429,
        "附件存储配额已满，请移除未发送的图片或联系管理员。"
      );
    }
    if (quota.drafts >= MAX_IMAGES) {
      throw new UploadError(
        400,
        "本会话已有 15 张未发送图片，请先移除或发送。"
      );
    }
    await tx`INSERT INTO "UploadAsset" ("id","ownerId","chatId","name","mime","size","sha256","state") VALUES (${id},${ownerId},${chatId},${name},${mime},${bytes.length},${sha256},'pending')`;
  });
  try {
    await local.write(id, bytes);
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
      const [chat] = await tx`SELECT "userId" FROM "Chat" WHERE "id"=${chatId}`;
      if (chat && chat.userId !== ownerId) {
        throw new UploadError(403, "会话不属于当前账号。");
      }
      const finalized = await tx<
        { id: string }[]
      >`UPDATE "UploadAsset" SET "state"='draft' WHERE "id"=${id} AND "state"='pending' RETURNING "id"`;
      requireFinalizedUpload(finalized);
    });
  } catch (error) {
    await sql`UPDATE "UploadAsset" SET "state"='deleting' WHERE "id"=${id}`;
    await finishDeletion(id).catch(() => undefined);
    throw error;
  }
  return {
    contentType: mime,
    name,
    pathname: id,
    sha256,
    size: bytes.length,
    url: assetRef(id),
  };
}
export async function readAsset(id: string, userId: string, chatId?: string) {
  if (!UUID_PATTERN.test(id)) {
    throw new UploadError(404, "附件不存在。");
  }
  const [asset] = await sql<
    (Asset & {
      chatOwnerId: string | null;
      visibility: string | null;
      associated: boolean;
    })[]
  >`SELECT a.*,c."userId" AS "chatOwnerId",c."visibility",EXISTS(SELECT 1 FROM "UploadAssetMessage" am JOIN "Message_v2" m ON m."id"=am."messageId" WHERE am."assetId"=a."id" AND m."chatId"=a."chatId" AND m."parts"::jsonb @> ${sql.json([{ type: "file", url: assetRef(id) }])}::jsonb) AS associated FROM "UploadAsset" a LEFT JOIN "Chat" c ON c."id"=a."chatId" WHERE a."id"=${id}`;
  if (
    !asset ||
    !mayReadAsset(asset, userId) ||
    (chatId && asset.chatId !== chatId)
  ) {
    throw new UploadError(404, "附件不存在或当前账号无权访问。");
  }
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
  return { bytes, mime: asset.mime, name: asset.name, size: asset.size };
}
async function finishDeletion(id: string) {
  await store().delete(id);
  await sql`DELETE FROM "UploadAsset" WHERE "id"=${id} AND "state"='deleting'`;
}
export async function deleteDraft(id: string, ownerId: string) {
  if (!UUID_PATTERN.test(id)) {
    throw new UploadError(404, "附件不存在。");
  }
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
    const [asset] =
      await tx`SELECT * FROM "UploadAsset" WHERE "id"=${id} FOR UPDATE`;
    if (!asset || asset.ownerId !== ownerId) {
      throw new UploadError(404, "附件不存在。");
    }
    if (!["draft", "deleting"].includes(asset.state)) {
      throw new UploadError(409, "已发送或正在处理的附件不支持草稿删除。");
    }
    await tx`UPDATE "UploadAsset" SET "state"='deleting' WHERE "id"=${id}`;
  });
  await finishDeletion(id);
  return { ok: true };
}
export async function purgeExpiredDrafts(limit = 25) {
  const ids = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
    return tx`UPDATE "UploadAsset" SET "state"='deleting' WHERE "id" IN (SELECT "id" FROM "UploadAsset" WHERE ("state" IN ('draft','pending') AND "createdAt"<now()-interval '24 hours') OR "state"='deleting' ORDER BY "createdAt" LIMIT ${Math.min(100, Math.max(1, limit))}) RETURNING "id"`;
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
      await tx`SELECT "userId" FROM "Chat" WHERE "id"=${input.chatId} FOR UPDATE`;
    if (existing && existing.userId !== input.ownerId) {
      throw new UploadError(403, "会话不属于当前账号。");
    }
    if (assets.length) {
      const rows =
        await tx`SELECT * FROM "UploadAsset" WHERE "id" IN ${tx(assets)} FOR UPDATE`;
      if (
        rows.length !== assets.length ||
        rows.some(
          (row) =>
            row.ownerId !== input.ownerId ||
            row.chatId !== input.chatId ||
            !["draft", "used"].includes(row.state)
        )
      ) {
        throw new UploadError(409, "附件已移除或失效，请重新上传。");
      }
    }
    if (!existing) {
      await tx`INSERT INTO "Chat" ("id","createdAt","title","userId","visibility") VALUES (${input.chatId},now(),'New chat',${input.ownerId},${input.visibility})`;
    }
    await tx`INSERT INTO "Message_v2" ("id","chatId","role","parts","attachments","createdAt") VALUES (${input.message.id},${input.chatId},'user',${tx.json(input.message.parts as never)},'[]'::json,${input.message.createdAt})`;
    for (const id of assets) {
      // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
      await tx`UPDATE "UploadAsset" SET "state"='used' WHERE "id"=${id}`;
      await tx`INSERT INTO "UploadAssetMessage" ("assetId","messageId") VALUES (${id},${input.message.id})`;
    }
  });
}
export async function cleanupDeletedChatAssets(chatId: string) {
  const rows = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK})`;
    const [chat] = await tx`SELECT "id" FROM "Chat" WHERE "id"=${chatId}`;
    if (chat) {
      return [];
    }
    return tx`UPDATE "UploadAsset" SET "state"='deleting' WHERE "chatId"=${chatId} RETURNING "id"`;
  });
  for (const row of rows as { id: string }[]) {
    // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
    await finishDeletion(row.id).catch(() => undefined);
  }
}
