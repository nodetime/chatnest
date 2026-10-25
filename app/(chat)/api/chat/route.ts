import { geolocation, ipAddress } from "@vercel/functions";
import { checkBotId } from "botid/server";
import { headers } from "next/headers";
import { auth } from "@/app/(auth)/auth";
import { withModelSettings } from "@/server/ai/model-settings/runtime";
import { getUseCases } from "@/server/composition";
import type { ChatSession } from "@/server/domain/user/types";
import { ChatbotError } from "@/server/shared/errors";
import { getLogger } from "@/server/shared/logger";
import { runWithTraceId } from "@/server/shared/request-context";
import {
  chatStreamResponse,
  mapChatError,
  parseChatRequestBody,
} from "./request";

// 平台层(P2 后):traceId、auth、zod 解析、botId、geo/网络上下文提取、错误映射、Response 组装。
// 业务编排(模型/工具/流/持久化)在 server/application/chat/send-message.ts。

export const maxDuration = 300;

export async function POST(request: Request) {
  // proxy.ts 注入的 x-trace-id 进入 ALS,本请求内 logger 自动携带
  const traceId =
    request.headers.get("x-trace-id") ??
    (await headers()).get("x-trace-id") ??
    "no-trace";
  return runWithTraceId(traceId, () => handleChatPost(request));
}

async function handleChatPost(request: Request) {
  getLogger("chat").info("chat 请求进入");
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  try {
    return await withModelSettings(() =>
      postWithModelSettings(request, session)
    );
  } catch {
    return new ChatbotError("offline:configuration").toResponse();
  }
}

async function postWithModelSettings(request: Request, session: ChatSession) {
  try {
    const parsed = await parseChatRequestBody(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    const botIdResult = await checkBotId().catch(() => null);
    if (botIdResult?.isBot) {
      return new ChatbotError("forbidden:api").toResponse();
    }

    const { longitude, latitude, city, country } = geolocation(request);
    const stream = await getUseCases().sendMessage({
      body: parsed.body,
      ip: ipAddress(request),
      requestHints: { city, country, latitude, longitude },
      session,
      signal: request.signal,
    });
    return chatStreamResponse(stream, parsed.body.id);
  } catch (error) {
    return mapChatError(error, request);
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  try {
    const deletedChat = await getUseCases().deleteChat({
      id,
      userId: session.user.id,
    });
    return Response.json(deletedChat, { status: 200 });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    throw error;
  }
}
