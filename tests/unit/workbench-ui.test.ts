import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Client components are rendered in an isolated non-react-server process. No
// provider, browser, database or real agent endpoint is contacted by this suite.
function clientScript(code: string) {
  return execFileSync(process.execPath, ["--import", "tsx", "-e", code], {
    encoding: "utf8",
    env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
  });
}

function renderActivity(
  part: Record<string, unknown>,
  isReadonly = false,
  isRunning = false
) {
  return clientScript(`
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { SWRConfig } = require('swr');
    const { ToolActivity } = require('./components/chat/tool-activity.tsx');
    global.fetch = () => { throw new Error('Unexpected network access'); };
    const info = { skills: [{ name: 'fixture-skill', displayName: '调查方法', shortDescription: '技能说明只在详情中' }], servers: [] };
    const value = { provider: () => new Map(), fallback: { '/api/agent': info }, revalidateOnMount: false, revalidateOnFocus: false };
    process.stdout.write(renderToStaticMarkup(React.createElement(SWRConfig, { value }, React.createElement(ToolActivity, {
      part: ${JSON.stringify(part)}, approve: () => { throw new Error('SSR must not approve'); }, isReadonly: ${isReadonly}, isRunning: ${isRunning}
    }))));
  `);
}

const success = {
  input: {},
  output: { result: "fixture" },
  state: "output-available",
  toolCallId: "fixture-call",
  toolName: "fixture__search",
  type: "dynamic-tool",
};

for (const [name, input, output, title] of [
  ["loadSkill", { name: "fixture-skill" }, {}, "调查方法"],
  [
    "fixture__search",
    { query: "fixture query" },
    { title: "来源只在详情中", url: "https://example.test/source" },
    "搜索网页",
  ],
  ["fixture__custom_alias", {}, {}, "执行工具"],
] as const) {
  test(`successful ${name} renders only a compact closed activity line`, () => {
    const html = renderActivity({ ...success, input, output, toolName: name });
    assert.match(html, /data-state="closed"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /h-9/);
    assert.match(html, /text-\[13px\]/);
    assert.ok(html.includes(title));
    assert.doesNotMatch(
      html,
      /技能说明只在详情中|来源只在详情中|fixture__custom_alias|data-slot="badge"/
    );
  });
}

for (const state of [
  "approval-requested",
  "output-error",
  "output-denied",
] as const) {
  test(`${state} is emphasized and open with real state`, () => {
    const html = renderActivity({
      ...success,
      approval: { id: "fixture-approval" },
      errorText: state === "output-error" ? "fixture failure" : undefined,
      state,
      toolName: "fixture__custom_alias",
    });
    assert.match(html, /aria-expanded="true"/);
    assert.ok(
      html.includes(
        {
          "approval-requested": "等待确认",
          "output-denied": "已拒绝",
          "output-error": "失败",
        }[state]
      )
    );
    assert.match(html, /技术详情/);
    assert.match(html, /fixture__custom_alias/);
    if (state === "approval-requested") {
      assert.match(html, /允许执行/);
      assert.match(html, /拒绝/);
    }
  });
}

test("readonly approval shows its state but not mutation controls; approval IDs stay intact", () => {
  const html = renderActivity(
    {
      ...success,
      approval: { id: "fixture-approval" },
      state: "approval-requested",
    },
    true
  );
  assert.match(html, /等待确认/);
  assert.doesNotMatch(html, /允许执行|>拒绝</);
  const source = readFileSync("components/chat/tool-activity.tsx", "utf8");
  assert.match(source, /approve\(\{ approved: true, id: approval\.id \}\)/);
  assert.match(
    source,
    /approve\(\{ approved: false, id: approval\.id, reason: "用户拒绝执行" \}\)/
  );
});

test("generic SDK error has a Chinese visible explanation and keeps the raw error in technical details", () => {
  const html = renderActivity({
    ...success,
    errorText: "An error occurred.",
    state: "output-error",
  });
  assert.match(html, /role="alert">工具暂时未能返回结果，请稍后重试。/);
  assert.match(html, /An error occurred\./);
  const custom = renderActivity({
    ...success,
    errorText: "Provider fixture error",
    state: "output-error",
  });
  assert.match(custom, /role="alert">Provider fixture error/);
});

test("disclosure transitions collapse success, open new attention states, and preserve manual choices on same-state rerenders", () => {
  assert.ok(
    existsSync("components/chat/tool-activity-state.ts"),
    "pure disclosure transition helper exists"
  );
  clientScript(`
    const assert = require('node:assert/strict');
    const { initialToolDisclosure, reconcileToolDisclosure } = require('./components/chat/tool-activity-state.ts');
    for (const state of ['approval-requested', 'output-error', 'output-denied']) {
      let current = initialToolDisclosure(state);
      assert.equal(current.open, true);
      current = reconcileToolDisclosure(current, 'output-available');
      assert.equal(current.open, false);
      current = { ...current, open: true };
      assert.equal(reconcileToolDisclosure(current, 'output-available'), current);
      current = reconcileToolDisclosure(current, 'output-error');
      assert.equal(current.open, true);
      current = { ...current, open: false };
      assert.equal(reconcileToolDisclosure(current, 'output-error'), current);
      assert.equal(reconcileToolDisclosure(current, 'approval-requested').open, true);
    }
  `);
  const source = readFileSync("components/chat/tool-activity.tsx", "utf8");
  assert.match(source, /reconcileToolDisclosure\(/);
});

function renderAttachment(
  overrides: Record<string, unknown> = {},
  props: Record<string, unknown> = {}
) {
  return clientScript(`
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { PreviewAttachment } = require('./components/chat/preview-attachment.tsx');
    const props = ${JSON.stringify(props)};
    if (props.onRemove) props.onRemove = () => {};
    if (props.onRetry) props.onRetry = () => {};
    process.stdout.write(renderToStaticMarkup(React.createElement(PreviewAttachment, { ...props, attachment: ${JSON.stringify({ contentType: "application/pdf", extraction: { status: "ready", warnings: ["fixture warning"] }, name: `${"长文件名".repeat(30)}.pdf`, size: 2048, url: "/api/files/fixture", ...overrides })} })));
  `);
}

test("documents are bounded horizontal 64px cards with actual format, size and extraction state", () => {
  const html = renderAttachment();
  assert.match(html, /h-16/);
  assert.match(html, /min-w-0/);
  assert.match(html, /max-w-full/);
  assert.match(html, /truncate/);
  assert.match(html, /PDF/);
  assert.match(html, /2\.00 KiB/);
  assert.match(html, /fixture warning/);
  assert.doesNotMatch(html, /h-24|min-w-44/);
  const historical = renderAttachment({
    extraction: undefined,
    size: undefined,
  });
  assert.doesNotMatch(historical, /MiB|KiB|移除附件|重试/);
});

test("image keeps a 96px authenticated private URL preview", () => {
  const html = renderAttachment({
    contentType: "image/png",
    name: "fixture.png",
    url: "/api/files/private-fixture",
  });
  assert.match(html, /h-24/);
  assert.match(html, /src="\/api\/files\/private-fixture"/);
  assert.match(html, /height="96"/);
});

test("draft remove and failed retry are always visible touch and keyboard targets; uploads hide actions", () => {
  const html = renderAttachment(
    { error: "fixture error" },
    { onRemove: true, onRetry: true }
  );
  assert.match(html, /aria-label="移除附件/);
  assert.match(html, /aria-label="重试/);
  assert.match(html, /读取失败/);
  assert.match(html, /size-9/);
  assert.doesNotMatch(html, /opacity-0|group-hover:opacity/);
  const uploading = renderAttachment(
    {},
    { isUploading: true, onRemove: true, onRetry: true }
  );
  assert.match(uploading, /input-attachment-loader/);
  assert.doesNotMatch(uploading, /bg-black\/40|backdrop-blur/);
  assert.doesNotMatch(uploading, /aria-label="移除附件|aria-label="重试/);
});

test("history attachments wrap and chat-specific surface leaves global theme and file submission alone", () => {
  const message = readFileSync("components/chat/message.tsx", "utf8");
  assert.match(
    message,
    /className="[^"]*flex-wrap[^"]*"\s+data-testid=\{"message-attachments"\}/
  );
  const layout = readFileSync("app/(chat)/layout.tsx", "utf8");
  assert.match(layout, /SidebarProvider className="chat-workbench"/);
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\.chat-workbench\s*\{/);
  assert.match(css, /\.dark \.chat-workbench/);
  const composer = readFileSync("components/chat/multimodal-input.tsx", "utf8");
  assert.match(composer, /\[&>div\]:rounded-\[12px\]/);
  assert.match(composer, /<input[\s\S]*?hidden[\s\S]*?ref=\{fileInputRef\}/);
});

test("ordinary running steps remain compact and incomplete steps are visibly open", () => {
  const part = { ...success, output: undefined, state: "input-available" };
  const running = renderActivity(part, false, true);
  assert.match(running, /aria-expanded="false"/);
  assert.match(running, /执行中/);
  assert.doesNotMatch(running, /data-slot="badge"/);
  const incomplete = renderActivity(part);
  assert.match(incomplete, /aria-expanded="true"/);
  assert.match(incomplete, /未完成/);
  assert.match(incomplete, /本轮没有收到执行结果/);
});

test("legacy ToolHeader callers keep the default badge appearance", () => {
  const html = clientScript(`
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { Tool, ToolHeader } = require('./components/ai-elements/tool.tsx');
    process.stdout.write(renderToStaticMarkup(React.createElement(Tool, null, React.createElement(ToolHeader, { type: 'tool-fixture', state: 'output-available' }))));
  `);
  assert.match(html, /data-slot="badge"/);
  assert.match(html, /text-sm/);
  assert.doesNotMatch(html, /h-9/);
});

test("a rejected approval response is presented as denied rather than an ordinary response", () => {
  const html = renderActivity({
    ...success,
    approval: {
      approved: false,
      id: "fixture-approval",
      reason: "用户拒绝执行",
    },
    state: "approval-responded",
  });
  assert.match(html, /已拒绝/);
  assert.match(html, /aria-expanded="true"/);
  assert.doesNotMatch(html, /允许执行/);
});

test("message stack reduces inter-message space without changing paragraph typography", () => {
  const messages = readFileSync("components/chat/messages.tsx", "utf8");
  assert.match(messages, /flex-col gap-5 px-4 py-6 sm:px-6 md:gap-6/);
  const message = readFileSync("components/chat/message.tsx", "utf8");
  assert.match(message, /text-\[15px\] leading-\[1\.8\]/);
});
