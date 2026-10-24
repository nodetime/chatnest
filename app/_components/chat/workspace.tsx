// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes workspace event closures.
"use client";
import { FileText } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { artifactCatalog } from "@/app/_components/chat/artifact-catalog";
import { ArtifactPicker } from "@/app/_components/chat/artifact-picker";
import { BrowserWorkspace } from "@/app/_components/chat/browser-workspace";
import { ConversationSources } from "@/app/_components/chat/conversation-sources";
import { WorkspaceHeader } from "@/app/_components/chat/workspace-header";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import { useArtifact } from "@/app/_hooks/use-artifact";
import { useWorkspace } from "@/app/_hooks/use-workspace";
import { cn } from "@/app/_lib/utils";
import { browserWorkspaceEvents } from "@/server/agent/workspace-events";

export function Workspace({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  const { artifact } = useArtifact();
  const { chatId, messages, status } = useActiveChat();
  const entries = artifactCatalog(messages);
  const pane = useRef<HTMLElement>(null);
  const previousArtifact = useRef({ id: "init", visible: false });
  const previousChat = useRef(chatId);
  const browserCalls = useRef(new Set<string>());
  const artifactId = artifact.documentId;
  const visible = artifact.isVisible;
  useEffect(() => {
    if (previousChat.current !== chatId) {
      previousChat.current = chatId;
      previousArtifact.current = { id: "init", visible: false };
      browserCalls.current.clear();
      return;
    }
    if (
      visible &&
      (!previousArtifact.current.visible ||
        previousArtifact.current.id !== artifactId)
    ) {
      workspace.show("document");
    }
    if (
      !visible &&
      previousArtifact.current.visible &&
      workspace.tab === "document"
    ) {
      workspace.close();
    }
    previousArtifact.current = { id: artifactId, visible };
  }, [
    chatId,
    visible,
    artifactId,
    workspace.show,
    workspace.tab,
    workspace.close,
  ]);
  useEffect(() => {
    for (const callId of browserWorkspaceEvents(
      messages,
      status === "streaming" || status === "submitted"
    )) {
      if (!browserCalls.current.has(callId)) {
        browserCalls.current.add(callId);
        workspace.show("browser");
      }
    }
  }, [messages, status, workspace.show]);
  useEffect(() => {
    if (!workspace.open) {
      return;
    }
    const close = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !(
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        )
      ) {
        workspace.close();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [workspace.open, workspace.close]);

  return (
    <>
      {workspace.open && !workspace.expanded && (
        <hr
          aria-label="调整工作区宽度"
          aria-orientation="vertical"
          aria-valuemax={80}
          aria-valuemin={35}
          aria-valuenow={workspace.manualWidth ? workspace.width : undefined}
          aria-valuetext={
            workspace.manualWidth ? undefined : "自适应宽度，对话约 400 像素"
          }
          className="relative z-10 -mx-1 hidden h-auto w-2 shrink-0 self-stretch cursor-col-resize border-0 bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-border/70 hover:before:bg-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:before:bg-ring md:block"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              workspace.update({
                width: Math.min(
                  80,
                  (pane.current?.parentElement
                    ? (pane.current.offsetWidth /
                        pane.current.parentElement.clientWidth) *
                      100
                    : workspace.width) + 5
                ),
              });
            }
            if (event.key === "ArrowRight") {
              workspace.update({
                width: Math.max(
                  35,
                  (pane.current?.parentElement
                    ? (pane.current.offsetWidth /
                        pane.current.parentElement.clientWidth) *
                      100
                    : workspace.width) - 5
                ),
              });
            }
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
              return;
            }
            const parent = pane.current?.parentElement?.getBoundingClientRect();
            if (parent) {
              workspace.update({
                width: Math.max(
                  35,
                  Math.min(
                    80,
                    ((parent.right - event.clientX) / parent.width) * 100
                  )
                ),
              });
            }
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
          }}
          tabIndex={0}
        />
      )}
      <aside
        aria-label="工作区"
        className={cn(
          "chat-workbench-surface flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden bg-background",
          !workspace.open && "hidden",
          workspace.expanded
            ? "fixed inset-0 z-50 h-dvh w-full md:h-dvh"
            : "fixed inset-0 z-40 h-dvh w-full md:relative md:inset-auto md:z-auto md:h-dvh md:w-[var(--workspace-width)]"
        )}
        data-testid="workspace"
        ref={pane}
        style={
          {
            "--workspace-width": workspace.manualWidth
              ? `${workspace.width}%`
              : "calc(100% - min(400px, 42%))",
          } as React.CSSProperties
        }
      >
        {(workspace.tab !== "document" || artifact.documentId === "init") && (
          <WorkspaceHeader />
        )}
        <section
          aria-label="浏览器"
          className={cn(
            "min-h-0 min-w-0 flex-1",
            workspace.tab !== "browser" && "hidden"
          )}
          id="workspace-browser"
        >
          <BrowserWorkspace
            active={workspace.open && workspace.tab === "browser"}
            key={chatId}
          />
        </section>
        <section
          aria-label="产物"
          className={cn(
            "min-h-0 min-w-0 flex-1",
            workspace.tab !== "document" && "hidden"
          )}
          id="workspace-document"
        >
          {artifact.documentId === "init" ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-8 text-center">
              <FileText className="size-7 text-muted-foreground/60" />
              <h2 className="text-base font-medium">
                {entries.length ? "本次对话的产物" : "为想法留一个工作空间"}
              </h2>
              <p className="max-w-xs text-sm leading-6 text-muted-foreground">
                {entries.length
                  ? "选择一个文件继续查看，无需返回对话查找。"
                  : "Agent 创建的文本、代码、图片和表格会收集在这里。"}
              </p>
              <ArtifactPicker entries={entries} list />
            </div>
          ) : (
            children
          )}
        </section>
        <section
          aria-label="来源"
          className={cn(
            "min-h-0 min-w-0 flex-1",
            workspace.tab !== "sources" && "hidden"
          )}
          id="workspace-sources"
        >
          <ConversationSources embedded key={chatId} />
        </section>
      </aside>
    </>
  );
}
