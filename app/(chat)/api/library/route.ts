import { auth } from "@/app/(auth)/auth";
import { getUseCases } from "@/server/composition";
import { ChatbotError } from "@/server/shared/errors";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:document").toResponse();
  }
  try {
    const cases = getUseCases();
    const entries = await cases.documents.listRecentByUser(session.user.id);
    // A protected result table additionally requires an existing owned chat.
    const visible = await Promise.all(
      entries.map(async (entry) => {
        if (!entry.chatId) {
          return entry;
        }
        const chat = await cases.chats.findById(entry.chatId);
        return chat?.userId === session.user.id ? entry : null;
      })
    );
    return Response.json(visible.filter(Boolean), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return new ChatbotError("bad_request:database").toResponse();
  }
}
