"use client";

import {
  ArrowUpRight,
  BookOpen,
  CornerDownLeft,
  Files,
  Menu,
  Search,
  Sparkles,
} from "lucide-react";
import { useSession } from "next-auth/react";
import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { BrandMark } from "@/app/_components/brand-mark";
import { Button } from "@/app/_components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/_components/ui/sheet";
import { authPageHref } from "@/app/_lib/auth-navigation";
import { createLandingDraft, LANDING_DRAFT_KEY } from "./landing-draft";
import { LandingPreview } from "./landing-preview";
import "./landing.css";

const links = [
  { href: "#product", label: "产品" },
  { href: "#scenarios", label: "使用场景" },
  { href: "#faq", label: "常见问题" },
];
const examples = [
  {
    icon: Search,
    name: "查找与比较",
    text: "查找旅行包的公开资料，比较价格和商家，并整理成一份带来源的表格。",
  },
  {
    icon: Files,
    name: "整理文件",
    text: "整理我提供的文件，提炼关键信息，并标明出处与待核对事项。",
  },
  {
    icon: BookOpen,
    name: "研究一个主题",
    text: "研究我关心的主题，对照不同来源，形成有引用、说明资料局限的报告。",
  },
];

export function LandingPage() {
  const { data: session, status } = useSession();
  const [request, setRequest] = useState(examples[0].text);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const workspace = `${base}/chat`;
  const illustrated = request === examples[0].text && !editing;
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const draft = createLandingDraft(request, session?.user?.id ?? null);
      if (!draft || status === "loading") {
        return;
      }
      try {
        sessionStorage.setItem(LANDING_DRAFT_KEY, JSON.stringify(draft));
        // Cross the auth boundary normally; do not put potentially private text in a URL.
        window.location.assign(workspace);
      } catch {
        setError(
          "浏览器暂时未能保存草稿，输入仍保留。请复制内容后进入工作台。"
        );
      }
    },
    [request, session?.user?.id, status, workspace]
  );
  const handleBlur = useCallback(() => setEditing(false), []);
  const handleFocus = useCallback(() => setEditing(true), []);
  const handleInput = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setRequest(event.target.value);
    setError("");
  }, []);
  const chooseExample = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const example = examples[Number(event.currentTarget.dataset.example)];
    if (!example) {
      return;
    }
    setRequest(example.text);
    setEditing(true);
    setError("");
    input.current?.focus();
    input.current?.scrollIntoView({ behavior: "instant", block: "center" });
  }, []);
  return (
    <main className="landing-page" data-testid="landing-page">
      <div aria-hidden="true" className="landing-atmosphere">
        <div />
      </div>
      <header className="landing-nav">
        <a
          aria-label="数知探AI 首页"
          className="landing-brand"
          href={`${base}/`}
        >
          <BrandMark />
          <span>数知探AI</span>
        </a>
        <nav aria-label="主导航" className="landing-nav__links">
          {links.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="landing-nav__actions">
          {session?.user?.type !== "regular" && (
            <a
              className="landing-login"
              href={`${base}${authPageHref("/login", "/chat")}`}
            >
              登录
            </a>
          )}
          <Button asChild className="landing-pill landing-pill--small">
            <a href={workspace}>
              {session?.user?.type === "regular" ? "进入工作台" : "开始使用"}
            </a>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                aria-label="打开导航菜单"
                className="landing-menu-trigger"
                size="icon"
                variant="ghost"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent className="landing-menu" side="right">
              <SheetHeader>
                <SheetTitle>数知探AI</SheetTitle>
                <SheetDescription>探索资料，形成答案。</SheetDescription>
              </SheetHeader>
              <nav aria-label="移动导航">
                {links.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <a href={link.href}>
                      {link.label}
                      <ArrowUpRight aria-hidden="true" size={16} />
                    </a>
                  </SheetClose>
                ))}
              </nav>
              <SheetClose asChild>
                <a className="landing-menu__workspace" href={workspace}>
                  进入工作台
                </a>
              </SheetClose>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <section aria-labelledby="landing-heading" className="landing-hero">
        <p className="landing-hero__eyebrow">你的 AI 资料助手</p>
        <h1 id="landing-heading">
          让<span>线索</span>，成为答案
        </h1>
        <Button asChild className="landing-pill landing-hero__start">
          <a href={workspace}>
            <Sparkles aria-hidden="true" size={17} />
            开始使用
          </a>
        </Button>
        <form className="landing-request" onSubmit={submit}>
          <div className="landing-request__content">
            <label className="sr-only" htmlFor="landing-request">
              描述你的任务
            </label>
            <textarea
              className={
                illustrated
                  ? "landing-request__textarea landing-request__textarea--illustrated"
                  : "landing-request__textarea"
              }
              id="landing-request"
              maxLength={8000}
              onBlur={handleBlur}
              onChange={handleInput}
              onFocus={handleFocus}
              ref={input}
              rows={2}
              value={request}
            />
            {!!illustrated && (
              <div aria-hidden="true" className="landing-request__example">
                查找<mark>旅行包</mark>的公开资料，比较<mark>价格和商家</mark>
                ，并整理成一份带来源的表格。
              </div>
            )}
          </div>
          <Button
            className="landing-request__submit"
            disabled={!request.trim() || status === "loading"}
            type="submit"
            variant="outline"
          >
            开始
            <CornerDownLeft aria-hidden="true" size={14} />
          </Button>
        </form>
        {!!error && (
          <p className="landing-request__error" role="alert">
            {error}
          </p>
        )}
      </section>
      <LandingPreview />
      <section
        aria-labelledby="landing-scenarios-heading"
        className="landing-section landing-scenarios"
        id="scenarios"
      >
        <p className="landing-kicker">从一个目标开始</p>
        <h2 id="landing-scenarios-heading">少一点翻找，多一点进展。</h2>
        <div className="landing-scenarios__grid">
          {examples.map(({ name, text, icon: Icon }, index) => (
            <button
              data-example={index}
              key={name}
              onClick={chooseExample}
              type="button"
            >
              <Icon aria-hidden="true" size={21} />
              <h3>{name}</h3>
              <p>{text}</p>
              <span>
                试试这个目标 <ArrowUpRight aria-hidden="true" size={15} />
              </span>
            </button>
          ))}
        </div>
      </section>
      <section
        aria-labelledby="landing-faq-heading"
        className="landing-section landing-faq"
        id="faq"
      >
        <h2 id="landing-faq-heading">你可能想知道</h2>
        <div>
          <details>
            <summary>我可以从什么开始？</summary>
            <p>
              描述一个目标、整理一组文件，或提出需要对照的问题。进入工作台后，你可以补充材料，再让
              Agent 按任务需要选择工具。
            </p>
          </details>
          <details>
            <summary>支持哪些文件？</summary>
            <p>
              目前支持图片及 PDF、Word、Excel
              材料。文本型文档可读取并参与对话；图片需所选模型支持，扫描件 OCR
              需要另行配置。
            </p>
          </details>
          <details>
            <summary>如何开始一项任务？</summary>
            <p>
              首页输入会带入对话，你可以补充材料、选择工具后发送。仅浏览首页和预览示例不会发起查询。
            </p>
          </details>
          <details>
            <summary>我的连接和密钥会被分享吗？</summary>
            <p>
              连接与密钥保持个人私有，不会随对话分享传递。外部工具调用仍遵守任务范围与审批设置。
            </p>
          </details>
        </div>
      </section>
      <footer className="landing-footer">
        <a className="landing-brand" href={`${base}/`}>
          <BrandMark size={24} />
          <span>数知探AI</span>
        </a>
        <span>探索资料，形成答案。</span>
        <a
          href="https://github.com/nodetime/porta"
          id="developers"
          rel="noopener noreferrer"
          target="_blank"
        >
          开发者文档
        </a>
        <a href={workspace}>
          开始使用 <ArrowUpRight aria-hidden="true" size={14} />
        </a>
      </footer>
    </main>
  );
}
