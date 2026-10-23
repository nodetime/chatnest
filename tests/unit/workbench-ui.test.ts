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
    const info = { skills: [{ name: 'fixture-skill', displayName: '调查方法', shortDescription: '技能说明只在详情中' }], servers: [{toolAliases:[{alias:'fixture__search',name:'search',serverName:'Fixture'}]}] };
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
  [
    "loadSkill",
    { name: "fixture-skill" },
    {
      description: "用途",
      displayName: "通用技能",
      instructions: "Exact instructions",
      name: "fixture-skill",
    },
    "通用技能",
  ],
  [
    "fixture__search",
    { query: "fixture query" },
    { title: "来源只在详情中", url: "https://example.test/source" },
    "搜索资料",
  ],
  ["fixture__custom_alias", {}, {}, "fixture__custom_alias"],
] as const) {
  test(`successful ${name} renders only a compact closed activity line`, () => {
    const html = renderActivity({
      ...success,
      input,
      output,
      toolName: name,
      ...(name === "loadSkill" ? { type: "tool-loadSkill" } : {}),
    });
    assert.match(html, /data-state="closed"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /h-9/);
    assert.match(html, /text-\[13px\]/);
    assert.ok(html.includes(title));
    assert.doesNotMatch(
      html,
      /技能说明只在详情中|来源只在详情中|data-slot="badge"/
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
    assert.match(html, /查看调用详情/);
    if (state === "approval-requested") {
      assert.match(html, /fixture__custom_alias/);
    }
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

test("generic SDK error has a Chinese visible explanation without inlining its raw evidence", () => {
  const html = renderActivity({
    ...success,
    errorText: "An error occurred.",
    state: "output-error",
  });
  assert.match(html, /role="alert">工具暂时未能返回结果，请稍后重试。/);
  assert.doesNotMatch(html, /An error occurred\./);
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
  assert.match(composer, /\[&>div\]:rounded-\[10px\]/);
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
  assert.match(
    messages,
    /<ConversationContent[^>]*gap-5 px-4 py-6 sm:px-6 md:gap-6/
  );
  const message = readFileSync("components/chat/message.tsx", "utf8");
  assert.match(message, /text-\[15px\] leading-\[1\.75\]/);
});

const resultSource = {
  completedAt: "2026-10-21T12:00:00.000Z",
  serverId: "fixture-server-id",
  serverName: "Fixture server",
  timeBasis: "tool-completed",
  toolCallId: "fixture-call-id-only-in-details",
  toolName: "fixture__raw_alias_only_in_details",
};

function renderResultTable(notes = "", readOnly = false) {
  return clientScript(`
    require.extensions['.css'] = () => {};
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { ResultTableView } = require('./components/chat/result-table.tsx');
    global.fetch = () => { throw new Error('Unexpected network access'); };
    const table = { chatId: 'fixture-chat', columns: [{ label: 'Title', path: '/title' }], notes: ${JSON.stringify(notes)}, rows: [{ title: 'fixture row', secret: 'complete raw field' }], source: ${JSON.stringify(resultSource)}, view: { filter: '', sort: [], visibleColumns: ['/title'] } };
    process.stdout.write(renderToStaticMarkup(React.createElement(ResultTableView, { documentId: 'fixture-document', expectedVersion: '2026-10-21T12:00:00.000Z', readOnly: ${readOnly}, table })));
  `);
}

test("result workspace shows only compact source identity and a details entry, without a second title", () => {
  const html = renderResultTable();
  assert.doesNotMatch(html, /Fixture server|未核验/);
  assert.match(html, /来源详情/);
  assert.match(html, /1 \/ 1 行/);
  assert.doesNotMatch(html, /源数据只读/);
  assert.doesNotMatch(
    html,
    /fixture__raw_alias_only_in_details|fixture-call-id-only-in-details|fixture-server-id|2026-10-21T12:00:00.000Z|结果表格/
  );
  assert.match(html, /aria-label="筛选结果"/);
  assert.match(html, /CSV · 当前视图/);
  assert.match(html, /JSON · 原始快照/);
});

test("source Sheet details retain every original source field and explain both time bases", () => {
  assert.ok(existsSync("components/chat/result-table-source.tsx"));
  for (const [timeBasis, explanation] of [
    ["tool-completed", "工具完成时间"],
    ["message-recorded", "消息记录时间"],
  ]) {
    const source = { ...resultSource, timeBasis };
    const html = clientScript(`
      const React = require('react');
      const { renderToStaticMarkup } = require('react-dom/server');
      const { ResultTableSourceDetails } = require('./components/chat/result-table-source.tsx');
      process.stdout.write(renderToStaticMarkup(React.createElement(ResultTableSourceDetails, { source: ${JSON.stringify(source)} })));
    `);
    for (const [field, value] of Object.entries(source)) {
      assert.ok(html.includes(field), `original field name ${field} retained`);
      assert.ok(html.includes(value), `original ${field} value retained`);
    }
    assert.ok(html.includes(explanation));
    assert.match(html, /break-all/);
  }
  const source = readFileSync(
    "components/chat/result-table-source.tsx",
    "utf8"
  );
  assert.match(source, /<SheetTrigger asChild>/);
  assert.match(source, /<SheetContent/);
  assert.match(source, /<SheetTitle>来源详情<\/SheetTitle>/);
});

test("notes live in a Sheet and clean tables have no permanent save or helper footer", () => {
  const html = renderResultTable();
  assert.match(html, /个人备注/);
  assert.doesNotMatch(html, /<textarea|保存视图与备注|点击行查看原始字段/);
  const source = readFileSync("components/chat/result-table.tsx", "utf8");
  assert.match(source, /data-testid="result-notes-sheet"/);
  assert.match(source, /response\.status === 409/);
  assert.match(source, /await onSaved\?\.\(body\[0\]\.content\)/);
});

test("saved notes start closed with discoverable indicator and readonly history has no save controls", () => {
  const html = renderResultTable("fixture saved notes");
  assert.doesNotMatch(html, /<textarea/);
  assert.match(html, /已有备注/);
  const historical = renderResultTable("fixture historical notes", true);
  assert.match(historical, /已有备注/);
  assert.doesNotMatch(historical, /<textarea/);
  assert.doesNotMatch(historical, /保存视图与备注/);
  const sheet = readFileSync("artifacts/sheet/client.tsx", "utf8");
  assert.match(sheet, /readOnly=\{isReadonly \|\| !isCurrentVersion\}/);
});

test("workspace uses a keyboard mode menu and preserves resize and overlay semantics", () => {
  const workspace = readFileSync("components/chat/workspace.tsx", "utf8");
  const header = readFileSync("components/chat/workspace-header.tsx", "utf8");
  for (const title of ["浏览器", "产物", "来源"]) {
    assert.ok(header.includes(`title: "${title}"`));
  }
  assert.match(header, /aria-label="切换工作区视图"/);
  assert.match(header, /DropdownMenuRadioGroup/);
  assert.match(header, /aria-label="关闭工作区"/);
  assert.match(header, /"收起工作区" : "展开工作区"/);
  assert.match(workspace, /aria-label="调整工作区宽度"/);
  assert.match(workspace, /fixed inset-0[^"\n]*h-dvh w-full/);
  assert.doesNotMatch(workspace, /role="tablist"/);
});

test("embedded artifact keeps the real single title and a shrinkable result-content flex chain", () => {
  const artifact = readFileSync("components/chat/artifact.tsx", "utf8");
  assert.match(artifact, /!embedded && <ArtifactCloseButton \/>/);
  assert.equal(artifact.match(/\{artifact\.title\}/g)?.length, 2);
  assert.match(artifact, /<WorkspaceHeader/);
  assert.match(
    artifact,
    /isProtectedResultTable\(artifact\.content\)[\s\S]*?"flex overflow-hidden"\s*:\s*"overflow-y-auto"/
  );
  assert.match(artifact, /relative min-h-0 min-w-0 flex-1/);
  assert.doesNotMatch(artifact, /className="h-5 px-1.5"/);
  const result = readFileSync("components/chat/result-table.tsx", "utf8");
  assert.match(result, /flex h-full w-full min-h-0 min-w-0 flex-col/);
  assert.match(result, /min-h-0 min-w-0 flex-1/);
  assert.match(result, /flex flex-wrap items-center gap-2/);
  // Existing exports and row-index raw detail are deliberately unchanged.
  assert.match(result, /resultCsv\(table, view\)/);
  assert.match(result, /JSON\.stringify\(table, null, 2\)/);
  assert.match(result, /setDetail\(row\.sourceIndex\)/);
  assert.match(result, /JSON\.stringify\(table\.rows\[detail\], null, 2\)/);
});

test("result grid keeps theme classes and renders the scoped 13px / 46px density contract", () => {
  const html = renderResultTable();
  assert.match(html, /chatnest-result-grid/);
  assert.match(html, /rdg-light/);
  const source = readFileSync("components/chat/result-table.tsx", "utf8");
  assert.match(source, /resolvedTheme === "dark" \? "rdg-dark" : "rdg-light"/);
  assert.match(source, /rowHeight=\{inline \? 38 : 46\}/);
  assert.match(source, /headerRowHeight=\{inline \? 38 : 42\}/);
  assert.doesNotMatch(source, /fontSize: 12/);
  assert.match(source, /rowKeyGetter=\{\(row\) => row\.sourceIndex\}/);
});

test("result grid tokens are scoped with enough specificity and semantic cells retain focus and header borders", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const scoped = css.match(
    /\.chat-workbench \.chatnest-result-grid\s*\{([^}]+)\}/
  )?.[1];
  assert.ok(scoped, "chat-local grid token rule exists");
  for (const [variable, token] of [
    ["color", "foreground"],
    ["background-color", "card"],
    ["header-background-color", "secondary"],
    ["row-hover-background-color", "accent"],
    ["row-selected-background-color", "workbench-selection"],
    ["row-selected-hover-background-color", "workbench-selection"],
    ["selection-color", "ring"],
    ["border-color", "border"],
  ]) {
    assert.match(
      scoped,
      new RegExp(`--rdg-${variable}:[^;]*var\\(--${token}\\)`)
    );
  }
  assert.match(scoped, /--rdg-font-size: 13px/);
  assert.match(
    css,
    /\.chat-workbench \.chatnest-result-grid \[role="gridcell"\]\s*\{[^}]*border-inline-end-color: transparent/
  );
  assert.match(
    css,
    /\.chat-workbench \.chatnest-result-grid \[role="columnheader"\]\s*\{[^}]*border-block-end:[^;]*var\(--rdg-border-color\)/
  );
  assert.doesNotMatch(css, /(?:^|\n)\.rdg(?:[\s.{:#]|$)/);
  const rules = css.slice(css.indexOf(".chat-workbench .chatnest-result-grid"));
  assert.doesNotMatch(
    rules,
    /outline:\s*(?:none|0)|#[\da-f]{3,8}|--rdg-[\w-]+:\s*(?:white|black)/i
  );
});

test("artifact lifecycle is Chinese and relative dates use the installed Chinese locale", () => {
  const source = readFileSync("components/chat/artifact.tsx", "utf8");
  for (const label of ["正在保存…", "更新于", "正在生成…"]) {
    assert.ok(source.includes(label), `${label} lifecycle label exists`);
  }
  assert.match(source, /import \{ zhCN \} from "date-fns\/locale"/);
  assert.match(
    source,
    /formatDistance\([\s\S]*?addSuffix: true,[\s\S]*?locale: zhCN/
  );
  assert.doesNotMatch(
    source,
    /第\{currentVersionIndex \+ 1\}\/\{documents.length\}版/
  );
  assert.match(source, /documents && documents.length > 1 && \(/);
  assert.doesNotMatch(source, /Saving\.\.\.|Updated \$|Generating\.\.\./);
});

test("version footer exposes Chinese version labels and keeps restore protections", () => {
  const source = readFileSync("components/chat/version-footer.tsx", "utf8");
  for (const label of [
    "上一版本",
    "下一版本",
    "查看更改",
    "恢复此版本",
    "最新版本",
  ]) {
    assert.ok(source.includes(label), `${label} footer label exists`);
  }
  assert.match(
    source,
    /第\{currentVersionIndex \+ 1\}\/\{documents.length\}版/
  );
  assert.match(source, /aria-label="上一版本"/);
  assert.match(source, /aria-label="下一版本"/);
  assert.match(source, /title="查看更改"/);
  assert.match(
    source,
    /disabled=\{isMutating \|\| isReadonly \|\| protectedTable\}/
  );
  assert.match(
    source,
    /if \(!documents \|\| isReadonly \|\| isProtectedResultTable\(artifact.content\)\)/
  );
  assert.doesNotMatch(source, /Show changes|\bRestore\b|\bLatest\b|\} of \{/);
});

test("all artifact action and toolbar descriptions and copy toasts are Chinese without translating agent messages", () => {
  const expected: Record<string, string[]> = {
    code: [
      "运行代码",
      "运行",
      "上一版本",
      "下一版本",
      "复制代码",
      "添加注释",
      "添加日志",
    ],
    image: ["上一版本", "下一版本", "复制图片"],
    sheet: [
      "上一版本",
      "下一版本",
      "复制 CSV",
      "整理数据格式",
      "分析与可视化数据",
    ],
    text: [
      "查看更改",
      "上一版本",
      "下一版本",
      "复制文本",
      "润色文本",
      "请求修改建议",
    ],
  };
  for (const [kind, labels] of Object.entries(expected)) {
    const source = readFileSync(`artifacts/${kind}/client.tsx`, "utf8");
    for (const label of labels) {
      assert.ok(source.includes(`"${label}"`), `${kind}: ${label}`);
    }
    for (const match of source.matchAll(
      /(?:description|label):\s*"([^"]+)"|toast\.(?:success|error)\("([^"]+)"\)/g
    )) {
      assert.match(
        match[1] ?? match[2],
        /[\u4e00-\u9fff]/,
        `${kind} owns Chinese visible copy`
      );
    }
    assert.doesNotMatch(source, /Copied (?:csv|image|to)/);
  }
  for (const [kind, message] of [
    ["code", "Add comments to the code snippet for understanding"],
    ["code", "Add logs to the code snippet for debugging"],
    ["sheet", "Can you please format and clean the data?"],
    [
      "sheet",
      "Can you please analyze and visualize the data by creating a new code artifact in python?",
    ],
    [
      "text",
      "Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.",
    ],
    ["text", "Please add suggestions you have that could improve the writing."],
  ]) {
    assert.ok(
      readFileSync(`artifacts/${kind}/client.tsx`, "utf8").includes(
        `text: "${message}"`
      )
    );
  }
});

test("source and raw-result Sheets localize close controls without changing the shared Sheet", () => {
  for (const [file, label] of [
    ["components/chat/result-table-source.tsx", "关闭来源详情"],
    ["components/chat/result-table.tsx", "关闭原始结果"],
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /showCloseButton=\{false\}/);
    assert.match(source, /<SheetClose asChild>/);
    assert.ok(source.includes(`aria-label="${label}"`));
  }
  assert.match(
    readFileSync("components/ui/sheet.tsx", "utf8"),
    />Close<\/span>/
  );
});

test("inline result preview sizes filtered rows up to four and bounds generic previews to 128px", () => {
  assert.ok(
    existsSync("components/chat/document-preview-layout.ts"),
    "pure preview layout helper exists"
  );
  clientScript(`
    const assert = require('node:assert/strict');
    const { documentPreviewLayout } = require('./components/chat/document-preview-layout.ts');
    const fixture = (count) => ({ columns: [{ label: 'Title', path: '/title' }], rows: Array.from({ length: count }, (_, index) => ({ title: index < 2 ? 'keep' : 'other' })), view: { filter: '', sort: [], visibleColumns: ['/title'] } });
    for (const [count, height, showFade] of [[0, 115, false], [2, 115, false], [3, 153, false], [4, 191, false], [20, 191, true]]) {
      assert.deepEqual(documentPreviewLayout(fixture(count)), { height, showFade });
    }
    const filtered = fixture(20);
    filtered.view.filter = 'keep';
    const before = JSON.stringify(filtered);
    assert.deepEqual(documentPreviewLayout(filtered), { height: 115, showFade: false });
    assert.equal(JSON.stringify(filtered), before);
    assert.deepEqual(documentPreviewLayout(null), { height: 128, showFade: true });
  `);
});

test("only parsed inline tables use bounded preview geometry without a 220px grid minimum", () => {
  const source = readFileSync("components/chat/document-preview.tsx", "utf8");
  assert.match(source, /documentPreviewLayout\(table\)/);
  assert.match(source, /style=\{\{ height: previewLayout\.height \}\}/);
  assert.match(source, /previewLayout\.showFade \?/);
  const content = source.slice(source.indexOf("const DocumentContent ="));
  assert.doesNotMatch(content, /h-\[257px\]/);
  assert.match(content, /const table = parseResultTable\(document.content\)/);
  assert.match(content, /<ResultTableView\s+inline/);
  const table = readFileSync("components/chat/result-table.tsx", "utf8");
  assert.doesNotMatch(table, /minHeight: 220/);
});

test("artifact diff selection uses a stable action ID independent of translated descriptions", () => {
  const config = readFileSync("components/chat/create-artifact.tsx", "utf8");
  assert.match(config, /id\?: string/);
  assert.match(config, /export function isArtifactActionActive/);
  clientScript(`
    const assert = require('node:assert/strict');
    const { isArtifactActionActive } = require('./components/chat/create-artifact.tsx');
    for (const description of ['View changes', '查看更改']) {
      const action = { id: 'view-changes', description };
      assert.equal(isArtifactActionActive(action, 'diff'), true);
      assert.equal(isArtifactActionActive(action, 'edit'), false);
      assert.equal(isArtifactActionActive({ description }, 'diff'), false);
    }
    assert.equal(isArtifactActionActive({ id: 'copy', description: '查看更改' }, 'diff'), false);
  `);
  const consumer = readFileSync("components/chat/artifact-actions.tsx", "utf8");
  assert.match(consumer, /isActive=\{isArtifactActionActive\(action, mode\)\}/);
  assert.doesNotMatch(consumer, /action.description ===/);
  assert.match(consumer, /toast.error\("操作执行失败，请重试。"\)/);
  const text = readFileSync("artifacts/text/client.tsx", "utf8");
  assert.match(
    text,
    /description: "查看更改",\s+icon: <ClockRewind[^\n]+\s+id: "view-changes"/
  );
});

test("generic artifact header and preview expose all four type labels without changing renderers", () => {
  const html = clientScript(`
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { ArtifactTypeLabel } = require('./components/chat/artifact-type-label.tsx');
    process.stdout.write(['text','code','image','sheet'].map(kind => renderToStaticMarkup(React.createElement(ArtifactTypeLabel, {kind}))).join(''));
  `);
  for (const label of ["文本", "代码", "图片", "表格"]) {
    assert.ok(html.includes(label));
  }
  for (const file of ["artifact.tsx", "document-preview.tsx"]) {
    assert.match(
      readFileSync(`components/chat/${file}`, "utf8"),
      /<ArtifactTypeLabel kind=/
    );
  }
  assert.match(
    renderActivity({ ...success, type: "tool-createResultTable" }),
    /生成表格产物/
  );
});

test("quiet process has one summary and plain aligned rows; approvals stay actionable", () => {
  const html = clientScript(`
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { SWRConfig } = require('swr');
    const { ActivityGroup } = require('./components/chat/activity-group.tsx');
    global.fetch = () => { throw new Error('Unexpected network'); };
    const part = ${JSON.stringify(success)};
    const parts = [part, {...part, toolCallId:'pending', state:'approval-requested', approval:{id:'approval-original'}}];
    process.stdout.write(renderToStaticMarkup(React.createElement(SWRConfig, {value:{provider:()=>new Map(),revalidateOnMount:false}}, React.createElement(ActivityGroup, {parts, approve:()=>{}, isReadonly:false}))));
  `);
  assert.match(html, /执行过程/);
  assert.match(html, /2 个步骤/);
  assert.match(html, /等待确认/);
  assert.match(html, /允许执行/);
  assert.match(html, /data-testid="activity-timeline"/);
  assert.doesNotMatch(html, /border-l |absolute -left|已完成/);
  assert.doesNotMatch(html, /group-data-\[state=open\]:rotate-180/);
});

test("artifact header actions have accessible names and version navigation has a single home", () => {
  const actions = readFileSync("components/chat/artifact-actions.tsx", "utf8");
  assert.match(actions, /aria-label=\{action.description\}/);
  assert.match(actions, /layout === "header"/);
  assert.match(actions, /previous-version/);
  assert.match(actions, /next-version/);
  const artifact = readFileSync("components/chat/artifact.tsx", "utf8");
  assert.match(artifact, /layout="header"/);
  assert.doesNotMatch(artifact, /artifactActions=\{/);
});

test("an idle approved call without output is unfinished, not still executing", () => {
  const html = renderActivity({
    ...success,
    approval: { approved: true, id: "approved-id" },
    output: undefined,
    state: "approval-responded",
  });
  assert.match(html, /未完成/);
  assert.match(html, /本轮没有收到执行结果/);
  assert.match(html, /aria-expanded="true"/);
  assert.doesNotMatch(html, /允许执行/);
});

test("a new approval on the same call reopens its child details even when state is unchanged", () => {
  clientScript(`
    const assert = require('node:assert/strict');
    const { initialToolDisclosure, reconcileToolDisclosure } = require('./components/chat/tool-activity-state.ts');
    let current = { ...initialToolDisclosure('approval-requested', 'call:approval-a'), open: false };
    assert.equal(reconcileToolDisclosure(current, 'approval-requested', 'call:approval-a'), current);
    current = reconcileToolDisclosure(current, 'approval-requested', 'call:approval-b');
    assert.equal(current.open, true);
    current = { ...current, open: false };
    assert.equal(reconcileToolDisclosure(current, 'approval-requested', 'call:approval-b'), current);
    assert.equal(reconcileToolDisclosure(current, 'output-available', 'call:approval-b').open, false);
  `);
  const source = readFileSync("components/chat/tool-activity.tsx", "utf8");
  assert.match(source, /toolDisclosureIdentity\(part\)/);
});

test("mixed reasoning and tools render in their original SDK order rather than merging across activity boundaries", () => {
  clientScript(`
    const assert = require('node:assert/strict');
    const { readFileSync } = require('node:fs');
    const { runInNewContext } = require('node:vm');
    const ts = require('typescript');
    const { groupActivityParts } = require('./components/chat/activity-groups.ts');
    const jsx = (type, props) => ({type, props});
    const modules = {
      'react': {useCallback: fn => fn},
      'react/jsx-runtime': {jsx, jsxs:jsx, Fragment:'fragment'},
      '@/lib/utils': {cn:()=>'', sanitizeText: text=>text},
      '../ai-elements/message': {MessageContent:'text', MessageResponse:'response'},
      '../ai-elements/shimmer': {Shimmer:'shimmer'},
      '../ai-elements/tool': {},
      './activity-group': {ActivityGroup:'activity'},
      './activity-groups': {groupActivityParts},
      './data-stream-provider': {useDataStream:()=>({})},
      './document': {}, './document-preview': {}, './icons': {},
      './message-actions': {MessageActions:'actions'},
      './message-reasoning': {MessageReasoning:'reasoning'},
      './preview-attachment': {}, './tool-activity': {}, './weather': {},
    };
    const output = {exports:{}};
    const code = ts.transpileModule(readFileSync('components/chat/message.tsx','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    runInNewContext(code, {exports:output.exports,module:output,require:name=>{assert.ok(name in modules, 'unexpected '+name);return modules[name];}});
    const tool = id => ({type:'dynamic-tool',toolName:'fixture__search',toolCallId:id,state:'output-available',input:{},output:{}});
    const message = {id:'mixed',role:'assistant',parts:[{type:'reasoning',text:'reason-a'},tool('tool-a'),{type:'reasoning',text:'reason-b'},tool('tool-b'),{type:'text',text:'final-answer'}]};
    const tree = output.exports.PreviewMessage({message,isLoading:false,isReadonly:true,addToolApprovalResponse:()=>{}});
    const order = [];
    const walk = node => {
      if (Array.isArray(node)) { for (const item of node) walk(item); return; }
      if (!node || typeof node !== 'object') return;
      if (node.type === 'reasoning') {order.push(node.props.reasoning);return;}
      if (node.type === 'activity') {order.push(node.props.parts.map(part=>part.toolCallId).join(','));return;}
      if (node.type === 'response') {order.push(node.props.children);return;}
      walk(node.props?.children);
    };
    walk(tree);
    assert.deepEqual(order,['reason-a','tool-a','reason-b','tool-b','final-answer']);
  `);
});

test("native createResultTable validation errors are failed open activities with the returned error", () => {
  const part = {
    input: {},
    output: { error: "Source fixture is unavailable" },
    state: "output-available",
    toolCallId: "native-table-error",
    type: "tool-createResultTable",
  };
  const before = JSON.stringify(part);
  const html = renderActivity(part);
  assert.match(html, /生成表格产物/);
  assert.match(html, /失败/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /role="alert">Source fixture is unavailable/);
  assert.doesNotMatch(html, /未完成|本轮没有收到执行结果/);
  assert.equal(JSON.stringify(part), before);
});

test("dynamic MCP output error fields are evidence data, not the native table failure contract", () => {
  for (const toolName of ["fixture__search", "createResultTable"]) {
    const html = renderActivity({
      ...success,
      output: { error: "MCP evidence field" },
      toolName,
    });
    assert.doesNotMatch(html, /已完成/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /role="alert"|失败/);
  }
});

test("chat-local palette defines gentle light and dark semantic surfaces without global overrides", () => {
  const css = readFileSync("app/globals.css", "utf8");
  for (const selector of ["\\.chat-workbench", "\\.dark \\.chat-workbench"]) {
    const rule = css.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`))?.[1];
    assert.ok(rule);
    for (const token of [
      "background",
      "foreground",
      "card",
      "secondary",
      "muted-foreground",
      "border",
      "ring",
      "sidebar",
    ]) {
      assert.match(rule, new RegExp(`--${token}: oklch\\(`));
    }
  }
  assert.match(
    css,
    /\.chat-workbench :where\(button, a, summary, \[tabindex\]\):focus-visible/
  );
  const shell = readFileSync("components/chat/shell.tsx", "utf8");
  assert.doesNotMatch(shell, /md:p-2|md:rounded-|md:border|flex-row gap-2/);
  assert.match(shell, /chat-workbench-shell flex h-dvh w-full min-w-0/);
});

test("generic empty conversation has a readable invitation and one softly elevated composer", () => {
  const html = clientScript(`
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { Greeting } = require('./components/chat/greeting.tsx');
    process.stdout.write(renderToStaticMarkup(React.createElement(Greeting)));
  `);
  assert.match(html, /<h1/);
  assert.match(html, /描述你的目标，或添加文件作为起点/);
  assert.match(html, /text-sm leading-6/);
  const composer = readFileSync("components/chat/multimodal-input.tsx", "utf8");
  assert.match(composer, /shadow-\[var\(--shadow-composer\)\]/);
  assert.doesNotMatch(composer, /focus-within:border-foreground\/25/);
  const sidebar = readFileSync("components/chat/app-sidebar.tsx", "utf8");
  assert.match(sidebar, /h-\[52px\] shrink-0/);
  for (const entry of [
    "新对话",
    "创建任务",
    "ChatSearch",
    "AgentLibrary",
    "SidebarUserNav",
  ]) {
    assert.ok(sidebar.includes(entry));
  }
});

test("approval presents a human action summary while raw arguments are reachable in call details", () => {
  const html = renderActivity({
    ...success,
    approval: { id: "fixture-approval" },
    input: { query: "precise fixture query" },
    state: "approval-requested",
  });
  assert.match(html, /data-testid="tool-approval-summary"/);
  assert.match(html, /搜索资料/);
  assert.match(html, /precise fixture query/);
  assert.match(html, /查看调用详情/);
  assert.doesNotMatch(html, /技术详情|调用参数/);
  assert.match(html, /fixture__search/);
  assert.match(html, /请确认这次操作/);
  const unknown = renderActivity({
    ...success,
    approval: { id: "fixture-approval" },
    input: {},
    state: "approval-requested",
    toolName: "fixture__custom_alias",
  });
  assert.match(unknown, /fixture__custom_alias/);
  assert.doesNotMatch(unknown, /只读操作|安全操作/);
});

test("artifact and table actions keep readable 36px targets without leaking table controls to the viewer", () => {
  const html = renderResultTable();
  assert.match(html, /aria-label="选择显示列"/);
  assert.match(html, /h-9 pl-8 text-\[13px\]/);
  const actions = readFileSync("components/chat/artifact-actions.tsx", "utf8");
  assert.match(actions, /size-9 rounded-md/);
  const viewer = readFileSync("components/chat/artifact.tsx", "utf8");
  assert.doesNotMatch(
    viewer,
    /ListFilter|Columns3|筛选所有字段|保存视图与备注/
  );
});

test("tool action context skips structured arguments while call details stay reachable", () => {
  const html = renderActivity({
    ...success,
    approval: { id: "fixture-approval" },
    input: {
      query: { nested: "raw structured query" },
      url: "https://example.test/action",
    },
    state: "approval-requested",
  });
  assert.match(html, /https:\/\/example.test\/action/);
  assert.match(html, /查看调用详情/);
  assert.match(html, /raw structured query/);
  assert.doesNotMatch(html, /技术详情/);
});

test("open artifacts use a compact chat file card instead of mounting a duplicate editor", () => {
  const source = readFileSync("components/chat/document-preview.tsx", "utf8");
  assert.match(
    source,
    /artifact\.isVisible &&\s*artifact\.documentId === document\.id/
  );
  assert.match(source, /!isOpen && <DocumentContent document=\{document\} \/>/);
  assert.match(source, /isOpen=\{isOpen\}/);
  assert.match(source, /正在查看/);
  assert.doesNotMatch(source, /h-\[257px\]/);
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(
    css,
    /\.chat-workbench\[data-slot="sidebar-wrapper"\]\s*\{[^}]*--sidebar-width: 13rem !important/
  );
});

test("artifact assistant actions live in a named header menu, never a floating toolbar", () => {
  const source = readFileSync("components/chat/toolbar.tsx", "utf8");
  assert.match(source, /DropdownMenuTrigger asChild/);
  assert.match(source, /aria-label="更多产物操作"/);
  assert.match(
    source,
    /onSelect=\{\(\) => tool.onClick\(\{ sendMessage \}\)\}/
  );
  assert.match(source, /artifactDefinition\.toolbar/);
  assert.match(source, /createFixErrorTool\(consoleError, documentId\)/);
  assert.doesNotMatch(source, /fixed right-|bottom-6|motion\.div/);
  const viewer = readFileSync("components/chat/artifact.tsx", "utf8");
  const toolbar = viewer.indexOf("<Toolbar");
  assert.ok(
    toolbar > 0 && toolbar < viewer.indexOf('data-slot="artifact-content"')
  );
  assert.match(
    viewer,
    /isCurrentVersion &&[\s\S]*?!isReadonly &&[\s\S]*?!isProtectedResultTable\(artifact.content\)/
  );
});

test("compact artifact card keeps its keyboard outline inside the clipped hit area", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(
    css,
    /\.chat-workbench \[data-testid="document-preview"\]:focus-visible\s*\{[^}]*outline-offset: -3px/
  );
});

test("artifact card lifecycle reopens the same document after close or tab switch and stays chat-local", () => {
  clientScript(`
    const assert = require('node:assert/strict');
    const { readFileSync } = require('node:fs');
    const { runInNewContext } = require('node:vm');
    const ts = require('typescript');
    const { openArtifactPreview } = require('./lib/artifacts/stream-state.ts');
    let chatId = 'chat-a';
    let artifact = { documentId:'doc-a', isVisible:true, status:'idle', content:'original content', title:'Fixture A', kind:'code' };
    const workspaces = new Map();
    const jsx = (type, props) => ({type, props});
    const react = {memo:fn=>fn,useCallback:fn=>fn,useEffect:()=>{},useMemo:fn=>fn(),useRef:()=>({current:null})};
    const swr = (key, _fetcher, options) => {
      if (key.startsWith('workspace:')) return {
        data:workspaces.get(key) ?? options.fallbackData,
        mutate:fn=>workspaces.set(key,fn(workspaces.get(key) ?? options.fallbackData))
      };
      const id = new URL(key,'https://fixture.test').searchParams.get('id');
      return {data:[{id,title:id,kind:'code',content:'fixture code'}],isLoading:false};
    };
    const modules = {
      'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'fast-deep-equal':{__esModule:true,default:()=>true},
      'swr':{__esModule:true,default:swr},
      './use-active-chat':{useActiveChat:()=>({chatId})},
      '@/hooks/use-active-chat':{useActiveChat:()=>({chatId})},
      '@/hooks/use-artifact':{useArtifact:()=>({artifact,setArtifact:fn=>{artifact=fn(artifact);}})},
      '@/lib/artifacts/stream-state':{openArtifactPreview},
      '@/lib/artifacts/result-table':{},'@/lib/utils':{cn:()=>'',fetcher:()=>{throw new Error('Unexpected fetch');}},
      './artifact-type-label':{},'./document-preview-layout':{},'./icons':{},'./image-editor':{},'./result-table':{},'./sheet-editor':{},'./text-editor':{}
    };
    const load = path => {
      const output={exports:{}};
      const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
      runInNewContext(code,{exports:output.exports,module:output,process:{env:{}},URL,require:name=>{assert.ok(name in modules,'unexpected '+name);return modules[name];}});
      return output.exports;
    };
    const {useWorkspace}=load('hooks/use-workspace.ts');
    assert.equal(useWorkspace().width,58,'fresh chat gives artifacts the broader canvas');
    useWorkspace().update({width:57});useWorkspace().close();useWorkspace().show('document');
    assert.equal(useWorkspace().width,57,'user width survives close/reopen');
    modules['@/hooks/use-workspace']={useWorkspace};
    const {DocumentPreview}=load('components/chat/document-preview.tsx');
    let result={id:'doc-a',title:'Fixture A',kind:'code'};
    const render = () => {
      const tree=DocumentPreview({result,isReadonly:false});
      const children=tree.props.children;
      return {header:children.find(node=>node && typeof node.props?.isOpen==='boolean'),hitbox:children.find(node=>node?.props?.hitboxRef)};
    };
    const activate = view => view.hitbox.type(view.hitbox.props).props.onClick({currentTarget:{getBoundingClientRect:()=>({height:72,width:400,x:0,y:0})}});
    useWorkspace().show('document');
    assert.equal(render().header.props.isOpen,true);
    useWorkspace().close();
    const closed=render();
    activate(closed);
    assert.equal(useWorkspace().open,true,'same visible artifact must reopen a closed workspace');
    assert.equal(useWorkspace().tab,'document');
    assert.equal(closed.header.props.isOpen,false,'closed workspace never claims the card is being viewed');
    assert.equal(render().header.props.isOpen,true);
    assert.equal(artifact.content,'original content','same-artifact reopen preserves current content');
    for (const tab of ['sources','browser']) {
      useWorkspace().show(tab);
      const otherTab=render();
      assert.equal(otherTab.header.props.isOpen,false,'other workspace tabs must not claim the document is visible');
      activate(otherTab);
      assert.equal(useWorkspace().tab,'document','same artifact activation returns to document pane');
      assert.equal(render().header.props.isOpen,true);
    }
    for (const [open,tab,visible,id,expected] of [[true,'document',true,'doc-a',true],[false,'document',true,'doc-a',false],[true,'sources',true,'doc-a',false],[true,'browser',true,'doc-a',false],[true,'document',false,'doc-a',false],[true,'document',true,'other-document',false]]) {
      workspaces.set('workspace:chat-a',{open,tab,width:60,expanded:false});
      artifact={...artifact,isVisible:visible,documentId:id};
      assert.equal(render().header.props.isOpen,expected,'visible pane identity must be exact');
    }
    const previousChat=JSON.stringify(workspaces.get('workspace:chat-a'));
    chatId='chat-b'; result={id:'doc-b',title:'Fixture B',kind:'code'};
    assert.equal(useWorkspace().open,false,'new chat has an independent closed workspace');
    assert.equal(render().header.props.isOpen,false);
    activate(render());
    assert.equal(useWorkspace().open,true);
    assert.equal(useWorkspace().tab,'document');
    assert.equal(artifact.documentId,'doc-b');
    assert.equal(artifact.content,'','different artifact does not leak previous content');
    assert.equal(JSON.stringify(workspaces.get('workspace:chat-a')),previousChat,'opening the new chat must not mutate the old workspace');
  `);
});

test("workspace resize grip stretches across the pane with an 8px hit area and a single-pixel divider", () => {
  const source = readFileSync("components/chat/workspace.tsx", "utf8");
  const grip = source.match(/<hr[\s\S]*?className="([^"]+)"/)?.[1];
  assert.ok(grip, "native separator exists");
  // Tailwind preflight explicitly gives hr height:0; flex stretch alone does
  // not override it. The auto-height utility restores the full-height target.
  assert.match(grip, /\bh-auto\b/);
  assert.match(grip, /\bself-stretch\b/);
  assert.match(grip, /\bw-2\b/);
  assert.match(grip, /\bbg-transparent\b/);
  assert.match(grip, /before:w-px/);
  assert.match(source, /aria-label="调整工作区宽度"/);
  assert.match(source, /aria-orientation="vertical"/);
  assert.match(source, /aria-valuemax=\{70\}/);
  assert.match(source, /aria-valuemin=\{35\}/);
  assert.match(source, /tabIndex=\{0\}/);
});

test("Lessie composition uses neutral panes, purposeful mint and narrower chat beside broad artifacts", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const scoped = css.slice(css.indexOf(".chat-workbench {"));
  assert.match(scoped, /--background: oklch\(1 0 0\)/);
  assert.match(scoped, /--workbench-selection:/);
  assert.doesNotMatch(scoped, /0\.00[1-8] (?:65|85)\)/);
  assert.match(readFileSync("hooks/use-workspace.ts", "utf8"), /width: 58/);
  assert.match(
    readFileSync("components/chat/messages.tsx", "utf8"),
    /max-w-\[720px\]/
  );
  assert.match(
    readFileSync("components/chat/multimodal-input.tsx", "utf8"),
    /min-h-\[44px\]/
  );
});
