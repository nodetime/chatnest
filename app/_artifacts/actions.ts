"use server";

import { getUseCases } from "@/server/composition";

export async function getSuggestions({ documentId }: { documentId: string }) {
  const suggestions =
    await getUseCases().suggestions.listByDocumentId(documentId);
  return suggestions ?? [];
}
