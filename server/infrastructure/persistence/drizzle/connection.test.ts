import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

function fixture() {
  const created: { options: any; url: string }[] = [];
  let url = "postgres://test:private-pass@localhost/test";
  let fail = false;
  const camel = (value: string) => value;
  const postgres = Object.assign(
    (connection: string, options: any) => {
      if (fail) {
        fail = false;
        throw new Error("constructor failed");
      }
      const pool = { options, url: connection };
      created.push(pool);
      return pool;
    },
    { toCamel: camel }
  );
  const context = createContext({
    process: { pid: 1234 },
    require(name: string) {
      if (name === "postgres") {
        return { __esModule: true, default: postgres };
      }
      assert.equal(name, "@/server/shared/env");
      return { getEnv: () => ({ POSTGRES_URL: url }) };
    },
  });
  const source = ts.transpileModule(
    readFileSync(
      "server/infrastructure/persistence/drizzle/connection.ts",
      "utf8"
    ),
    {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const load = () =>
    runInContext(
      `(()=>{const exports={};${source};return exports;})()`,
      context
    ) as {
      getDatabaseClient: (role?: "orm" | "uploads") => {
        options: any;
        url: string;
      };
    };
  return {
    camel,
    changeUrl: (value: string) => {
      url = value;
    },
    created,
    failNext: () => {
      fail = true;
    },
    load,
  };
}

test("re-evaluated route/HMR modules reuse two bounded pools, not new pools", () => {
  const f = fixture();
  const first = f.load();
  const orm = first.getDatabaseClient(),
    uploads = first.getDatabaseClient("uploads");
  for (let i = 0; i < 100; i += 1) {
    const reloaded = f.load();
    assert.equal(reloaded.getDatabaseClient(), orm);
    assert.equal(reloaded.getDatabaseClient("uploads"), uploads);
  }
  assert.equal(f.created.length, 2);
  assert.equal(orm.options.max + uploads.options.max, 6);
  for (const pool of f.created) {
    assert.equal(pool.options.idle_timeout, 20);
    assert.equal(pool.options.connect_timeout, 10);
    assert.equal(pool.options.max_lifetime, 1800);
  }
});

test("upload column mapping remains separate from ORM and never transforms JSON values", () => {
  const f = fixture(),
    module = f.load();
  const orm = module.getDatabaseClient(),
    uploads = module.getDatabaseClient("uploads");
  assert.notEqual(orm, uploads);
  assert.equal(orm.options.transform, undefined);
  assert.equal(uploads.options.transform.column.from, f.camel);
  assert.equal(uploads.options.transform.value, undefined);
  assert.equal(uploads.options.transform.row, undefined);
});

test("config changes fail closed without retaining additional pools or leaking URLs", () => {
  const f = fixture();
  f.load().getDatabaseClient();
  f.changeUrl("postgres://other:second-secret@localhost/other");
  assert.throws(
    () => f.load().getDatabaseClient(),
    (error: Error) => {
      assert.match(error.message, /重启/);
      assert.doesNotMatch(
        error.message,
        /private-pass|second-secret|postgres:\/\//
      );
      return true;
    }
  );
  assert.equal(f.created.length, 1);
});

test("a failed constructor is not cached as a usable pool", () => {
  const f = fixture();
  f.failNext();
  assert.throws(() => f.load().getDatabaseClient(), /constructor failed/);
  const sql = f.load().getDatabaseClient();
  assert.equal(f.load().getDatabaseClient(), sql);
  assert.equal(f.created.length, 1);
});

test("all application repositories use the shared factory; migration keeps its one-off connection", () => {
  for (const path of [
    "server/infrastructure/persistence/drizzle/client.ts",
    "server/infrastructure/persistence/drizzle/model-settings-repository.ts",
    "server/infrastructure/persistence/drizzle/mcp-settings-repository.ts",
    "server/application/uploads/service.ts",
  ]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /\bpostgres\s*\(/, path);
  }
  assert.match(
    readFileSync(
      "server/infrastructure/persistence/drizzle/migrate.ts",
      "utf8"
    ),
    /max: 1/
  );
});

test("database activity labels identify the pool-owning process, not all replicas", () => {
  const f = fixture();
  assert.equal(
    f.load().getDatabaseClient().options.connection.application_name,
    "chatnest-orm-1234"
  );
  assert.equal(
    f.load().getDatabaseClient("uploads").options.connection.application_name,
    "chatnest-uploads-1234"
  );
});
