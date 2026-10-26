import { createUIMessageStreamResponse, generateId } from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import type { sendMessage } from "@/server/application/chat/send-message";
import { getUseCases } from "@/server/composition";
import { getEnv } from "@/server/shared/env";
import { ChatbotError } from "@/server/shared/errors";
import { uploadErrorResponse } from "@/server/shared/uploads/security";
import {
  readBoundedBody,
  UploadError,
} from "@/server/shared/uploads/validation";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

// 平台层请求装配:体解析 + 断线续流登记 + Response 组装(HTTP 细节不进应用层)

// Includes approval continuation tool payloads; original image bytes are never client JSON.
const MAX_CHAT_REQUEST_BYTES = 1024 * 1024;

export async function parseChatRequestBody(
  request: Request
): Promise<
  { ok: true; body: PostRequestBody } | { ok: false; response: Response }
> {
  try {
    const json = JSON.parse(
      (await readBoundedBody(request, MAX_CHAT_REQUEST_BYTES)).toString("utf8")
    );
    const parsed = postRequestBodySchema.safeParse(json);
    if (!parsed.success) {
      if (parsed.error.issues.some((issue) => issue.path.includes("url"))) {
        return {
          ok: false,
          response: uploadErrorResponse(
            new UploadError(
              400,
              "仅支持本平台上传的图片；旧版外部附件请重新上传。"
            )
          ),
        };
      }
      return {
        ok: false,
        response: new ChatbotError("bad_request:api").toResponse(),
      };
    }
    return { body: parsed.data, ok: true };
  } catch (error) {
    if (error instanceof UploadError) {
      return { ok: false, response: uploadErrorResponse(error) };
    }
    return {
      ok: false,
      response: new ChatbotError("bad_request:api").toResponse(),
    };
  }
}

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch {
    return null;
  }
}

// 平台层错误映射:用例抛出的业务错误/网关特判/未知错误统一转 Response(与迁移前 catch 块一致)
export function mapChatError(error: unknown, request: Request): Response {
  if (error instanceof UploadError) {
    return uploadErrorResponse(error);
  }
  if (error instanceof ChatbotError) {
    return error.toResponse();
  }
  if (
    error instanceof Error &&
    error.message?.includes(
      "AI Gateway requires a valid credit card on file to service requests"
    )
  ) {
    return new ChatbotError("bad_request:activate_gateway").toResponse();
  }
  const vercelId = request.headers.get("x-vercel-id");
  console.error("Unhandled error in chat API:", error, { vercelId });
  return new ChatbotError("offline:chat").toResponse();
}

export function chatStreamResponse(
  stream: Awaited<ReturnType<typeof sendMessage>>,
  chatId: string
) {
  return createUIMessageStreamResponse({
    async consumeSseStream({ stream: sseStream }) {
      if (!getEnv().REDIS_URL) {
        return;
      }
      try {
        const streamContext = getStreamContext();
        if (streamContext) {
          // 续流 ID 沿用 ai 的 generateId(与迁移前一致),不换 uuid 形态
          const streamId = generateId();
          await getUseCases().registerResumeStream(chatId, streamId);
          await streamContext.createNewResumableStream(
            streamId,
            () => sseStream
          );
        }
      } catch {
        /* non-critical */
      }
    },
    stream,
  });
}
