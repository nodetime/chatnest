import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/app/_components/chat/artifact";
import type { VisibilityType } from "@/app/_components/chat/visibility-selector";
import type { ChatMessage } from "@/app/_lib/types";
import { generateUUID } from "@/app/_lib/utils";
import { ChatbotError } from "@/lib/errors";
import {
  prepareMessageEdit,
  prepareRegeneration,
} from "@/server/agent/message-turn";
import {
  assertGenericDocumentDeletionAllowed,
  isProtectedResultTable,
  parseResultTable,
  type ResultTable,
  ResultTableMutationError,
  type ResultView,
  resultViewSchema,
  validView,
  withResultTableView,
} from "@/server/artifacts/result-table";
import {
  type Chat,
  chat,
  type DBMessage,
  document,
  message,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  vote,
} from "@/server/db/schema";
import { generateHashedPassword } from "@/server/db/utils";
import { cleanupDeletedChatAssets } from "@/server/uploads/service";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      email: user.email,
      id: user.id,
    });
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      createdAt: new Date(),
      id,
      title,
      userId,
      visibility,
    });
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    await cleanupDeletedChatAssets(id).catch(() => undefined);
    return chatsDeleted;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await db.delete(vote).where(inArray(vote.chatId, chatIds));
    await db.delete(message).where(inArray(message.chatId, chatIds));
    await db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    await Promise.all(
      chatIds.map((id) => cleanupDeletedChatAssets(id).catch(() => undefined))
    );
    return { deletedCount: deletedChats.length };
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
  search = "",
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
  search?: string;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<unknown>) =>
      db
        .select()
        .from(chat)
        .where(
          and(
            eq(chat.userId, id),
            whereCondition,
            search
              ? ilike(chat.title, `%${search.replace(/[\\%_]/g, "\\$&")}%`)
              : undefined
          )
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(and(eq(chat.id, startingAfter), eq(chat.userId, id)))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(and(eq(chat.id, endingBefore), eq(chat.userId, id)))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await db.transaction(async (tx) => {
      // Cooperate with regeneration: append and replace serialize per chat.
      await tx
        .select({ id: chat.id })
        .from(chat)
        .where(
          inArray(chat.id, [...new Set(messages.map((item) => item.chatId))])
        )
        .orderBy(asc(chat.id))
        .for("update");
      return await tx.insert(message).values(messages);
    });
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function replaceRegeneratedAnswer({
  chatId,
  userId,
  snapshot,
  answer,
}: {
  chatId: string;
  userId: string;
  snapshot: DBMessage[];
  answer: DBMessage;
}) {
  await db.transaction(async (tx) => {
    const [owner] = await tx
      .select()
      .from(chat)
      .where(eq(chat.id, chatId))
      .for("update");
    if (!owner || owner.userId !== userId) {
      throw new ChatbotError("forbidden:chat");
    }
    const current = await tx
      .select()
      .from(message)
      .where(eq(message.chatId, chatId))
      .orderBy(asc(message.createdAt));
    const unchanged =
      current.length === snapshot.length &&
      current.every(
        (item, index) =>
          item.id === snapshot[index].id &&
          item.role === snapshot[index].role &&
          JSON.stringify(item.parts) === JSON.stringify(snapshot[index].parts)
      );
    const prepared = prepareRegeneration(
      current as ChatMessage[],
      current.at(-2)?.id ?? ""
    );
    if (
      !unchanged ||
      !prepared ||
      answer.chatId !== chatId ||
      answer.role !== "assistant" ||
      answer.id !== prepared.answerId ||
      !Array.isArray(answer.parts) ||
      !answer.parts.length
    ) {
      throw new ChatbotError("bad_request:api");
    }
    await tx
      .delete(vote)
      .where(and(eq(vote.chatId, chatId), eq(vote.messageId, answer.id)));
    await tx
      .update(message)
      .set({ attachments: answer.attachments, parts: answer.parts })
      .where(and(eq(message.chatId, chatId), eq(message.id, answer.id)));
  });
}

export async function replaceEditedTurn({
  chatId,
  userId,
  snapshot,
  edited,
  answer,
}: {
  chatId: string;
  userId: string;
  snapshot: DBMessage[];
  edited: ChatMessage;
  answer: DBMessage;
}) {
  await db.transaction(async (tx) => {
    const [owner] = await tx
      .select()
      .from(chat)
      .where(eq(chat.id, chatId))
      .for("update");
    if (!owner || owner.userId !== userId) {
      throw new ChatbotError("forbidden:chat");
    }
    const current = await tx
      .select()
      .from(message)
      .where(eq(message.chatId, chatId))
      .orderBy(asc(message.createdAt));
    const unchanged =
      current.length === snapshot.length &&
      current.every(
        (item, index) =>
          item.id === snapshot[index].id &&
          item.role === snapshot[index].role &&
          JSON.stringify(item.parts) === JSON.stringify(snapshot[index].parts)
      );
    const text = edited.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    const prepared = prepareMessageEdit(
      current as ChatMessage[],
      edited.id,
      text
    );
    if (
      !unchanged ||
      !prepared ||
      JSON.stringify(prepared.edited.parts) !== JSON.stringify(edited.parts) ||
      answer.chatId !== chatId ||
      answer.role !== "assistant" ||
      !Array.isArray(answer.parts) ||
      !answer.parts.length
    ) {
      throw new ChatbotError("bad_request:api");
    }
    const trailing = current.slice(prepared.index + 1).map((item) => item.id);
    if (trailing.length) {
      await tx
        .delete(vote)
        .where(and(eq(vote.chatId, chatId), inArray(vote.messageId, trailing)));
      await tx
        .delete(message)
        .where(and(eq(message.chatId, chatId), inArray(message.id, trailing)));
    }
    // Preserve the edited user row and its committed attachment associations.
    await tx
      .update(message)
      .set({ parts: prepared.edited.parts })
      .where(and(eq(message.chatId, chatId), eq(message.id, edited.id)));
    await tx.insert(message).values(answer);
  });
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    return await db.update(message).set({ parts }).where(eq(message.id, id));
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      isUpvoted: type === "up",
      messageId,
    });
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`
      );
      const docs = await tx
        .select()
        .from(document)
        .where(eq(document.id, id))
        .orderBy(desc(document.createdAt));
      if (
        isProtectedResultTable(content) ||
        docs.some((doc) => isProtectedResultTable(doc.content))
      ) {
        throw new ChatbotError("forbidden:document");
      }
      if (docs.some((doc) => doc.userId !== userId)) {
        throw new ChatbotError("forbidden:document");
      }
      return tx
        .insert(document)
        .values({
          content,
          createdAt: new Date(
            Math.max(Date.now(), (docs[0]?.createdAt.getTime() ?? 0) + 1)
          ),
          id,
          kind,
          title,
          userId,
        })
        .returning();
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`
      );
      const docs = await tx
        .select()
        .from(document)
        .where(eq(document.id, id))
        .orderBy(desc(document.createdAt));
      const [latest] = docs;
      if (!latest) {
        throw new ChatbotError("not_found:document");
      }
      if (
        isProtectedResultTable(content) ||
        docs.some((doc) => isProtectedResultTable(doc.content))
      ) {
        throw new ChatbotError("forbidden:document");
      }
      return tx
        .update(document)
        .set({ content })
        .where(
          and(eq(document.id, id), eq(document.createdAt, latest.createdAt))
        )
        .returning();
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function saveResultTableDocument({
  id,
  title,
  table,
  userId,
}: {
  id: string;
  title: string;
  table: ResultTable;
  userId: string;
}) {
  if (!parseResultTable(JSON.stringify(table))) {
    throw new ResultTableMutationError(400, "Invalid result table");
  }
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`
    );
    const [ownerChat] = await tx
      .select()
      .from(chat)
      .where(and(eq(chat.id, table.chatId), eq(chat.userId, userId)))
      .for("share");
    if (!ownerChat) {
      throw new ResultTableMutationError(403, "Result table chat mismatch");
    }
    const [existing] = await tx
      .select()
      .from(document)
      .where(eq(document.id, id))
      .limit(1);
    if (existing) {
      throw new ResultTableMutationError(409, "Document already exists");
    }
    return tx
      .insert(document)
      .values({
        content: JSON.stringify(table),
        createdAt: new Date(),
        id,
        kind: "sheet",
        title,
        userId,
      })
      .returning();
  });
}

export async function saveResultTableView({
  id,
  chatId,
  userId,
  expectedVersion,
  view,
  notes,
}: {
  id: string;
  chatId: string;
  userId: string;
  expectedVersion: string;
  view: ResultView;
  notes: string;
}) {
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`
    );
    const [latest] = await tx
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt))
      .limit(1)
      .for("update");
    if (!latest) {
      throw new ResultTableMutationError(404, "Document not found");
    }
    const table = parseResultTable(latest.content);
    if (latest.userId !== userId || !table || table.chatId !== chatId) {
      throw new ResultTableMutationError(
        403,
        "Result table ownership or chat mismatch"
      );
    }
    const [ownerChat] = await tx
      .select()
      .from(chat)
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .for("share");
    if (!ownerChat) {
      throw new ResultTableMutationError(403, "Result table chat mismatch");
    }
    if (latest.createdAt.toISOString() !== expectedVersion) {
      throw new ResultTableMutationError(
        409,
        "Version changed; reopen the latest table before saving."
      );
    }
    const parsed = resultViewSchema.safeParse(view);
    if (
      !parsed.success ||
      !validView(table, parsed.data) ||
      typeof notes !== "string" ||
      notes.length > 10_000
    ) {
      throw new ResultTableMutationError(400, "Invalid view or notes");
    }
    return tx
      .insert(document)
      .values({
        ...latest,
        content: JSON.stringify(withResultTableView(table, parsed.data, notes)),
        createdAt: new Date(
          Math.max(Date.now(), latest.createdAt.getTime() + 1)
        ),
      })
      .returning();
  });
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`
      );
      const docs = await tx.select().from(document).where(eq(document.id, id));
      assertGenericDocumentDeletionAllowed(docs.map((doc) => doc.content));
      await tx
        .delete(suggestion)
        .where(
          and(
            eq(suggestion.documentId, id),
            gt(suggestion.documentCreatedAt, timestamp)
          )
        );
      return tx
        .delete(document)
        .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
        .returning();
    });
  } catch (error) {
    if (error instanceof ResultTableMutationError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    const updated = await db
      .update(chat)
      .set({ visibility })
      .where(eq(chat.id, chatId))
      .returning({ id: chat.id });
    return updated.length === 1;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    const updated = await db
      .update(chat)
      .set({ title })
      .where(eq(chat.id, chatId))
      .returning({ id: chat.id });
    return updated.length === 1;
  } catch {
    // Best effort title update.
    return false;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const cutoffTime = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, cutoffTime),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ chatId, createdAt: new Date(), id: streamId });
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}
