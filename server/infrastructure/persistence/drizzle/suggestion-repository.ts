import { eq } from "drizzle-orm";
import type { SuggestionRepository } from "@/server/domain/suggestion/repository";
import { ChatbotError } from "@/server/shared/errors";
import { db } from "./client";
import { suggestion } from "./schema";

// P3:SQL 自 queries.ts 原样下沉,行为零漂移
export const suggestionRepository: SuggestionRepository = {
  listByDocumentId(documentId) {
    return db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId))
      .catch((error: unknown) => {
        throw new ChatbotError("bad_request:database", { cause: error });
      });
  },
  saveMany(suggestions) {
    return db
      .insert(suggestion)
      .values(suggestions as never)
      .catch((error: unknown) => {
        throw new ChatbotError("bad_request:database", { cause: error });
      });
  },
};
