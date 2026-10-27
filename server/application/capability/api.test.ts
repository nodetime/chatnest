// biome-ignore-all lint/suspicious/useAwait: 离线会话与服务依赖。
import assert from "node:assert/strict";
import { test } from "node:test";

test("个人管理拒绝访客与跨源写，GET只投影属主数据", async () => {
  const feature = await import("./api").catch(() => null);
  assert.ok(feature, "需要个人能力 HTTP 处理器");
  const url = "https://chat.example/api/personal/skills";
  const request = (origin?: string) =>
    new Request(url, {
      body: JSON.stringify({
        action: "preview",
        markdown: "---\nname: a\ndescription: a\n---\na",
      }),
      headers: {
        ...(origin ? { Origin: origin } : {}),
        "content-type": "application/json",
      },
      method: "POST",
    });
  const service = {
    execute: async () => ({ revision: 0 }),
    get: async () => ({ configured: true, revision: 0, skills: [] }),
  };
  const handle = feature.createPersonalSkillsHandler({
    service: () => service,
    session: async () => ({ id: "A", type: "regular" }),
  });
  assert.equal((await handle(request())).status, 403);
  assert.equal((await handle(request("https://evil.example"))).status, 403);
  assert.equal((await handle(request("https://chat.example"))).status, 200);
  const guest = feature.createPersonalSkillsHandler({
    service: () => service,
    session: async () => ({ id: "A", type: "guest" }),
  });
  assert.equal((await guest(new Request(url))).status, 403);
});
