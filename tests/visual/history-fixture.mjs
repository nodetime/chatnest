// Local test fixture only. Secrets are loaded in-process and never printed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local", quiet: true });
const input = JSON.parse(readFileSync(0, "utf8"));
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
assert.ok(uuid.test(input.ownerId) && uuid.test(input.foreignId));
assert.ok(input.ids.length === 31 && input.ids.every((id) => uuid.test(id)));
assert.ok(/^UI-TEST-[0-9a-f]{8}$/.test(input.prefix));
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
try {
  await sql.begin(async (tx) => {
    if (input.mode === "seed") {
      const owner =
        await tx`select "id" from users where "id" = ${input.ownerId}`;
      assert.equal(owner.length, 1);
      await tx`insert into users ("id", "email", is_anonymous) values (${input.foreignId}, ${`${input.prefix}@fixture.test`}, true)`;
      for (let index = 0; index < 31; index += 1) {
        const title =
          input.prefix +
          (index >= 29 ? " oldneedle特殊%_线索" : ` 对话 ${index}`);
        const ownerId = index === 30 ? input.foreignId : input.ownerId;
        // biome-ignore lint/performance/noAwaitInLoops: deterministic local fixture inserts in one transaction
        await tx`insert into chats ("id", created_at, "title", user_id, "visibility") values (${input.ids[index]}, ${new Date(Date.now() - index * 1000)}, ${title}, ${ownerId}, 'private')`;
      }
      for (const index of [0, 29]) {
        // biome-ignore lint/performance/noAwaitInLoops: deterministic local fixture inserts in one transaction
        await tx`insert into messages (chat_id, "role", "parts", "attachments", created_at) values (
          ${input.ids[index]}, 'assistant', ${tx.json([{ text: `真实数据库测试正文${index}`, type: "text" }])}, ${tx.json([])}, ${new Date()})`;
      }
    } else {
      assert.equal(input.mode, "cleanup");
      // Only these explicit, random fixture IDs; no broad history/user deletion.
      await tx`delete from votes where chat_id in ${tx(input.ids)}`;
      await tx`delete from messages where chat_id in ${tx(input.ids)}`;
      await tx`delete from streams where chat_id in ${tx(input.ids)}`;
      await tx`delete from chats where "id" in ${tx(input.ids)} and user_id in ${tx([input.ownerId, input.foreignId])}`;
      await tx`delete from users where "id" = ${input.foreignId} and "email" = ${`${input.prefix}@fixture.test`}`;
    }
  });
  console.log(JSON.stringify({ fixtureOnly: true, mode: input.mode }));
} finally {
  await sql.end();
}
