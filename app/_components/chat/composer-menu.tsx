"use client";
import { Globe, ImagePlus, Paperclip, Settings2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { type RefObject, useCallback, useState } from "react";
import useSWR from "swr";
import { Button } from "@/app/_components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/_components/ui/dropdown-menu";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import { useAgentInfo } from "@/app/_hooks/use-agent-info";
import { fetcher } from "@/app/_lib/utils";
import type { ModelCapabilities } from "@/server/domain/model/models";
import { AgentLibrary } from "./agent-library";
import { UploadUnavailableHint } from "./upload-unavailable-hint";

export function ComposerMenu({
  fileInputRef,
  selectedModelId,
  busy,
  home = false,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>;
  selectedModelId: string;
  busy: boolean;
  home?: boolean;
}) {
  const { searchMode, setSearchMode } = useActiveChat();
  const { data: info } = useAgentInfo();
  const { data: models } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    fetcher,
    { dedupingInterval: 3_600_000, revalidateOnFocus: false }
  );
  const capabilities: Record<string, ModelCapabilities> | undefined =
    models?.capabilities ?? models;
  const { data: session } = useSession();
  const canUpload = Boolean(
    info?.uploadsConfigured && session?.user.type === "regular"
  );
  const canSearch = Boolean(
    info?.modelConfigured &&
      capabilities?.[selectedModelId]?.tools &&
      info?.servers.some(
        (server) =>
          server.status === "configured" &&
          server.tools.some((name) => name.includes("search"))
      )
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const addImage = useCallback(
    () => fileInputRef.current?.click(),
    [fileInputRef]
  );
  const chooseSearch = useCallback(
    (value: boolean) => setSearchMode(value ? "web" : "auto"),
    [setSearchMode]
  );
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="添加附件和工具"
            className={
              home
                ? "h-8 gap-2 rounded-lg px-2 text-xs text-muted-foreground"
                : "size-8 rounded-lg text-muted-foreground hover:bg-secondary"
            }
            data-testid="composer-menu"
            size={home ? "sm" : "icon"}
            variant="ghost"
          >
            <Paperclip className="size-4" />
            {!!home && <span>添加材料</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[280px] rounded-2xl p-2"
          side="top"
        >
          <DropdownMenuItem disabled={busy || !canUpload} onSelect={addImage}>
            <ImagePlus className="size-4" />
            添加附件
          </DropdownMenuItem>
          <p className="px-2 pb-2 text-[11px] leading-5 text-muted-foreground">
            {session?.user.type === "guest" ? (
              "登录正式账户后可上传附件。"
            ) : info?.uploadsConfigured ? (
              capabilities?.[selectedModelId]?.vision ? (
                "图片 JPEG/PNG ≤5 MiB；PDF/DOCX/XLSX/CSV/TXT ≤64 MiB。"
              ) : (
                "支持 PDF/DOCX/XLSX/CSV/TXT（64 MiB）；当前模型不支持图片。"
              )
            ) : (
              <UploadUnavailableHint
                isPlatformAdmin={info?.mcpManagement?.admin}
              />
            )}
          </p>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={searchMode === "web"}
            disabled={busy || !canSearch}
            onCheckedChange={chooseSearch}
          >
            <Globe className="mr-2 size-4" />
            联网搜索
          </DropdownMenuCheckboxItem>
          <p className="px-2 pb-2 text-[11px] leading-5 text-muted-foreground">
            {canSearch
              ? "让 Agent 优先查找公开资料并提供来源。"
              : "需要可用的搜索连接和支持工具的模型。"}
          </p>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openSettings}>
            <Settings2 className="size-4" />
            设置
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AgentLibrary
        hideTrigger
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        tab="settings"
      />
    </>
  );
}
