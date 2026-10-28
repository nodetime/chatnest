import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { projectToolIdentity } from "./tool-presentation";

test("Ask follows the actual model schema, not a fixed business questionnaire", () => {
  const render = (title: string, question: string) =>
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{AskUser}=require('./app/_components/chat/ask-user.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(AskUser,{messageId:'message',part:{type:'tool-askUser',state:'input-available',toolCallId:'question',input:${JSON.stringify({ questions: [{ id: "custom", label: question, required: true, type: "text" }], title })}},onAnswer:async()=>{}})));`,
      ],
      {
        encoding: "utf8",
        env: {
          HOME: process.env.HOME,
          NODE_ENV: "test",
          PATH: process.env.PATH,
        },
      }
    );
  const a = render(
    "Confirm a destination",
    "Where should the summary be delivered?"
  );
  const b = render("Choose a language", "Which language should I use?");
  assert.match(a, /Where should the summary be delivered/);
  assert.doesNotMatch(a, /需要保留哪些字段|名称.*价格/);
  assert.match(b, /Which language should I use/);
  assert.doesNotMatch(b, /Where should the summary be delivered/);
});
test("Long Ask bodies are bounded; actions remain outside the scrolling form content", () => {
  const source = readFileSync(
    new URL("./ask-user.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /data-testid="ask-questions"/);
  assert.match(source, /max-h-\[min\(50dvh,360px\)\]/);
  assert.match(source, /overflow-y-auto/);
  assert.doesNotMatch(source, /min-h-20/);
});
test("Unknown MCP operations keep their exact identity in details, not raw arguments in the main timeline", () => {
  const p = projectToolIdentity(
    {
      approval: { id: "approval" },
      input: { query: "INTERNAL raw provider parameter" },
      state: "approval-requested",
      toolCallId: "call",
      toolName: "provider__lookup",
      type: "dynamic-tool",
    },
    [
      {
        alias: "provider__lookup",
        name: "native_lookup_v2",
        serverName: "我的资料服务",
      },
    ]
  );
  assert.equal(p.title, "使用我的资料服务");
  assert.equal(p.context, undefined);
  assert.equal(p.name, "provider__lookup");
  assert.equal(p.origin, "我的资料服务");
});
