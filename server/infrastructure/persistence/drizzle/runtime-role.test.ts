// biome-ignore-all lint/performance/noAwaitInLoops: independent rejection cases are verified serially.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const flags = [
  "roleSafe",
  "ownershipSafe",
  "ddlSafe",
  "journalSafe",
  "sequencesSafe",
  "functionsSafe",
  "permissionsReady",
];
const safe = Object.fromEntries(flags.map((key) => [key, true]));
async function enforce(
  rows: unknown,
  env: Record<string, string | undefined> = { NODE_ENV: "production" }
) {
  const { enforceRuntimeDatabaseRole } = await import("./runtime-role");
  let queries = 0;
  await enforceRuntimeDatabaseRole(
    {
      unsafe: () => {
        queries += 1;
        return Promise.resolve(rows);
      },
    },
    env
  );
  return queries;
}

test("build and migration identities have separate commands", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts.build, "next build");
  const migration = readFileSync(
    "server/infrastructure/persistence/drizzle/migrate.ts",
    "utf8"
  );
  assert.match(migration, /MIGRATION_POSTGRES_URL/);
  assert.doesNotMatch(migration, /skipping migrations/);
});

test("production register awaits role check only in Node runtime, outside build", () => {
  const source = readFileSync("instrumentation.ts", "utf8");
  assert.match(source, /async function register/);
  assert.match(source, /NEXT_RUNTIME === "nodejs"/);
  assert.match(source, /NEXT_PHASE !== "phase-production-build"/);
  assert.match(source, /await checkDatabaseReadiness\(\)/);
});

test("ready route is dynamic, no-store and accessible without guest creation", () => {
  const proxy = readFileSync("proxy.ts", "utf8");
  assert.match(proxy, /pathname === "\/api\/health\/ready"/);
  const route = readFileSync("app/api/health/ready/route.ts", "utf8");
  assert.match(route, /await connection\(\)/);
  assert.doesNotMatch(route, /export const (dynamic|runtime)/);
  assert.match(route, /no-store/);
  assert.match(route, /503/);
});

test("production accepts only the complete boolean audit", async () => {
  assert.equal(await enforce([safe]), 1);
});
for (const key of flags) {
  test(`rejects unsafe or missing ${key}`, async () => {
    for (const value of [false, undefined, "true"]) {
      await assert.rejects(
        enforce([{ ...safe, [key]: value }]),
        /DATABASE_RUNTIME_ROLE_UNSAFE/
      );
    }
  });
}
test("rejects malformed or multiple audit rows", async () => {
  for (const rows of [[], [safe, safe], null, { rows: [safe] }]) {
    await assert.rejects(enforce(rows), /DATABASE_RUNTIME_ROLE_UNSAFE/);
  }
});
for (const key of ["MIGRATION_POSTGRES_URL", "POSTGRES_PASSWORD"]) {
  test(`production rejects owner secret ${key} before query`, async () => {
    await assert.rejects(
      enforce([safe], { NODE_ENV: "production", [key]: "private" }),
      /DATABASE_RUNTIME_ROLE_UNSAFE/
    );
  });
}
test("query failure is unavailable, not verified unsafe", async () => {
  const { enforceRuntimeDatabaseRole } = await import("./runtime-role");
  await assert.rejects(
    enforceRuntimeDatabaseRole(
      { unsafe: () => Promise.reject(new Error("secret connection detail")) },
      { NODE_ENV: "production" }
    ),
    /^Error: DATABASE_RUNTIME_ROLE_UNAVAILABLE$/
  );
});
test("development does not audit production role policy", async () => {
  assert.equal(await enforce(null, { NODE_ENV: "development" }), 0);
});

test("all Drizzle management and owned dev migration use the explicit migration identity", () => {
  const config = readFileSync("drizzle.config.ts", "utf8");
  assert.match(config, /process\.env\.MIGRATION_POSTGRES_URL/);
  assert.doesNotMatch(config, /process\.env\.POSTGRES_URL/);
  const dev = readFileSync(
    ".claude/skills/dev-env/scripts/dev-env-loop.mjs",
    "utf8"
  );
  assert.match(dev, /MIGRATION_POSTGRES_URL:/);
  assert.match(dev, /仅迁移本地开发库/);
});

test("production pool rejects missing POSTGRES_URL before driver defaults", async () => {
  const before = {
    NODE_ENV: process.env.NODE_ENV,
    POSTGRES_URL: process.env.POSTGRES_URL,
  };
  try {
    Object.assign(process.env, { NODE_ENV: "production", POSTGRES_URL: "" });
    const { getDatabaseClient } = await import("./connection");
    assert.throws(
      () => getDatabaseClient(),
      /DATABASE_RUNTIME_CONFIGURATION_INVALID/
    );
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("dev migration rejects duplicate and parent-overridden runtime targets without editing env", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = readFileSync(
    ".claude/skills/dev-env/scripts/dev-env-loop.mjs",
    "utf8"
  );
  const body = source.slice(
    source.indexOf("function migrate()"),
    source.indexOf("// ---------- 阶段 4:")
  );
  const local = "postgres://chatnest:chatnest@127.0.0.1:55432/chatnest";
  const exercise = (text: string, parent?: string) => {
    let child: Record<string, unknown> | undefined;
    const migrate = runInNewContext(`(${body})`, {
      ENV_LOCAL: "not-read",
      guide: () => {
        /* Isolated dev gate test does not emit operator logs. */
      },
      log: () => {
        /* Isolated dev gate test does not emit operator logs. */
      },
      process: {
        env: { POSTGRES_URL: parent },
        exit: () => {
          throw new Error("GATE_REJECTED");
        },
      },
      readFileSync: () => text,
      run: (
        _cmd: string,
        _args: unknown,
        options: { env: Record<string, unknown> }
      ) => {
        child = options.env;
        return { status: 0 };
      },
    });
    migrate();
    return child;
  };
  assert.equal(
    exercise(`POSTGRES_URL=${local}\n`)?.MIGRATION_POSTGRES_URL,
    local
  );
  for (const [text, parent] of [
    [`POSTGRES_URL=${local}\nPOSTGRES_URL=postgres://remote/db\n`, undefined],
    [`POSTGRES_URL=${local}\n`, "postgres://remote/db"],
    ["POSTGRES_URL=postgres://remote/db\n", undefined],
  ]) {
    assert.throws(() => exercise(text as string, parent), /GATE_REJECTED/);
  }
});

test("instrumentation module loads before database or telemetry initialization", async () => {
  const { register } = await import("../../../../instrumentation");
  assert.equal(typeof register, "function");
});
