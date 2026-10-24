import type { ChatMessage } from "@/app/_lib/types";
import type { ToolPart } from "../ai-elements/tool";
import { toolNeedsAttention } from "./tool-activity-state";

type Part = ChatMessage["parts"][number];
const specialTools = new Set([
  "getWeather",
  "createDocument",
  "updateDocument",
  "requestSuggestions",
  "createResultTable",
]);

export function isActivityPart(part: Part): part is Part & ToolPart {
  const name =
    part.type === "dynamic-tool"
      ? part.toolName
      : part.type.startsWith("tool-")
        ? part.type.slice(5)
        : null;
  return (
    name !== null && (part.type === "dynamic-tool" || !specialTools.has(name))
  );
}

// Empty SDK text, step markers and these known transport events are nonvisual. Keep
// canonical arrays untouched; only skip these known structural parts in the view.
function isStructuralPart(part: Part) {
  return (
    part.type === "step-start" ||
    part.type === "data-mcp-source" ||
    part.type === "data-chat-title" ||
    part.type === "data-resultTable" ||
    (part.type === "text" && part.text.trim().length === 0)
  );
}

type PartGroup =
  | { kind: "activity"; key: string; parts: ToolPart[] }
  | { kind: "part"; part: Part; index: number };

export function groupActivityParts(parts: ChatMessage["parts"]): PartGroup[] {
  const groups: PartGroup[] = [];
  parts.forEach((part, index) => {
    if (isStructuralPart(part)) {
      return;
    }
    if (isActivityPart(part)) {
      const previous = groups.at(-1);
      if (previous?.kind === "activity") {
        previous.parts.push(part);
      } else {
        groups.push({ key: part.toolCallId, kind: "activity", parts: [part] });
      }
    } else {
      groups.push({ index, kind: "part", part });
    }
  });
  return groups;
}

type MessageEntry = { message: ChatMessage; index: number };
type MessageGroup =
  | {
      kind: "activity";
      key: string;
      messages: MessageEntry[];
      parts: ToolPart[];
    }
  | { kind: "message"; message: ChatMessage; index: number };

export function groupActivityMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  messages.forEach((message, index) => {
    const parts = message.parts.filter((part) => !isStructuralPart(part));
    if (
      message.role === "assistant" &&
      parts.length > 0 &&
      parts.every(isActivityPart)
    ) {
      const previous = groups.at(-1);
      if (previous?.kind === "activity") {
        previous.messages.push({ index, message });
        previous.parts.push(...parts);
      } else {
        groups.push({
          key: message.id,
          kind: "activity",
          messages: [{ index, message }],
          parts: [...parts],
        });
      }
    } else {
      groups.push({ index, kind: "message", message });
    }
  });
  return groups;
}

// Only this native tool defines an output-available { error: string } failure
// contract. A similarly named field in dynamic/MCP output remains raw evidence.
function nativeResultTableError(part: ToolPart) {
  if (
    part.type === "tool-createResultTable" &&
    part.state === "output-available" &&
    part.output !== null &&
    typeof part.output === "object" &&
    "error" in part.output &&
    typeof part.output.error === "string"
  ) {
    return part.output.error;
  }
}

export function activityErrorText(part: ToolPart) {
  return nativeResultTableError(part) ?? part.errorText;
}

export function activityDisplayState(
  part: ToolPart,
  isRunning = false
): ToolPart["state"] {
  if (nativeResultTableError(part) !== undefined) {
    return "output-error";
  }
  if (
    part.state === "approval-responded" &&
    part.approval?.approved === false
  ) {
    return "output-denied";
  }
  if (
    !isRunning &&
    (part.state === "input-streaming" ||
      part.state === "input-available" ||
      part.state === "approval-responded")
  ) {
    return "output-error";
  }
  return part.state;
}

const labels: Record<ToolPart["state"], string> = {
  "approval-requested": "等待确认",
  "approval-responded": "已回应",
  "input-available": "执行中",
  "input-streaming": "准备中",
  "output-available": "已完成",
  "output-denied": "已拒绝",
  "output-error": "失败",
};

export function activitySummary(parts: ToolPart[], isRunning = false) {
  const states = parts.map((part) => activityDisplayState(part, isRunning));
  const priority: ToolPart["state"][] = [
    "approval-requested",
    "output-error",
    "output-denied",
    "input-available",
    "input-streaming",
    "approval-responded",
    "output-available",
  ];
  const state =
    priority.find((candidate) => states.includes(candidate)) ??
    "output-available";
  const attention = parts.flatMap((part, index) =>
    toolNeedsAttention(states[index])
      ? [
          JSON.stringify([
            part.toolCallId,
            states[index],
            "approval" in part ? part.approval?.id : null,
          ]),
        ]
      : []
  );
  return {
    active:
      isRunning &&
      state !== "approval-requested" &&
      states.some((item) =>
        ["input-streaming", "input-available", "approval-responded"].includes(
          item
        )
      ),
    attention,
    count: parts.length,
    label:
      state === "output-error" &&
      !parts.some(
        (part) =>
          part.state === "output-error" ||
          nativeResultTableError(part) !== undefined
      )
        ? "未完成"
        : state === "approval-responded" && isRunning
          ? "执行中"
          : labels[state],
    state,
  };
}

type Summary = ReturnType<typeof activitySummary>;
export type ActivityDisclosure = {
  open: boolean;
  state: Summary["state"];
  attention: string[];
  active: boolean;
};
export function initialActivityDisclosure(
  summary: Summary
): ActivityDisclosure {
  return {
    active: summary.active,
    attention: summary.attention,
    open: summary.active || summary.attention.length > 0,
    state: summary.state,
  };
}
export function reconcileActivityDisclosure(
  current: ActivityDisclosure,
  summary: Summary
): ActivityDisclosure {
  const newAttention = summary.attention.some(
    (event) => !current.attention.includes(event)
  );
  if (
    current.state === summary.state &&
    current.active === summary.active &&
    JSON.stringify(current.attention) === JSON.stringify(summary.attention)
  ) {
    return current;
  }
  return {
    ...initialActivityDisclosure(summary),
    open:
      newAttention || (summary.active && !current.active)
        ? true
        : summary.state === "output-available"
          ? false
          : current.open,
  };
}
