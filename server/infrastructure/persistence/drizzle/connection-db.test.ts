// biome-ignore-all lint/performance/noAwaitInLoops: Bounded sequential reloads and connection-budget sampling.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const enabled = process.env.CHATNEST_POOL_DB === "1";
const child = process.env.CHATNEST_POOL_CHILD === "1";
async function verifyPools() {
  const url = new URL(process.env.POSTGRES_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const observer = postgres(url.href, { max: 1 });
  const { getDatabaseClient } = await import("./connection");
  const orm = getDatabaseClient(),
    uploads = getDatabaseClient("uploads");
  try {
    for (let i = 0; i < 30; i += 1) {
      const reloaded = await import(
        `${new URL("./connection.ts", import.meta.url).href}?poolReload=${i}`
      );
      assert.equal(reloaded.getDatabaseClient(), orm);
      assert.equal(reloaded.getDatabaseClient("uploads"), uploads);
    }
    const [row] =
      await uploads`SELECT 'kept'::text AS snake_name, ${uploads.json({ user_field: "unchanged" })}::jsonb AS payload`;
    assert.equal(row.snakeName, "kept");
    assert.deepEqual(row.payload, { user_field: "unchanged" });
    let finished = false,
      peak = 0;
    const work = Promise.all(
      Array.from(
        { length: 36 },
        (_, i) => (i % 2 ? orm : uploads)`SELECT pg_sleep(0.1)`
      )
    ).finally(() => {
      finished = true;
    });
    while (!finished) {
      const [count] =
        await observer`SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name IN (${`chatnest-orm-${process.pid}`},${`chatnest-uploads-${process.pid}`})`;
      peak = Math.max(peak, count.n);
      assert.ok(count.n <= 6, `pool connections exceeded budget: ${count.n}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await work;
    assert.ok(peak >= 2);
    console.log(
      `POOL_DB_VERIFIED: 30 reloads, 36 concurrent queries, peak=${peak}, JSON preserved`
    );
  } finally {
    await Promise.all([
      orm.end({ timeout: 3 }),
      uploads.end({ timeout: 3 }),
      observer.end(),
    ]);
  }
}
if (enabled && child) {
  verifyPools().then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    }
  );
} else {
  test("opt-in loopback database reloads retain bounded pools and upload column/JSON behavior", {
    skip: !enabled,
  }, () => {
    const output = execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        fileURLToPath(import.meta.url),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, CHATNEST_POOL_CHILD: "1", NODE_OPTIONS: "" },
        timeout: 30_000,
      }
    );
    assert.match(output, /POOL_DB_VERIFIED/);
  });
}
