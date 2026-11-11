"use client";

import {
  ArrowUpRight,
  BookOpen,
  CornerDownLeft,
  Files,
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
import { CustomerTestimonials } from "./customer-testimonials";
import { createLandingDraft, LANDING_DRAFT_KEY } from "./landing-draft";
import { LandingNavigation } from "./landing-navigation";
import { LandingPreview } from "./landing-preview";
import "./landing.css";

const examples = [
  {
    description: "从一张图片出发，比较相似点与差异。",
    icon: Search,
    name: "查找相似",
    text: "查找与我提供的图片或设计相似的商品，比较相似点与差异，整理成带来源的表格。",
  },
  {
    description: "梳理内容重合与差异，保留各自出处。",
    icon: Files,
    name: "对照材料",
    text: "比较我提供的文件，整理内容重合、关键差异和各自的出处。",
  },
  {
    description: "把散落的链接与资料，变成清晰的表格。",
    icon: BookOpen,
    name: "整理线索",
    text: "整理我提供的链接和材料，提炼关键信息，形成带来源的表格。",
  },
];

export function LandingPage() {
  const { data: session, status } = useSession();
  const [request, setRequest] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const workspace = `${base}/chat`;
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
    setError("");
    input.current?.focus();
    input.current?.scrollIntoView({ behavior: "instant", block: "center" });
  }, []);
  return (
    <main className="landing-page" data-testid="landing-page">
      <div aria-hidden="true" className="landing-atmosphere">
        <div />
      </div>
      <LandingNavigation
        basePath={base}
        signedIn={session?.user?.type === "regular"}
      />
      <section aria-labelledby="landing-heading" className="landing-hero">
        <p className="landing-hero__eyebrow">
          <Sparkles aria-hidden="true" size={14} />
          AI侵权线索引擎Agent
        </p>
        <h1 id="landing-heading">
          让<span>线索</span>，成为答案
        </h1>
        <Button asChild className="landing-pill landing-hero__start">
          <a href={workspace}>
            进入工作台
            <ArrowUpRight aria-hidden="true" size={16} />
          </a>
        </Button>
        <form className="landing-request" onSubmit={submit}>
          <div className="landing-request__content">
            <label className="sr-only" htmlFor="landing-request">
              描述你的任务
            </label>
            <textarea
              className="landing-request__textarea"
              id="landing-request"
              maxLength={8000}
              onChange={handleInput}
              placeholder="想查找相似商品，还是比较一份材料？告诉我你的目标…"
              ref={input}
              rows={2}
              value={request}
            />
          </div>
          <div className="landing-request__toolbar">
            <span>从一个问题开始，进入对话后可添加材料</span>
            <Button
              className="landing-request__submit"
              disabled={!request.trim() || status === "loading"}
              type="submit"
              variant="outline"
            >
              开始
              <CornerDownLeft aria-hidden="true" size={14} />
            </Button>
          </div>
        </form>
        {!!error && (
          <p className="landing-request__error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section
        aria-labelledby="landing-scenarios-heading"
        className="landing-section landing-scenarios"
        id="scenarios"
      >
        <h2 className="sr-only" id="landing-scenarios-heading">
          少一点翻找，多一点进展。
        </h2>
        <div className="landing-scenarios__grid">
          {examples.map(({ name, description, icon: Icon }, index) => (
            <button
              data-example={index}
              key={name}
              onClick={chooseExample}
              type="button"
            >
              <span className="landing-scenario-icon">
                <Icon aria-hidden="true" size={18} />
              </span>
              <h3>{name}</h3>
              <p>{description}</p>
              <span>
                试试这个目标 <ArrowUpRight aria-hidden="true" size={15} />
              </span>
            </button>
          ))}
        </div>
      </section>
      <LandingPreview />
      <CustomerTestimonials />
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
