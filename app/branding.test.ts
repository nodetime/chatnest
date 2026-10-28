import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { conversationMarkdown } from "@/server/domain/message/conversation-sources";

test("root page metadata uses the 数知探AI product title", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(
    layout,
    /export const metadata: Metadata = \{[^}]*title: "数知探AI"/s
  );
});

test("admin metadata overrides the root title with 数知探AI · 管理后台", () => {
  const layout = readFileSync("app/admin/layout.tsx", "utf8");
  assert.match(
    layout,
    /export const metadata: Metadata = \{[^}]*title: "数知探AI · 管理后台"/s
  );
});

test("home button keeps its new-chat action with visible and accessible 数知探AI branding", () => {
  const sidebar = readFileSync("app/_components/chat/app-sidebar.tsx", "utf8");
  assert.match(
    sidebar,
    /<button\s+aria-label="数知探AI 首页"[^>]*onClick=\{handleNew\}[^>]*>[\s\S]*?<span>数知探AI<\/span>[\s\S]*?<\/button>/
  );
});

test("conversation download uses a 数知探AI filename and the existing Markdown exporter", () => {
  const sources = readFileSync(
    "app/_components/chat/conversation-sources.tsx",
    "utf8"
  );
  assert.ok(sources.includes("new Blob([conversationMarkdown(messages)]"));
  assert.ok(sources.includes('type: "text/markdown;charset=utf-8"'));
  assert.match(
    sources,
    /anchor\.download = `数知探AI-对话-\$\{chatId\.slice\(0, 8\)\}\.md`;/
  );
});

test("数知探AI conversation Markdown preserves message text and returned source links", () => {
  const markdown = conversationMarkdown([
    {
      id: "user",
      parts: [
        { text: "Research 与 ChatNest 是用户原文，不要改写。", type: "text" },
      ],
      role: "user",
    },
    {
      id: "assistant",
      parts: [
        { text: "可见回答", type: "text" },
        {
          sourceId: "fixture-source",
          title: "Research 原始来源",
          type: "source-url",
          url: "https://example.test/research",
        },
      ],
      role: "assistant",
    },
  ]);
  assert.ok(markdown.startsWith("# 数知探AI 对话记录\n"));
  assert.ok(
    markdown.includes("## 用户\n\nResearch 与 ChatNest 是用户原文，不要改写。")
  );
  assert.ok(markdown.includes("## 助手\n\n可见回答"));
  assert.ok(
    markdown.includes(
      "[Research 原始来源](<https://example.test/research>) — 模型服务引用"
    )
  );
});

test("selected Figma Radar asset is original, local and reused across brand surfaces", () => {
  const asset = readFileSync("public/brand/radar.svg");
  assert.equal(
    createHash("sha256").update(asset).digest("hex"),
    "ec08796300b7912fd79f38a7d9cac3cc68f06671d4f0b71ffc36694f9282524f"
  );
  const svg = asset.toString("utf8");
  assert.match(svg, /width="160" height="160" viewBox="0 0 160 160"/);
  assert.doesNotMatch(
    svg,
    /<(?:script|foreignObject)\b|(?:href|src)="https?:|onload=/i
  );
  const admin = readFileSync("app/_components/admin/admin-shell.tsx", "utf8");
  assert.match(admin, /group-data-\[collapsible=icon\]:p-0\.5!/);
  assert.deepEqual(readFileSync("app/icon.svg"), asset);
  const ico = readFileSync("app/favicon.ico");
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.ok(readFileSync("app/apple-icon.png").length > 0);
  for (const path of [
    "app/_components/chat/app-sidebar.tsx",
    "app/(auth)/layout.tsx",
    "app/_components/admin/admin-shell.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /<BrandMark\b/);
    assert.doesNotMatch(source, />\s*C\s*<\/span>|<Command\b/);
  }
});

test("brand mark preserves aspect ratio, decorative semantics and deployment base path", () => {
  const code = `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {BrandMark}=require('./app/_components/brand-mark.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(BrandMark,{size:32})));`;
  const html = execFileSync(process.execPath, ["--import", "tsx", "-e", code], {
    encoding: "utf8",
    env: { ...process.env, NEXT_PUBLIC_BASE_PATH: "/demo", NODE_OPTIONS: "" },
  });
  assert.match(html, /src="\/demo\/brand\/radar.svg"/);
  assert.match(html, /width="32"/);
  assert.match(html, /height="32"/);
  assert.match(html, /alt=""/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /figma.com|figma.site|_next\/image/);
});

test("public brand assets load without a login or guest session and private file routes stay gated", () => {
  const code = `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
  const {NextResponse}=require('next/server');let tokenReads=0;
  const modules={'next/server':{NextResponse},'next-auth/jwt':{getToken:async()=>{tokenReads++;return null}},uuid:{v7:()=> 'trace'},'@/app/_lib/constants':{guestRegex:/^guest-/},'@/server/shared/auth-cookies':{usesSecureAuthCookies:()=>false}};
  const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('proxy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod,process:{env:{}},URL,Headers,Response,require:n=>n in modules?modules[n]:require(n.startsWith('@/')?process.cwd()+'/'+n.slice(2):n)});
  (async()=>{for(const path of ['/brand/radar.svg','/icon.svg?version=1','/apple-icon.png']){
    const url=new URL(path,'https://chat.example');const response=await mod.exports.proxy({nextUrl:url,url:url.href,headers:new Headers()});assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('set-cookie'),null);
  }assert.equal(tokenReads,0,'static branding must not read or create a session');
  for(const path of ['/brand/private.svg','/api/files/private','/api/personal/mcp']){
    const url=new URL(path,'https://chat.example');const response=await mod.exports.proxy({nextUrl:url,url:url.href,headers:new Headers()});assert.equal(response.status,307);assert.match(response.headers.get('location'),/\\/api\\/auth\\/guest/);
  }assert.equal(tokenReads,3);})().catch(e=>{console.error(e);process.exitCode=1});`;
  execFileSync(process.execPath, ["--import", "tsx", "-e", code], {
    encoding: "utf8",
    env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
  });
});

test("visible product copy is 数知探AI while repository and internal identifiers stay intact", () => {
  for (const path of [
    "app/layout.tsx",
    "app/admin/layout.tsx",
    "app/(auth)/layout.tsx",
    "app/(auth)/login/page.tsx",
    "app/(auth)/register/page.tsx",
    "app/_components/chat/app-sidebar.tsx",
    "app/_components/admin/admin-shell.tsx",
    "app/_components/chat/multimodal-input.tsx",
    "app/_components/chat/personal-skills.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /数知探AI/, path);
    assert.doesNotMatch(source, /ChatNest/, path);
  }
  assert.match(
    readFileSync("server/shared/settings-crypto.ts", "utf8"),
    /chatnest:/
  );
  assert.match(readFileSync("app/globals.css", "utf8"), /chatnest-result-grid/);
});
