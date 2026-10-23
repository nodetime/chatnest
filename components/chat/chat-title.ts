type TitleMessage = { role: string; parts?: readonly unknown[] };
const cleanTitle = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

/** Only native title data and real user text participate in this presentation. */
export function projectChatTitle({
  liveTitle,
  persistedTitle,
  messages,
}: {
  liveTitle?: unknown;
  persistedTitle?: unknown;
  messages: readonly TitleMessage[];
}): string {
  const explicit = cleanTitle(liveTitle) || cleanTitle(persistedTitle);
  if (explicit) {
    return explicit;
  }
  const user = messages.find((message) => message.role === "user");
  const text = (user?.parts ?? [])
    .flatMap((part) => {
      if (
        typeof part !== "object" ||
        part === null ||
        !("type" in part) ||
        part.type !== "text" ||
        !("text" in part)
      ) {
        return [];
      }
      return typeof part.text === "string" ? [part.text] : [];
    })
    .join(" ");
  return cleanTitle(text).slice(0, 100) || "新对话";
}
