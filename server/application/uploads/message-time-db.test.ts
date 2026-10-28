import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

// Explicit, loopback-only database integration; never enabled by offline CI.
const enabled = process.env.CHATNEST_MESSAGE_TIME_DB === "1";
const child = process.env.CHATNEST_MESSAGE_TIME_CHILD === "1";

async function checkChronology() {
  const url = new URL(process.env.POSTGRES_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const admin = postgres(url.href, { max: 1 });
  const schema = `message_time_${randomUUID().replaceAll("-", "")}`;
  try {
    await admin.unsafe(`CREATE SCHEMA "${schema}"`);
    // An isolated schema only. No real user or conversation is read or updated.
    await admin.unsafe(
      `CREATE TABLE "${schema}".chats(id uuid PRIMARY KEY,created_at timestamp NOT NULL,title text NOT NULL,user_id uuid NOT NULL,visibility text NOT NULL); CREATE TABLE "${schema}".messages(id uuid PRIMARY KEY,chat_id uuid NOT NULL,role text NOT NULL,parts json NOT NULL,attachments json NOT NULL,created_at timestamp NOT NULL)`
    );
    url.searchParams.set(
      "options",
      `-csearch_path=${schema} -cTimeZone=America/New_York`
    );
    process.env.POSTGRES_URL = url.href;
    const { commitUserMessage } = await import("./service");
    const { messageRepository } = await import(
      "@/server/infrastructure/persistence/drizzle/message-repository"
    );
    const ownerId = randomUUID(),
      chatId = randomUUID();
    const base = Date.parse("2026-10-28T04:00:00.000Z");
    for (let i = 0; i < 4; i += 1) {
      const value = {
        attachments: [],
        chatId,
        createdAt: new Date(base + i * 1000),
        id: randomUUID(),
        parts: [{ text: `turn-${i}`, type: "text" }],
        role: i % 2 === 0 ? "user" : "assistant",
      };
      if (i % 2 === 0) {
        // biome-ignore lint/performance/noAwaitInLoops: regression requires alternating persisted turns in order
        await commitUserMessage({
          chatId,
          message: value,
          ownerId,
          visibility: "private",
        });
      } else {
        await messageRepository.saveMany([value]);
      }
    }
    const [created] = await admin.unsafe(
      `SELECT to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS value FROM "${schema}".chats WHERE id=$1`,
      [chatId]
    );
    assert.equal(created.value, new Date(base).toISOString().slice(0, -1));
    const rows = await messageRepository.listByChatId(chatId);
    assert.deepEqual(
      rows.map((r) => r.role),
      ["user", "assistant", "user", "assistant"],
      "raw user and Drizzle assistant timestamps must have the same UTC convention"
    );
    assert.deepEqual(
      rows.map((r) => r.createdAt.toISOString()),
      [0, 1, 2, 3].map((i) => new Date(base + i * 1000).toISOString())
    );
    console.log("Verified: UTC conversation order under America/New_York");
  } finally {
    await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}
if (enabled && child) {
  checkChronology().then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    }
  );
} else {
  test("opt-in raw and Drizzle message persistence agree in non-UTC database sessions", {
    skip: !enabled,
  }, () => {
    const result = execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        fileURLToPath(import.meta.url),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CHATNEST_MESSAGE_TIME_CHILD: "1",
          NODE_OPTIONS: "",
        },
        timeout: 30_000,
      }
    );
    assert.match(result, /Verified: UTC conversation order/);
  });
}
