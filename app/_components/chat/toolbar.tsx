// biome-ignore-all lint/performance/noJsxPropsBind: Menu items delegate existing user-selected artifact actions.
"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { MoreHorizontal, Square, WrenchIcon } from "lucide-react";
import { useCallback } from "react";
import {
  type ArtifactKind,
  artifactDefinitions,
} from "@/app/_components/chat/artifact";
import type { ArtifactToolbarItem } from "@/app/_components/chat/create-artifact";
import { Button } from "@/app/_components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/_components/ui/dropdown-menu";
import type { ChatMessage } from "@/app/_lib/types";

const createFixErrorTool = (
  consoleOutput: string,
  documentId?: string
): ArtifactToolbarItem => ({
  description: "修复代码错误",
  icon: <WrenchIcon className="size-4" />,
  onClick: ({ sendMessage: send }) => {
    send({
      parts: [
        {
          text: `Fix the error in the existing script${documentId ? ` (id: ${documentId})` : ""} using updateDocument. Do not create a new script. Console error:\n\n${consoleOutput}`,
          type: "text",
        },
      ],
      role: "user",
    });
  },
});

export function Toolbar({
  sendMessage,
  status,
  stop,
  setMessages,
  artifactKind,
  consoleError,
  documentId,
}: {
  status: UseChatHelpers<ChatMessage>["status"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  artifactKind: ArtifactKind;
  consoleError?: string;
  documentId?: string;
}) {
  const handleStop = useCallback(() => {
    stop();
    setMessages((messages) => messages);
  }, [setMessages, stop]);
  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifactKind
  );
  if (!artifactDefinition) {
    throw new Error("Artifact definition not found!");
  }
  // Keep every existing assistant action. A console failure adds the repair
  // action rather than hiding the original first action.
  const tools = consoleError
    ? [
        createFixErrorTool(consoleError, documentId),
        ...artifactDefinition.toolbar,
      ]
    : artifactDefinition.toolbar;
  if (tools.length === 0) {
    return null;
  }
  const busy = status === "streaming" || status === "submitted";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="更多产物操作"
          className="size-9 rounded-md text-muted-foreground"
          size="icon"
          variant="ghost"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          让 Agent 继续修改
        </DropdownMenuLabel>
        {tools.map((tool) => (
          <DropdownMenuItem
            className="min-h-9 gap-2 text-sm"
            disabled={busy}
            key={tool.description}
            onSelect={() => tool.onClick({ sendMessage })}
          >
            <span className="text-muted-foreground [&_svg]:size-4">
              {tool.icon}
            </span>
            {tool.description}
          </DropdownMenuItem>
        ))}
        {!!busy && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-9" onSelect={handleStop}>
              <Square className="size-4" />
              停止生成
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
