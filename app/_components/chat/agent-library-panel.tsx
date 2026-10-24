import { BookOpen, Check, Monitor, Moon, Plug, Sun } from "lucide-react";
import type { MouseEventHandler } from "react";
import type { AgentInfo } from "@/app/_hooks/use-agent-info";
import { AgentGeneralStatus } from "./agent-general-status";

export type AgentLibraryTab = "skills" | "tools" | "settings";

export function AgentLibraryPanel({
  tab,
  info,
  theme,
  onThemeChange,
}: {
  tab: AgentLibraryTab;
  info?: AgentInfo;
  theme?: string;
  onThemeChange?: MouseEventHandler<HTMLButtonElement>;
}) {
  if (tab === "settings") {
    return (
      <section>
        <h3 className="mb-3 text-sm font-medium">外观</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Sun, id: "light", label: "浅色" },
            { icon: Moon, id: "dark", label: "深色" },
            { icon: Monitor, id: "system", label: "跟随系统" },
          ].map(({ id, label, icon: ThemeIcon }) => (
            <button
              aria-pressed={theme === id}
              className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm ${theme === id ? "border-foreground bg-secondary" : "text-muted-foreground hover:bg-secondary/50"}`}
              data-theme={id}
              key={id}
              onClick={onThemeChange}
              type="button"
            >
              <ThemeIcon aria-hidden="true" className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </section>
    );
  }
  if (!info) {
    return null;
  }
  if (tab === "tools") {
    return (
      <div className="space-y-6">
        <section aria-label="可用工具" className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            查看助手可使用的工具，连接由平台管理员管理。
          </p>
          {info.servers.map((server) => (
            <div className="rounded-xl border p-4" key={server.id}>
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Plug aria-hidden="true" className="size-4 shrink-0" />
                <span className="break-all">{server.name}</span>
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {server.status === "configured" ? "已设置" : "暂未就绪"}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {server.tools.length} 个开放工具 · 连接状态尚未实时检测
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {server.tools.map((name) => (
                  <span
                    className="max-w-full break-all rounded-md bg-secondary px-2 py-1 font-mono text-[10px] text-muted-foreground"
                    key={name}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!info.servers.length && (
            <p className="text-sm text-muted-foreground">暂无可用工具。</p>
          )}
        </section>
        <AgentGeneralStatus
          connectionCount={info.servers.length}
          modelConfigured={info.modelConfigured}
          uploadsConfigured={info.uploadsConfigured}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        按任务需要使用相关技能。
      </p>
      {info.skills.map((skill) => (
        <div className="rounded-xl border p-4" key={skill.name}>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <BookOpen aria-hidden="true" className="size-4 shrink-0" />
            <span className="break-all">{skill.displayName ?? skill.name}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground">
              <Check aria-hidden="true" className="size-3" />
              可用
            </span>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {skill.shortDescription ?? skill.description}
          </p>
          {!!skill.displayName && (
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">详细信息</summary>
              <p className="mt-2 break-all font-mono">{skill.name}</p>
            </details>
          )}
        </div>
      ))}
      {!info.skills.length && <p className="text-sm">暂无可用技能。</p>}
    </div>
  );
}
