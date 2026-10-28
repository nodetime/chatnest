// biome-ignore-all lint/performance/noJsxPropsBind: Cards and forms capture validated personal skill IDs.
"use client";
import { BookOpen, FileUp, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  requestSkill,
  usePersonalCapabilities,
} from "@/app/_hooks/use-personal-capabilities";
import type {
  SkillAction,
  SkillProjection,
} from "@/server/domain/capability/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Textarea } from "../ui/textarea";

type Preview = {
  name: string;
  description: string;
  displayName?: string;
  markdown: string;
};
type Editor = {
  id: string;
  source: "builtin" | "personal" | "new";
  markdown: string;
  original: string;
  enabled: boolean;
};
const emptySkill =
  "---\nname: my-skill\ndescription: 描述这个技能适合处理什么任务\n---\n\n# 方法\n\n写下 Agent 可以按需参考的方法、资料要求和输出约定。\n";
export function PersonalSkills() {
  const { regular, skills, refresh } = usePersonalCapabilities();
  const [filter, setFilter] = useState("all"),
    [editor, setEditor] = useState<Editor | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState<SkillProjection | null>(null),
    [discard, setDiscard] = useState(false);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const fileRead = useRef(0);
  const pending = useRef(false),
    alive = useRef(true),
    fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function perform<T>(action: SkillAction, apply?: (value: T) => void) {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await requestSkill<T>(action);
      if (alive.current) {
        apply?.(value);
        if (!["read", "preview"].includes(action.action)) {
          await refresh();
        }
      }
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "操作失败，请重试。");
        await skills.mutate();
      }
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  }
  function close() {
    if (pending.current) {
      return;
    }
    if (editor && editor.markdown !== editor.original) {
      setDiscard(true);
      return;
    }
    setEditor(null);
    setPreview(null);
    setError("");
  }
  async function open(skill: SkillProjection) {
    await perform<{ markdown: string }>(
      { action: "read", id: skill.id },
      (value) => {
        setEditor({
          enabled: skill.enabled,
          id: skill.id,
          markdown: value.markdown,
          original: value.markdown,
          source: skill.source,
        });
        setPreview(null);
      }
    );
  }
  const visible =
    skills.data?.skills.filter((s) => filter !== "enabled" || s.enabled) ?? [];
  const verified = !!editor && preview?.markdown === editor.markdown;
  return (
    <section className="space-y-5" data-testid="personal-skills">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">我的技能</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            让 Agent 按合适的方法完成工作。
          </p>
        </div>
        <Button
          disabled={!regular || busy || !skills.data?.configured}
          onClick={() => {
            setEditor({
              enabled: true,
              id: `skill-${crypto.randomUUID().slice(0, 8)}`,
              markdown: "",
              original: "",
              source: "new",
            });
            setPreview(null);
            setError("");
          }}
          size="sm"
        >
          <Plus className="size-3.5" />
          导入技能
        </Button>
      </div>
      {!regular && (
        <p className="text-sm text-muted-foreground">
          登录后可以管理个人技能。
          <Link className="ml-2 underline" href="/login">
            登录
          </Link>
        </p>
      )}
      {!!skills.isLoading && (
        <p className="text-sm text-muted-foreground" role="status">
          正在读取技能…
        </p>
      )}
      {!!(skills.error || error) && !editor && (
        <p className="text-sm text-destructive" role="alert">
          {error || skills.error.message}
          <Button onClick={() => skills.mutate()} size="sm" variant="ghost">
            重新读取
          </Button>
        </p>
      )}
      {regular && !!skills.data && !skills.data.configured && (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          个人技能管理暂未开放，请联系管理员。内置技能仍可使用。
        </p>
      )}
      <fieldset aria-label="技能筛选" className="flex gap-1 border-b pb-3">
        <Button
          onClick={() => setFilter("all")}
          size="sm"
          variant={filter === "all" ? "secondary" : "ghost"}
        >
          全部技能
        </Button>
        <Button
          onClick={() => setFilter("enabled")}
          size="sm"
          variant={filter === "enabled" ? "secondary" : "ghost"}
        >
          已启用
        </Button>
      </fieldset>
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((skill) => (
          <article
            className="flex min-w-0 flex-col rounded-xl border border-border/70 bg-card p-5"
            key={skill.id}
          >
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-medium">
                  {skill.displayName ?? skill.name}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {skill.source === "builtin" ? "ChatNest 提供" : "个人技能"} ·{" "}
                  {skill.enabled ? "已启用" : "未启用"}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={`${skill.displayName ?? skill.name}的操作`}
                    disabled={busy}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => open(skill)}>
                    {skill.source === "builtin" ? "查看方法" : "编辑技能"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      perform({
                        action: "toggle",
                        enabled: !skill.enabled,
                        id: skill.id,
                        revision: skills.data?.revision ?? 0,
                      })
                    }
                  >
                    {skill.enabled ? "停用技能" : "启用技能"}
                  </DropdownMenuItem>
                  {skill.source === "builtin" ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        perform({
                          action: "copy",
                          id: skill.id,
                          newId: `copy-${crypto.randomUUID().slice(0, 8)}`,
                          revision: skills.data?.revision ?? 0,
                        })
                      }
                    >
                      创建个人副本
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setDeleting(skill)}
                        variant="destructive"
                      >
                        删除技能
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="mt-4 line-clamp-3 text-[13px] leading-6 text-muted-foreground">
              {skill.shortDescription ?? skill.description}
            </p>
            <Button
              className="mt-4 self-start"
              disabled={busy}
              onClick={() => open(skill)}
              size="sm"
              variant="outline"
            >
              {skill.source === "builtin" ? "查看技能" : "编辑技能"}
            </Button>
          </article>
        ))}
      </div>
      {regular && skills.data && !visible.length && (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {filter === "enabled"
            ? "还没有启用的技能，可在全部技能中选择。"
            : "还没有个人技能，可以导入 SKILL.md 开始使用。"}
        </p>
      )}
      <Dialog
        onOpenChange={(v) => {
          if (!v) {
            close();
          }
        }}
        open={!!editor}
      >
        <DialogContent
          className="flex max-h-[85dvh] flex-col rounded-2xl sm:max-w-[640px]"
          onEscapeKeyDown={(e) => {
            if (pending.current) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (pending.current) {
              e.preventDefault();
            }
          }}
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>
              {editor?.source === "builtin"
                ? "技能详情"
                : editor?.source === "new"
                  ? "导入技能"
                  : "编辑技能"}
            </DialogTitle>
            <DialogDescription>
              {editor?.source === "builtin"
                ? "内置方法只读，可创建个人副本后修改。"
                : "导入前查看指令。技能不会执行脚本，也不会获得连接权限。"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-0.5">
            {editor?.source !== "builtin" && (
              <>
                <input
                  accept=".md,text/markdown,text/plain"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) {
                      return;
                    }
                    if (
                      file.size > 64_000 ||
                      !file.name.toLowerCase().endsWith(".md")
                    ) {
                      setError("请选择最多 64 KB 的 Markdown 技能文件。");
                      return;
                    }
                    const expected = editor;
                    fileRead.current += 1;
                    const readVersion = fileRead.current;
                    try {
                      const text = await file.text();
                      if (
                        alive.current &&
                        fileRead.current === readVersion &&
                        editorRef.current === expected
                      ) {
                        setEditor((current) =>
                          current && current === expected
                            ? { ...current, markdown: text }
                            : current
                        );
                        setPreview(null);
                      }
                    } catch {
                      setError("文件读取失败，请重新选择。");
                    }
                  }}
                  ref={fileInput}
                  type="file"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => fileInput.current?.click()}
                    size="sm"
                    variant="outline"
                  >
                    <FileUp className="size-3.5" />
                    选择 SKILL.md
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setEditor((current) =>
                        current ? { ...current, markdown: emptySkill } : current
                      );
                      setPreview(null);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    使用空白模板
                  </Button>
                </div>
              </>
            )}
            <label
              className="block space-y-2 text-xs"
              htmlFor="personal-skill-markdown"
            >
              <span>技能指令</span>
              <Textarea
                aria-label="技能指令"
                className="min-h-48 resize-y font-mono text-xs leading-6"
                disabled={busy}
                id="personal-skill-markdown"
                maxLength={64_000}
                onChange={(event) => {
                  setEditor((current) =>
                    current
                      ? { ...current, markdown: event.target.value }
                      : current
                  );
                  setPreview(null);
                }}
                readOnly={editor?.source === "builtin"}
                spellCheck={false}
                value={editor?.markdown ?? ""}
              />
            </label>
            {!!verified && !!preview && (
              <div className="rounded-xl bg-secondary/60 p-4" role="status">
                <h3 className="text-sm font-medium">
                  {preview.displayName ?? preview.name}
                </h3>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                  {preview.description}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  单文件技能 · 保存到个人空间
                </p>
              </div>
            )}
            {!!error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button disabled={busy} onClick={close} variant="ghost">
              取消
            </Button>
            {editor?.source === "builtin" ? (
              <Button
                disabled={busy}
                onClick={() =>
                  editor &&
                  perform(
                    {
                      action: "copy",
                      id: editor.id,
                      newId: `copy-${crypto.randomUUID().slice(0, 8)}`,
                      revision: skills.data?.revision ?? 0,
                    },
                    () => setEditor(null)
                  )
                }
              >
                创建个人副本
              </Button>
            ) : (
              <>
                <Button
                  disabled={busy || !editor?.markdown.trim()}
                  onClick={() =>
                    editor &&
                    perform<Preview>(
                      { action: "preview", markdown: editor.markdown },
                      setPreview
                    )
                  }
                  variant="outline"
                >
                  {busy ? "正在处理…" : "预览技能"}
                </Button>
                <Button
                  disabled={busy || !verified || !skills.data?.configured}
                  onClick={() =>
                    editor &&
                    perform(
                      {
                        action: "save",
                        enabled: editor.enabled,
                        id:
                          editor.source === "new"
                            ? editor.id
                            : editor.id.slice("personal:".length),
                        markdown: editor.markdown,
                        revision: skills.data?.revision ?? 0,
                      },
                      () => {
                        setEditor(null);
                        setPreview(null);
                      }
                    )
                  }
                >
                  保存技能
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        onOpenChange={(v) => {
          if (!v && !pending.current) {
            setDeleting(null);
          }
        }}
        open={!!deleting}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除技能？</AlertDialogTitle>
            <AlertDialogDescription>
              删除“{deleting?.displayName ?? deleting?.name}
              ”。已生成的成果保留，未执行的旧调用将失效。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) {
                  perform(
                    {
                      action: "delete",
                      id: deleting.id.slice("personal:".length),
                      revision: skills.data?.revision ?? 0,
                    },
                    () => setDeleting(null)
                  );
                }
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={setDiscard} open={discard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>
              已保存的技能不会改变。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscard(false);
                setEditor(null);
                setPreview(null);
                setError("");
              }}
            >
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
