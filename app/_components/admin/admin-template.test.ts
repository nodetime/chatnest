// biome-ignore-all lint/suspicious/useAwait: Offline fixtures implement async service boundaries.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

function render(code: string) {
  return execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `const React=require('react');const server=require('react-dom/server');const {TooltipProvider}=require('./app/_components/ui/tooltip.tsx');const renderToStaticMarkup=(tree)=>server.renderToStaticMarkup(React.createElement(TooltipProvider,null,tree));${code}`,
    ],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } }
  );
}

test("template shell provides inset, collapsible navigation, current identity and only real routes", () => {
  const html = render(
    "const {AdminShell}=require('./app/_components/admin/admin-shell.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(AdminShell,{identity:{name:'Fixture Admin',email:'fixture@example.test'}},React.createElement('h1',null,'概览'))));"
  );
  assert.match(html, /data-slot="sidebar-wrapper"/);
  assert.match(html, /data-slot="sidebar-inset"/);
  assert.match(html, /data-collapsible=/);
  assert.match(html, /Fixture Admin/);
  assert.match(html, /fixture@example.test/);
  assert.match(html, /href="\/admin"/);
  assert.match(html, /href="\/admin\/connections"/);
  assert.match(html, /href="\/admin\/storage"/);
  assert.match(html, /返回工作台/);
  assert.match(html, /ChatNest <span[^>]*>\/ Admin<\/span>/);
  assert.doesNotMatch(html, /Research/);
  assert.doesNotMatch(
    html,
    /Billing|Notifications|Quick Create|\/admin\/(users|billing|logs)/
  );
  const shell = readFileSync("app/_components/admin/admin-shell.tsx", "utf8");
  assert.match(shell, /tooltip="ChatNest 平台管理"/);
  assert.match(shell, /SheetContent/);
  assert.match(shell, /side="left"/);
  assert.match(shell, /SheetTitle/);
  const layout = readFileSync("app/admin/layout.tsx", "utf8");
  assert.ok(
    layout.indexOf("requirePlatformAdmin(session?.user, notFound)") <
      layout.lastIndexOf("<AdminShell")
  );
  assert.match(layout, /identity=/);
});

test("navigation marks exactly the current real route including demo base path", () => {
  for (const path of [
    "/admin",
    "/admin/connections",
    "/admin/storage",
    "/demo/admin/storage",
  ]) {
    const html = render(
      `const {SidebarProvider}=require('./app/_components/ui/sidebar.tsx');const {AdminNavigationItems}=require('./app/_components/admin/admin-navigation.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(SidebarProvider,null,React.createElement(AdminNavigationItems,{pathname:'${path}'}))));`
    );
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    const current = path.replace("/demo", "");
    assert.match(
      html,
      new RegExp(
        `aria-current="page"[^>]*href="${current}"|href="${current}"[^>]*aria-current="page"`
      )
    );
  }
});

test("MCP table exposes real columns, read-only file source, accessible actions and sheet editor", () => {
  const html = render(
    "const {SWRConfig}=require('swr');const {McpConnections}=require('./app/_components/chat/mcp-connections.tsx');const data={configured:true,revision:1,servers:[{id:'fixture',name:'资料工具',enabled:true,allowedTools:['search'],origin:'https://fixture.example',headerNames:['Authorization'],source:'managed'},{id:'file',name:'预设工具',enabled:true,allowedTools:[],origin:'',headerNames:[],source:'file'}]};process.stdout.write(renderToStaticMarkup(React.createElement(SWRConfig,{value:{fallback:{'/api/agent/mcp':data}}},React.createElement(McpConnections))));"
  );
  assert.match(html, /<table/);
  for (const text of [
    "连接名称",
    "连接类型 / 来源",
    "状态",
    "开放工具",
    "操作",
    "文件管理 · 只读",
    "资料工具的操作",
  ]) {
    assert.ok(html.includes(text), text);
  }
  assert.doesNotMatch(html, /Authorization/);
  assert.match(
    readFileSync("app/_components/chat/mcp-connections.tsx", "utf8"),
    /SheetContent/
  );
});

test("storage separates live configuration cards, controls, limits and collapsed deployment details", () => {
  const html = render(
    "const {SWRConfig}=require('swr');const {AdminStorage}=require('./app/_components/admin/admin-storage.tsx');const data={enabled:true,revision:1,configured:true,driver:'local',formats:['image/png','image/jpeg'],maxFileBytes:5242880,maxImages:15,maxContextBytes:20971520};process.stdout.write(renderToStaticMarkup(React.createElement(SWRConfig,{value:{fallback:{'/api/admin/storage':data}}},React.createElement(AdminStorage))));"
  );
  assert.ok((html.match(/data-slot="card"/g) ?? []).length >= 2);
  for (const label of [
    "关闭新上传",
    "测试连接",
    "清理过期草稿",
    "5 MiB",
    "15",
    "20 MiB",
    "本地存储",
  ]) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /S3|云存储/);
});

test("overview independently authorizes, isolates failures and never projects credentials", async () => {
  assert.ok(
    existsSync("server/application/admin/overview.ts"),
    "guarded overview boundary exists"
  );
  const { createOverviewHandler } = await import(
    // biome-ignore lint/style/noRestrictedImports: 测试探针:驱动 admin 概览处理器,非 UI 依赖
    "@/server/application/admin/overview"
  );
  const id = "11111111-1111-4111-8111-111111111111";
  let user: { id: string; type: string } | null = null,
    calls = 0;
  const handler = createOverviewHandler({
    env: { PLATFORM_ADMIN_USER_IDS: id },
    model: async () => ({
      configured: true,
      name: "fixture-model",
      provider: "openai",
    }),
    session: async () => user,
    storage: async () => ({ configured: true, enabled: true }),
    tools: async () => {
      calls += 1;
      throw new Error("SECRET_PATH");
    },
  });
  const request = new Request("https://fixture.test/api/admin/overview");
  assert.equal((await handler(request)).status, 401);
  user = { id, type: "guest" };
  assert.equal((await handler(request)).status, 403);
  assert.equal(calls, 0);
  user = { id, type: "regular" };
  const response = await handler(request),
    body = await response.json();
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  assert.equal(body.tools.ok, false);
  assert.equal(body.storage.ok, true);
  assert.equal(body.model.value.name, "fixture-model");
  assert.doesNotMatch(JSON.stringify(body), /SECRET_PATH|apiKey|baseURL/);
});

test("overview readiness uses existing services and attributed upstream assets, not demos", () => {
  assert.ok(existsSync("app/_components/admin/admin-overview.tsx"));
  const route = readFileSync("app/api/admin/overview/route.ts", "utf8");
  for (const source of [
    // P7:配置读取经组合根门面(agent.readConfig),仍是真实服务读取
    "agent.readConfig",
    "createSettingsService",
    "storageStatus",
    "getModelConnection",
  ]) {
    assert.ok(route.includes(source));
  }
  assert.doesNotMatch(readFileSync("app/admin/page.tsx", "utf8"), /redirect\(/);
  const notice = readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
  assert.match(notice, /487a741538e787113f24a6c291f606136e2a970a/);
  assert.match(notice, /Copyright \(c\) 2024 Mohammed Arham Khan/);
  assert.match(notice, /Permission is hereby granted/);
});

test("readiness counts missing file credentials and disabled managed connections without network probes", async () => {
  const overview = await import(
    // biome-ignore lint/style/noRestrictedImports: 测试探针:校验就绪度统计,非 UI 依赖
    "@/server/application/admin/overview"
  );
  assert.equal(
    typeof overview.summarizeTools,
    "function",
    "a tested summary projection exists"
  );
  const file = [
    {
      allowedTools: ["search"],
      autoApproveTools: [],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Exercise literal deployment environment references, not JavaScript interpolation.
      headers: { Authorization: "Bearer ${MISSING_TOKEN}" },
      id: "file",
      name: "File",
      url: "https://fixture.example/mcp",
    },
  ];
  const settings = {
    configured: true,
    revision: 1,
    servers: [
      {
        allowedTools: ["search"],
        enabled: true,
        headerNames: ["Authorization"],
        id: "file",
        name: "File",
        origin: "",
        source: "file" as const,
      },
      {
        allowedTools: ["read", "write"],
        enabled: true,
        headerNames: [],
        id: "managed",
        name: "Managed",
        origin: "https://fixture.example",
        source: "managed" as const,
      },
      {
        allowedTools: ["other"],
        enabled: false,
        headerNames: [],
        id: "disabled",
        name: "Disabled",
        origin: "https://fixture.example",
        source: "managed" as const,
      },
    ],
  };
  assert.deepEqual(overview.summarizeTools(file, settings, {}), {
    configured: 2,
    enabled: 2,
    managementConfigured: true,
    openTools: 3,
    total: 3,
  });
  assert.equal(
    overview.summarizeTools(file, settings, { MISSING_TOKEN: "fixture-only" })
      .configured,
    3
  );
});

test("overview stays focused on three real readiness cards without instructional filler", () => {
  const html = render(
    "const {AdminOverview}=require('./app/_components/admin/admin-overview.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(AdminOverview)));"
  );
  assert.equal((html.match(/data-slot="card"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /配置与使用分离|固定执行流程/);
});

test("current breadcrumb location is text, not an unfocusable simulated link", () => {
  const html = render(
    "const {BreadcrumbPage}=require('./app/_components/ui/breadcrumb.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(BreadcrumbPage,null,'文件存储')));"
  );
  assert.match(html, /aria-current="page"/);
  assert.doesNotMatch(html, /role="link"|aria-disabled/);
});

test("model administration has masked credentials, real protocol controls and editable model catalog", () => {
  const html = render(
    "const {SWRConfig}=require('swr');const {AdminModels}=require('./app/_components/admin/admin-models.tsx');const data={manageable:true,configured:true,hasKey:true,source:'managed',revision:1,config:{baseURL:'https://models.example/v1',apiMode:'chat',defaultModel:'model-b',models:[{id:'model-a',tools:true,vision:false},{id:'model-b',tools:true,vision:true}]}};process.stdout.write(renderToStaticMarkup(React.createElement(SWRConfig,{value:{fallback:{'/api/admin/models':data}}},React.createElement(AdminModels))));"
  );
  for (const label of [
    "API 基础地址",
    "API Key",
    "接口协议",
    "开放模型",
    "获取模型目录",
    "测试连接",
    "保存配置",
    "已保存 · 不回显",
  ]) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, /type="password"/);
  assert.match(html, /https:\/\/models.example\/v1/);
  assert.match(html, /aria-label="默认模型 2"[^>]*checked/);
  assert.doesNotMatch(html, /sk-|Bearer /);
});
