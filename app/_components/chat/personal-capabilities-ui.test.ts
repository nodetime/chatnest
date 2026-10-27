import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Personal connector management reuses the native MCP editor with a private endpoint", () => {
  const source = readFileSync(
    new URL("./personal-connections.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /McpEditor/);
  assert.match(source, /endpoint=\{personalMcpEndpoint\}/);
  assert.match(
    readFileSync(
      new URL("../../_hooks/use-personal-capabilities.ts", import.meta.url),
      "utf8"
    ),
    /\/api\/personal\/mcp/
  );
  assert.match(source, /只读|平台提供/);
  assert.match(source, /删除连接/);
});
test("Personal skills provide a preview before import and explicit enable, edit, copy and delete", () => {
  const source = readFileSync(
    new URL("./personal-skills.tsx", import.meta.url),
    "utf8"
  );
  for (const text of ["preview", "save", "toggle", "copy", "delete", "read"]) {
    assert.ok(source.includes(`"${text}"`), text);
  }
  assert.match(source, /64_000/);
  assert.match(source, /accept="\.md/);
  assert.match(source, /Dialog/);
});
test("Per-task selection is a structured scope, not a business prompt or automatic execution", () => {
  const source = readFileSync(
    new URL("./task-capabilities.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /serverIds/);
  assert.match(source, /skillIds/);
  assert.match(source, /本次使用/);
  assert.doesNotMatch(source, /sendMessage|executeTool/);
  const hook = readFileSync(
    new URL("../../_hooks/use-active-chat.tsx", import.meta.url),
    "utf8"
  );
  assert.match(hook, /capabilitySelection/);
});

test("Agent capability cache cannot reuse another logged-in user's metadata", () => {
  const result = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `
 const assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{SWRConfig,unstable_serialize}=require('swr'),{SessionContext}=require('next-auth/react');
 const {useAgentInfo}=require('./app/_hooks/use-agent-info.ts');
 const fallback={[unstable_serialize(['/api/agent','A'])]:{servers:[{name:'PRIVATE_A'}]},[unstable_serialize(['/api/agent','B'])]:{servers:[{name:'PRIVATE_B'}]}};
 const Probe=()=>React.createElement('span',null,JSON.stringify(useAgentInfo().data));
 const render=id=>renderToStaticMarkup(React.createElement(SessionContext.Provider,{value:{data:id?{user:{id}}:null,status:'authenticated'}},React.createElement(SWRConfig,{value:{provider:()=>new Map(),fallback,revalidateOnMount:false}},React.createElement(Probe))));
 assert.ok(render('A').includes('PRIVATE_A'));assert.ok(render('B').includes('PRIVATE_B'));assert.ok(!render('B').includes('PRIVATE_A'));assert.ok(!render(null).includes('PRIVATE_A'));console.log('isolated');
 `,
    ],
    {
      encoding: "utf8",
      env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
    }
  );
  assert.match(result, /isolated/);
});

test("waiting Ask or approval can stage the next user turn without changing the approved scope", () => {
  const source = readFileSync(
    new URL("./task-capabilities.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /pendingInteraction/);
  assert.match(source, /下一条新消息/);
  assert.doesNotMatch(
    source,
    /status === "streaming" \|\| hasPendingInteraction/
  );
});
