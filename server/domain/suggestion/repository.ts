import type { Suggestion } from "@/server/db/schema";

// suggestion 仓储契约:面向领域声明,实现落 infrastructure/persistence/drizzle
export interface SuggestionRepository {
  listByDocumentId: (documentId: string) => Promise<Suggestion[]>;
  saveMany: (suggestions: Suggestion[]) => Promise<unknown>;
}
