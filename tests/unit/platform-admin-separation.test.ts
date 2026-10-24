import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const adminId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

function render(code: string) {
  return execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');${code}`,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    }
  );
}

test("platform access preserves legacy exact regular UUIDs and only explicitly overrides", async () => {
  assert.ok(
    existsSync("lib/admin/access.ts"),
    "shared server-side platform access exists"
  );
  const { isPlatformAdmin, requirePlatformAdmin } = await import(
    "@/lib/admin/access"
  );
  const user = { id: adminId, type: "regular" };
  const deny = () => {
    throw new Error("NOT_FOUND");
  };
  assert.equal(isPlatformAdmin(user, {}), false);
  assert.equal(
    isPlatformAdmin(user, { MCP_ADMIN_USER_IDS: ` ${adminId} ` }),
    true
  );
  for (const invalid of [
    undefined,
    { ...user, type: "guest" },
    { ...user, id: adminId.slice(0, -1) },
    { ...user, id: "ADMIN@example.org" },
  ]) {
    assert.equal(
      isPlatformAdmin(invalid, { MCP_ADMIN_USER_IDS: adminId }),
      false
    );
    assert.throws(
      () =>
        requirePlatformAdmin(invalid, deny, { MCP_ADMIN_USER_IDS: adminId }),
      /NOT_FOUND/
    );
  }
  assert.equal(
    requirePlatformAdmin(user, deny, { MCP_ADMIN_USER_IDS: adminId }),
    adminId
  );
  assert.equal(
    isPlatformAdmin(user, {
      MCP_ADMIN_USER_IDS: adminId,
      PLATFORM_ADMIN_USER_IDS: "",
    }),
    false
  );
  assert.equal(
    isPlatformAdmin(user, {
      MCP_ADMIN_USER_IDS: adminId,
      PLATFORM_ADMIN_USER_IDS: otherId,
    }),
    false
  );
  assert.equal(
    isPlatformAdmin(user, { PLATFORM_ADMIN_USER_IDS: adminId }),
    true
  );
});

test("standalone admin shell has only real navigation and return-to-workspace link", () => {
  assert.ok(
    existsSync("components/admin/admin-shell.tsx"),
    "standalone shell exists"
  );
  const html = render(
    "const {AdminShell}=require('./components/admin/admin-shell.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(AdminShell,{identity:{name:'Fixture Admin',email:'admin@example.test'}},React.createElement('h1',null,'工具连接'))));"
  );
  assert.match(html, /平台管理/);
  assert.match(html, /href="\/admin\/connections"/);
  assert.match(html, /href="\/admin\/storage"/);
  assert.match(html, /href="\/"[^>]*>[\s\S]*?返回工作台<\/a>/);
  assert.doesNotMatch(html, /\/admin\/(?:models|billing|logs)/);
  const layout = readFileSync("app/admin/layout.tsx", "utf8");
  assert.match(layout, /Suspense/);
  assert.match(layout, /await auth\(/);
  assert.match(layout, /requirePlatformAdmin\(session\?\.user, notFound\)/);
  assert.ok(
    layout.indexOf("requirePlatformAdmin(session?.user, notFound)") <
      layout.lastIndexOf("<AdminShell")
  );
  assert.doesNotMatch(layout, /ChatShell|AppSidebar|export const runtime/);
  const connections = readFileSync(
    "components/admin/admin-connections.tsx",
    "utf8"
  );
  assert.match(connections, /<McpConnections/);
});

test("personal panel renders read-only tools even when the capability response identifies an admin", () => {
  const library = readFileSync("components/chat/agent-library.tsx", "utf8");
  assert.doesNotMatch(
    library,
    /McpConnections|McpEditor/,
    "personal settings must never mount management components"
  );
  const html = render(
    "const {AgentLibraryPanel}=require('./components/chat/agent-library-panel.tsx');const info={mcpManagement:{admin:true,configured:true},skills:[{name:'fixture',description:'查找资料'}],servers:[{id:'fixture',name:'资料工具',status:'configured',tools:['search'],missingEnvironment:['SECRET_ENV']}],modelConfigured:true,uploadsConfigured:false,limits:{maxSteps:1,timeoutMs:1}};process.stdout.write(renderToStaticMarkup(React.createElement(AgentLibraryPanel,{tab:'tools',info,theme:'system'})));"
  );
  assert.match(html, /资料工具/);
  assert.match(html, /search/);
  assert.match(html, /服务状态/);
  assert.doesNotMatch(html, /新增连接|编辑|删除|SECRET_ENV|MCP_|\.env|部署/);
  const general = render(
    "const {AgentLibraryPanel}=require('./components/chat/agent-library-panel.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(AgentLibraryPanel,{tab:'settings',theme:'system'})));"
  );
  assert.match(general, /外观/);
  assert.doesNotMatch(general, /服务状态|对话服务|存储/);
});

test("platform menu link is controlled by server-computed props, not a client role", () => {
  assert.ok(
    existsSync("components/admin/platform-admin-link.tsx"),
    "permission-aware menu link exists"
  );
  const html = (admin: boolean) =>
    render(
      `const {PlatformAdminLink}=require('./components/admin/platform-admin-link.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(PlatformAdminLink,{isPlatformAdmin:${admin}})));`
    );
  assert.equal(html(false), "");
  assert.match(html(true), /href="\/admin"/);
  assert.match(html(true), /平台管理/);
  assert.match(
    readFileSync("app/(chat)/layout.tsx", "utf8"),
    /isPlatformAdmin=\{isPlatformAdmin\(session\?\.user\)\}/
  );
  assert.match(
    readFileSync("components/chat/app-sidebar.tsx", "utf8"),
    /<SidebarUserNav isPlatformAdmin=\{isPlatformAdmin\}/
  );
  assert.match(
    readFileSync("components/chat/sidebar-user-nav.tsx", "utf8"),
    /<PlatformAdminLink isPlatformAdmin=\{isPlatformAdmin\}/
  );
});

test("missing upload storage points users to administrators instead of a nonexistent personal setting", () => {
  for (const file of [
    "components/chat/composer-menu.tsx",
    "components/chat/multimodal-input.tsx",
  ]) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /可在设置中配置|设置中查看存储连接说明/
    );
  }
  assert.ok(existsSync("components/chat/upload-unavailable-hint.tsx"));
  const html = (admin: boolean) =>
    render(
      `const {UploadUnavailableHint}=require('./components/chat/upload-unavailable-hint.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(UploadUnavailableHint,{isPlatformAdmin:${admin}})));`
    );
  assert.match(html(false), /联系管理员/);
  assert.doesNotMatch(html(false), /href=/);
  assert.match(html(true), /href="\/admin\/storage"/);
});

test("admin connection management reads its guarded API independently of model and skills summaries", () => {
  const connections = readFileSync(
    "components/admin/admin-connections.tsx",
    "utf8"
  );
  assert.doesNotMatch(connections, /useAgentInfo|info=\{/);
  const manager = readFileSync("components/chat/mcp-connections.tsx", "utf8");
  assert.match(manager, /\/api\/agent\/mcp/);
  assert.doesNotMatch(manager, /info\.mcpManagement|info\.servers/);
  assert.doesNotMatch(
    readFileSync("app/(chat)/api/files/upload/route.ts", "utf8"),
    /设置中查看存储连接说明/
  );
});

test("admin management HTML exposes existing CRUD while both personal capability views remain read-only", () => {
  const management = render(
    "const {SWRConfig}=require('swr');const {McpConnections}=require('./components/chat/mcp-connections.tsx');const data={configured:true,revision:1,servers:[{id:'fixture',name:'资料工具',enabled:true,allowedTools:['search'],origin:'https://fixture.example',headerNames:['Authorization'],source:'managed'}]};process.stdout.write(renderToStaticMarkup(React.createElement(SWRConfig,{value:{fallback:{'/api/agent/mcp':data}}},React.createElement(McpConnections))));"
  );
  for (const label of ["资料工具", "新增连接", "资料工具的操作", "开放工具"]) {
    assert.ok(management.includes(label));
  }
  const manager = readFileSync("components/chat/mcp-connections.tsx", "utf8");
  for (const action of [
    "setEditing(server)",
    'change(server, "toggle")',
    "setDeleting(server)",
  ]) {
    assert.ok(manager.includes(action), "real dropdown action remains wired");
  }
  for (const admin of [false, true]) {
    const personal = render(
      `const {AgentLibraryPanel}=require('./components/chat/agent-library-panel.tsx');const info={mcpManagement:{admin:${admin},configured:true},skills:[{name:'fixture',description:'查找资料'}],servers:[{id:'fixture',name:'资料工具',status:'configured',tools:['search'],missingEnvironment:[]}],modelConfigured:true,uploadsConfigured:false,limits:{maxSteps:1,timeoutMs:1}};process.stdout.write(renderToStaticMarkup(React.createElement(AgentLibraryPanel,{tab:'tools',info})));`
    );
    assert.match(personal, /资料工具/);
    assert.doesNotMatch(personal, /新增连接|编辑|停用|删除|Authorization/);
    const skills = render(
      `const {AgentLibraryPanel}=require('./components/chat/agent-library-panel.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(AgentLibraryPanel,{tab:'skills',info:{mcpManagement:{admin:${admin}},skills:[{name:'fixture',description:'查找资料'}]}})));`
    );
    assert.match(skills, /查找资料/);
    assert.match(skills, /可用/);
    assert.doesNotMatch(skills, /新增|编辑|删除/);
  }
});
