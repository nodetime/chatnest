import type { UIMessage } from "ai";

const TOOL_WIRE_PREFIX = /<\/?\s*[|｜]\s*(?:[|｜]\s*)?DSML\s*[|｜]/;
const STREAM_PREFIXES = ["<|DSML|", "<||DSML|", "</|DSML|", "</||DSML|"];

// Reserved provider markers received in prose are not executable tool calls.
// Keep the preceding answer; the rest may be an unclosed argument payload.
export function projectAssistantText(text: string, streaming = false) {
  const marker = text.search(TOOL_WIRE_PREFIX);
  if (marker >= 0) {
    return {
      omitted: text.slice(marker),
      text: text.slice(0, marker).trimEnd(),
    };
  }
  const tail = text.lastIndexOf("<");
  if (tail >= 0 && text.length - tail <= 32) {
    const candidate = text.slice(tail);
    const prefix = candidate.replace(/\s/g, "").replaceAll("｜", "|");
    const truncatedMarker = prefix.endsWith("DSML");
    if (
      (streaming || truncatedMarker) &&
      STREAM_PREFIXES.some((value) => value.startsWith(prefix))
    ) {
      return {
        omitted: truncatedMarker ? candidate : null,
        text: text.slice(0, tail).trimEnd(),
      };
    }
  }
  return { omitted: null, text };
}

type MessagePart = UIMessage["parts"][number];
type TextFragment = { index: number; text: string };

/** Reassemble text within each SDK step, then project back onto the original parts. */
export function projectAssistantParts<Part extends MessagePart>(
  parts: readonly Part[],
  streaming = false
): { omittedReply: string | null; parts: Part[] } {
  const projected = [...parts];
  let omittedReply: string | null = null;
  let text: TextFragment[] = [];
  let reasoning: TextFragment[] = [];

  function project(fragments: TextFragment[], live: boolean) {
    const original = fragments.map((part) => part.text).join("");
    const result = projectAssistantText(original, live);
    if (result.text !== original) {
      let offset = 0;
      for (const fragment of fragments) {
        const end = offset + fragment.text.length;
        const visible = result.text.slice(offset, end);
        if (visible !== fragment.text) {
          projected[fragment.index] = {
            ...projected[fragment.index],
            text: visible,
          };
        }
        offset = end;
      }
    }
    return original.trim() ? result : undefined;
  }

  function finishStep(live: boolean) {
    const reply = project(text, live);
    if (reply) {
      omittedReply = reply.omitted;
    }
    project(reasoning, live);
    text = [];
    reasoning = [];
  }

  for (const [index, part] of parts.entries()) {
    if (part.type === "step-start") {
      finishStep(false);
    } else if (part.type === "text") {
      text.push({ index, text: part.text });
    } else if (part.type === "reasoning") {
      reasoning.push({ index, text: part.text });
    }
  }
  finishStep(streaming);
  return { omittedReply, parts: projected };
}

export function visibleMessageText(message: UIMessage, separator = "\n") {
  const parts =
    message.role === "assistant"
      ? projectAssistantParts(message.parts).parts
      : message.parts;
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .filter((text) => text.trim())
    .join(separator);
}
