import { z } from "zod";
import { convertToUIMessages } from "@/app/_lib/utils";
import { auth } from "@/app/(auth)/auth";
import { getUseCases } from "@/server/composition";
import { redactPersonalSkillOutputs } from "@/server/domain/capability/projection";

const chatIdSchema = z.uuid();
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = chatIdSchema.safeParse(searchParams.get("chatId"));
  if (!parsed.success) {
    return Response.json({ code: "INVALID_CHAT_ID" }, { headers, status: 400 });
  }

  const chatId = parsed.data;
  const useCases = getUseCases();
  const [session, chat] = await Promise.all([
    auth(),
    useCases.chats.findById(chatId),
  ]);

  if (!chat) {
    return Response.json(
      { isReadonly: false, messages: [], userId: null, visibility: "private" },
      { headers }
    );
  }

  const isReadonly = !session?.user || session.user.id !== chat.userId;
  if (chat.visibility === "private" && isReadonly) {
    return session?.user
      ? Response.json({ code: "FORBIDDEN" }, { headers, status: 403 })
      : Response.json({ code: "UNAUTHORIZED" }, { headers, status: 401 });
  }
  const messages = await useCases.messages.listByChatId(chatId);
  return Response.json(
    {
      isReadonly,
      messages: convertToUIMessages(
        isReadonly ? redactPersonalSkillOutputs(messages) : messages
      ),
      title: chat.title,
      userId: chat.userId,
      visibility: chat.visibility,
    },
    { headers }
  );
}
