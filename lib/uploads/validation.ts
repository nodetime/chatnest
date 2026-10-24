import sharp from "sharp";
import { decodeCapacity, UploadCapacityError } from "@/lib/uploads/capacity";
import {
  ATTACHMENT_MIMES,
  DOCUMENT_MIMES,
  isImageMime,
  MAX_DOCUMENT_BYTES,
} from "@/lib/uploads/document-types";
import { UUID_PATTERN } from "@/lib/uploads/refs";

export { MAX_CONTEXT_BYTES, MAX_IMAGES } from "@/lib/uploads/limits";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_REQUEST_BYTES = MAX_DOCUMENT_BYTES + 64 * 1024;
export class UploadError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function safeDisplayName(name: string) {
  return (
    name
      .split(/[\\/]/)
      .pop()
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Strip control characters from untrusted UTF-8 display filenames.
      ?.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
      .normalize("NFC")
      .slice(0, 200) || "image"
  );
}
function validateStaticPngChunks(bytes: Buffer) {
  let offset = 8;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const next = offset + length + 12;
    if (next > bytes.length) {
      throw new UploadError(400, "PNG 数据块损坏，请重新选择图片。");
    }
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (offset === 8 && (type !== "IHDR" || length !== 13)) {
      throw new UploadError(400, "PNG 文件头无效。");
    }
    if (type === "acTL") {
      throw new UploadError(400, "仅支持静态 PNG，暂不支持 APNG 动画。");
    }
    if (type === "IEND") {
      if (length !== 0 || next !== bytes.length) {
        throw new UploadError(400, "PNG 结束数据块无效。");
      }
      ended = true;
      break;
    }
    offset = next;
  }
  if (!ended) {
    throw new UploadError(400, "PNG 数据块不完整。");
  }
}
export async function validateImage(bytes: Buffer, declared: string) {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) {
    throw new UploadError(400, "图片必须非空，且每张不超过 5 MiB。");
  }
  const mime = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : null;
  if (!mime || declared !== mime) {
    throw new UploadError(400, "仅支持内容和类型一致的 JPEG 或 PNG 图片。");
  }
  if (mime === "image/png") {
    validateStaticPngChunks(bytes);
  }
  try {
    // Decode for integrity only. Store/hash/serve the untouched original buffer.
    await decodeCapacity.run(async () => {
      const image = sharp(bytes, {
        animated: false,
        failOn: "warning",
        limitInputPixels: 16_000_000,
      });
      const info = await image.metadata();
      if (info.pages && info.pages > 1) {
        throw new Error("animated");
      }
      await image.raw().toBuffer();
    });
  } catch (error) {
    if (error instanceof UploadCapacityError) {
      // biome-ignore lint/style/useErrorCause: Preserve the user-facing busy status without serializing internal errors.
      throw new UploadError(429, error.message);
    }
    // biome-ignore lint/style/useErrorCause: Sanitize this boundary error; underlying errors may contain private paths or request content.
    throw new UploadError(
      400,
      "图片损坏、尺寸过大或格式不受支持，请重新选择 JPEG/PNG。"
    );
  }
  return mime;
}
export async function readBoundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) {
    throw new UploadError(413, "请求内容过大。");
  }
  if (!request.body) {
    throw new UploadError(400, "请求内容为空。");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new UploadError(413, "请求内容过大。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
export async function readUploadForm(request: Request) {
  const bytes = await readBoundedBody(request, MAX_REQUEST_BYTES);
  let form: FormData;
  try {
    form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    // biome-ignore lint/style/useErrorCause: Sanitize this boundary error; underlying errors may contain private paths or request content.
    throw new UploadError(400, "上传表单格式错误。");
  }
  if (
    form.getAll("file").length !== 1 ||
    form.getAll("chatId").length !== 1 ||
    [...form.keys()].some((k) => k !== "file" && k !== "chatId")
  ) {
    throw new UploadError(400, "一次只上传一个附件，并指定会话。");
  }
  const file = form.get("file"),
    chatId = form.get("chatId");
  if (
    !(file instanceof File) ||
    typeof chatId !== "string" ||
    !UUID_PATTERN.test(chatId)
  ) {
    throw new UploadError(400, "附件或会话标识无效。");
  }
  return { chatId, file };
}

export async function validateAttachment(
  bytes: Buffer,
  declared: string,
  name: string
) {
  const ext = name.split(".").pop()?.toLowerCase();
  const byExtension: Record<string, string> = {
    csv: "text/csv",
    docx: DOCUMENT_MIMES[1],
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    pdf: DOCUMENT_MIMES[0],
    png: "image/png",
    txt: "text/plain",
    xlsx: DOCUMENT_MIMES[2],
  };
  const mime = byExtension[ext ?? ""];
  if (
    !mime ||
    !ATTACHMENT_MIMES.includes(mime as (typeof ATTACHMENT_MIMES)[number])
  ) {
    throw new UploadError(
      400,
      "仅支持 JPEG/PNG、PDF、DOCX、XLSX、CSV 和 UTF-8 TXT；旧版 Office 和宏文件请另存为普通格式。"
    );
  }
  if (
    declared &&
    declared !== mime &&
    declared !== "application/octet-stream" &&
    !(mime === "text/csv" && declared === "application/vnd.ms-excel")
  ) {
    throw new UploadError(400, "文件扩展名与声明类型不一致。");
  }
  if (isImageMime(mime)) {
    return await validateImage(bytes, mime);
  }
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) {
    throw new UploadError(400, "文档必须非空，且不超过 64 MiB。");
  }
  return mime;
}
