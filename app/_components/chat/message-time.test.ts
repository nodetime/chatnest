import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

function renderInTimezone(script: string, timezone = "Asia/Shanghai") {
  return execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", TZ: timezone },
    timeout: 15_000,
  });
}

test("should_display_full_local_time_when_message_has_creation_metadata", () => {
  const script = `
    const { formatMessageTime } = require('./app/_components/chat/message-time.tsx');
    process.stdout.write(formatMessageTime('2026-11-10T06:08:09.000Z'));
  `;
  assert.equal(renderInTimezone(script), "2026-11-10 14:08");
  assert.equal(
    renderInTimezone(script, "America/New_York"),
    "2026-11-10 01:08"
  );
});

test("should_omit_unknown_time_when_creation_metadata_is_missing_or_invalid", () => {
  renderInTimezone(`
    const assert = require('node:assert/strict');
    const { formatMessageTime } = require('./app/_components/chat/message-time.tsx');
    for (const value of [undefined, '', 'not-a-date']) {
      assert.equal(formatMessageTime(value), null);
    }
  `);
});

test("should_include_timestamp_in_existing_actions_when_sender_is_user_or_assistant", () => {
  const html = renderInTimezone(`
    const Module = require('node:module');
    const load = Module._load;
    // 消息动作不渲染 Markdown；隔离仅支持 ESM 的第三方 Markdown 插件。
    Module._load = function(name, ...args) {
      const plugins = {'@streamdown/cjk': {cjk: {}}, '@streamdown/code': {code: {}}, '@streamdown/math': {math: {}}, '@streamdown/mermaid': {mermaid: {}}, streamdown: {Streamdown: () => null}};
      return name in plugins ? plugins[name] : load.call(this, name, ...args);
    };
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { PureMessageActions } = require('./app/_components/chat/message-actions.tsx');
    for (const role of ['user', 'assistant']) {
      process.stdout.write(renderToStaticMarkup(React.createElement(PureMessageActions, {
        chatId: 'chat',
        message: {id: role, role, parts: [{type: 'text', text: '正文'}], metadata: {createdAt: '2026-11-10T06:08:09.000Z'}},
        vote: undefined,
        isLoading: false,
      })));
    }
  `);
  assert.equal((html.match(/<time\b/g) ?? []).length, 2);
  assert.equal(
    (html.match(/dateTime="2026-11-10T06:08:09.000Z"/g) ?? []).length,
    2
  );
  assert.equal((html.match(/message-actions/g) ?? []).length, 2);
});
