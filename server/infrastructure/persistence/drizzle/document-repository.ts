import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { DocumentRepository } from "@/server/domain/document/repository";
import {
  assertGenericDocumentDeletionAllowed,
  isProtectedResultTable,
  parseResultTable,
  ResultTableMutationError,
  resultViewSchema,
  validView,
  withResultTableView,
} from "@/server/domain/document/result-table";
import type { Document } from "@/server/domain/document/types";
import { ChatbotError } from "@/server/shared/errors";
import { db } from "./client";
import { chat, document, suggestion } from "./schema";

// P3:SQL 自 queries.ts 原样下沉,行为零漂移(含 advisory lock 版本化写入与结果表保护)

export const documentRepository: DocumentRepository = {
  async deleteAfterTimestamp({ id, timestamp }) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`
        );
        const docs = await tx
          .select()
          .from(document)
          .where(eq(document.id, id));
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
  },

  async findLatestById(id) {
    try {
      const [selectedDocument] = await db
        .select()
        .from(document)
        .where(eq(document.id, id))
        .orderBy(desc(document.createdAt));

      return selectedDocument as Document | undefined;
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async listById(id) {
    try {
      const documents = await db
        .select()
        .from(document)
        .where(eq(document.id, id))
        .orderBy(asc(document.createdAt));

      return documents as Document[];
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async save({ id, title, kind, content, userId }) {
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
  },

  async saveResultTable({ id, title, table, userId }) {
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
  },

  async saveResultTableView({
    id,
    chatId,
    userId,
    expectedVersion,
    view,
    notes,
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
          content: JSON.stringify(
            withResultTableView(table, parsed.data, notes)
          ),
          createdAt: new Date(
            Math.max(Date.now(), latest.createdAt.getTime() + 1)
          ),
        })
        .returning();
    });
  },

  async updateContent({ id, content }) {
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
  },
};
