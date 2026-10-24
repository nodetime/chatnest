import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("customer general settings HTML contains only appearance/service status, not deployment instructions", () => {
  const code = `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {AgentGeneralStatus}=require('./app/_components/chat/agent-general-status.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(AgentGeneralStatus,{modelConfigured:true,uploadsConfigured:false,connectionCount:2})));`;
  const html = execFileSync(process.execPath, ["--import", "tsx", "-e", code], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  for (const text of [
    "对话服务",
    "已设置",
    "资料上传",
    "未开启",
    "检索工具",
    "2 个连接",
  ]) {
    assert.ok(html.includes(text));
  }
  for (const text of [
    ".env",
    "OPENAI_",
    "MCP_",
    "执行上限",
    "maxSteps",
    "timeout",
    "重启",
    "Vercel AI SDK",
  ]) {
    assert.ok(!html.includes(text));
  }
  const source = readFileSync("app/_components/chat/agent-library.tsx", "utf8");
  for (const text of [
    "environmentTemplate",
    "handleCopyConfig",
    "每轮执行上限",
    ".env.local",
    "基于 Vercel AI SDK",
    "固定流水线",
    "脚本执行沙箱",
  ]) {
    assert.ok(!source.includes(text));
  }
});
