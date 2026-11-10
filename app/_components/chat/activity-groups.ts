import type { ChatMessage } from "@/app/_lib/types";
import { todoPlanSchema } from "@/server/domain/message/agent-interactions";
import { MCP_RESULT_OMITTED_MESSAGE } from "@/server/domain/message/mcp-output";
import type { ToolPart } from "../ai-elements/tool";
import { toolNeedsAttention } from "./tool-activity-state";

type Part = ChatMessage["parts"][number];
const specialTools = new Set([
  "bash",
  "writeFile",
  "getWeather",
  "askUser",
  "createDocument",
  "updateDocument",
  "editDocument",
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
    (part.type === "tool-updateTodo" &&
      part.state === "output-available" &&
      todoPlanSchema.safeParse(part.output).success) ||
    part.type === "step-start" ||
    part.type === "data-mcp-source" ||
    (part.type === "data-run-status" && part.data?.state === "resumed") ||
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

// Only these exact native tools define { error: string } business failures.
// A similarly named field in dynamic/MCP output remains raw evidence.
function nativeToolError(part: ToolPart) {
  if (
    [
      "tool-createResultTable",
      "tool-createDocument",
      "tool-updateDocument",
      "tool-editDocument",
      "tool-requestSuggestions",
      "tool-executeCode",
      "tool-bash",
      "tool-writeFile",
      "tool-viewImage",
    ].includes(part.type) &&
    part.state === "output-available" &&
    part.output !== null &&
    typeof part.output === "object" &&
    "error" in part.output &&
    typeof part.output.error === "string"
  ) {
    return part.output.error;
  }
}

/** A confirmed no-write conflict can be followed by a successful save in this turn. */
export function artifactEditHasLaterSave(part: ToolPart, following: Part[]) {
  if (
    part.type !== "tool-editDocument" ||
    nativeToolError(part) !== "old_string not found in document" ||
    !part.input ||
    typeof part.input !== "object" ||
    !("id" in part.input) ||
    typeof part.input.id !== "string"
  ) {
    return false;
  }
  const { id } = part.input;
  return following.some((later) => {
    if (
      (later.type !== "tool-editDocument" &&
        later.type !== "tool-updateDocument") ||
      later.state !== "output-available" ||
      !later.output ||
      typeof later.output !== "object" ||
      "error" in later.output ||
      ("content" in later.output &&
        later.output.content ===
          "No changes needed; the saved content already matches.")
    ) {
      return false;
    }
    return (
      "id" in later.output &&
      later.output.id === id &&
      "savedContent" in later.output &&
      typeof later.output.savedContent === "string"
    );
  });
}

/** 只解释已知工具契约；任意供应商错误不作为保存状态或用户指令。 */
export function activityFailureMessage(part: ToolPart, kind = "tool") {
  const error = nativeToolError(part);
  if (
    part.type === "dynamic-tool" &&
    part.state === "output-error" &&
    part.errorText === MCP_RESULT_OMITTED_MESSAGE
  ) {
    return "上游结果过大，本次未取得完整结果。";
  }
  if (part.type === "tool-bash" || part.type === "tool-writeFile") {
    return "文件处理未完成，请查看执行详情；已保存的文件仍可打开。";
  }
  if (
    part.type === "tool-editDocument" &&
    error === "old_string not found in document"
  ) {
    return "修改未保存：待替换内容与当前文件不匹配，原文件未改动。";
  }
  if (
    [
      "tool-createDocument",
      "tool-editDocument",
      "tool-updateDocument",
    ].includes(part.type) &&
    error === "Forbidden"
  ) {
    return "当前没有权限访问这份文件。";
  }
  if (
    ["tool-editDocument", "tool-updateDocument"].includes(part.type) &&
    error === "Document not found"
  ) {
    return "未找到要修改的文件，本次修改未保存。";
  }
  if (part.type === "tool-readAttachment") {
    return "附件内容未能读取，相关内容尚未核实。";
  }
  if (part.type === "tool-viewImage") {
    return "图片未能读取，相关外观尚未核实。";
  }
  if (["tool-editDocument", "tool-updateDocument"].includes(part.type)) {
    return "文件修改未完成，保存结果尚未确认。";
  }
  if (["tool-createDocument", "tool-createResultTable"].includes(part.type)) {
    return "文件生成未完成，保存结果尚未确认。";
  }
  if (kind === "web") {
    return "网页内容未能读取，相关信息尚未核实。";
  }
  if (kind === "search") {
    return "本次搜索未返回有效结果，相关信息尚未核实。";
  }
  return "本次操作未返回有效结果，完成情况尚未确认。";
}

export function activityDisplayState(
  part: ToolPart,
  isRunning = false
): ToolPart["state"] {
  if (nativeToolError(part) !== undefined) {
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
          part.state === "output-error" || nativeToolError(part) !== undefined
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
  manual?: boolean;
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
    open: summary.attention.length > 0,
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
    manual: newAttention ? false : current.manual,
    open: newAttention
      ? true
      : current.manual
        ? current.open
        : summary.state === "output-available"
          ? false
          : current.open,
  };
}
