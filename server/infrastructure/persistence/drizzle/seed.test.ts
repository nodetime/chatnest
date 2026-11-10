import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import { compare, compareSync } from "bcrypt-ts";
import { parse } from "dotenv";
import ts from "typescript";
import { getSeedAccount } from "@/server/shared/login-identity";
import { generateHashedPassword } from "@/server/shared/password";
import { resolveSeedDatabaseUrl } from "./seed";

const localUrl = "postgres://chatnest:chatnest@127.0.0.1:55432/chatnest";

for (const environment of ["development", "production", "test", undefined]) {
  test(`should_use_configured_connection_when_environment_is_${environment ?? "unset"}`, () => {
    const configuredUrl =
      "postgresql://owner:custom-password@db.example.com:5432/other?sslmode=require";
    assert.equal(
      resolveSeedDatabaseUrl({
        NODE_ENV: environment,
        POSTGRES_URL: configuredUrl,
      }),
      configuredUrl
    );
  });
}

test("should_accept_default_connection_when_postgres_url_is_configured", () => {
  assert.equal(resolveSeedDatabaseUrl({ POSTGRES_URL: localUrl }), localUrl);
});

for (const [scenario, url] of [
  ["invalid_protocol", "https://chatnest:secret@127.0.0.1:55432/chatnest"],
  ["malformed_url", "not-a-database-url"],
  ["missing_host", "postgres:///chatnest"],
  ["missing_url", undefined],
  ["empty_url", ""],
]) {
  test(`should_reject_seed_without_leaking_credentials_when_connection_has_${scenario}`, () => {
    assert.throws(
      () => resolveSeedDatabaseUrl({ POSTGRES_URL: url }),
      (error: Error) => {
        assert.equal(error.message, "INVALID_SEED_DATABASE_URL");
        assert.doesNotMatch(error.message, /secret|postgres:\/\//);
        return true;
      }
    );
  });
}

for (const environment of ["development", "production", "test", undefined]) {
  test(`should_resolve_seed_account_when_environment_is_${environment ?? "unset"}`, () => {
    const env = process.env as Record<string, string | undefined>;
    const saved = {
      DEV_ADMIN_PASSWORD: env.DEV_ADMIN_PASSWORD,
      DEV_ADMIN_USERNAME: env.DEV_ADMIN_USERNAME,
      NODE_ENV: env.NODE_ENV,
    };
    try {
      if (environment === undefined) {
        // biome-ignore lint/performance/noDelete: process.env 必须删键才能表示未配置。
        delete env.NODE_ENV;
      } else {
        env.NODE_ENV = environment;
      }
      env.DEV_ADMIN_USERNAME = "custom_admin";
      env.DEV_ADMIN_PASSWORD = "custom-seed-password";
      assert.deepEqual(getSeedAccount(), {
        email: "custom_admin@chatnest.local",
        password: "custom-seed-password",
        username: "custom_admin",
      });
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete env[key];
        } else {
          env[key] = value;
        }
      }
    }
  });
}

type AccountRow = {
  id: string;
  email: string;
  password: string | null;
  name: string;
  isAnonymous: boolean;
  sessionRevision: number;
};

function seedFixture(
  options: { accounts?: AccountRow[]; fileText?: string } = {}
) {
  const account = {
    email: "custom_admin@chatnest.local",
    password: "custom-seed-password",
    username: "custom_admin",
  };
  const accounts = options.accounts ?? [];
  const connections: string[] = [];
  const queries: string[] = [];
  let fileText = options.fileText ?? "AUTH_SECRET=fixture\n";
  let fileWrites = 0;
  let closedConnections = 0;
  let transactionActive = false;
  const env = {
    NODE_ENV: "production",
    PLATFORM_ADMIN_USER_IDS: "existing-admin, existing-admin ",
    POSTGRES_URL: "postgresql://owner:fixture@db.example.com:5432/app",
  };
  const transaction = (parts: TemplateStringsArray, ...values: unknown[]) => {
    assert.equal(transactionActive, true);
    const query = parts.join("?").replace(/\s+/g, " ").trim();
    queries.push(query);
    if (query.startsWith("SELECT pg_advisory_xact_lock")) {
      return [];
    }
    if (query.startsWith("SELECT id, password")) {
      return accounts.filter((row) => row.email === values[0]);
    }
    if (query.startsWith("INSERT INTO users")) {
      accounts.push({
        email: String(values[0]),
        id: "seed-account-id",
        isAnonymous: false,
        name: String(values[2]),
        password: String(values[1]),
        sessionRevision: 0,
      });
      return [{ id: "seed-account-id" }];
    }
    if (query.startsWith("UPDATE users SET password")) {
      const row = accounts.find((item) => item.id === values[1]);
      assert.ok(row);
      row.password = String(values[0]);
      row.sessionRevision += 1;
      return [];
    }
    throw new Error(`Unexpected seed query: ${query}`);
  };
  const sql = {
    async begin(operation: (tx: typeof transaction) => unknown) {
      transactionActive = true;
      try {
        return await operation(transaction);
      } finally {
        transactionActive = false;
      }
    },
    end() {
      closedConnections += 1;
    },
  };
  const exports = {} as { seedInitialAdmin: () => Promise<unknown> };
  const context = createContext({
    exports,
    process: { env },
    require(name: string) {
      const dependencies: Record<string, unknown> = {
        "@/server/shared/login-identity": { getSeedAccount: () => account },
        "@/server/shared/password": { generateHashedPassword },
        "bcrypt-ts": { compare },
        dotenv: { parse },
        "node:fs": {
          chmodSync: (_filename: string, mode: number) => {
            assert.equal(mode, 0o600);
          },
          existsSync: () => true,
          readFileSync: () => fileText,
          writeFileSync: (_filename: string, text: string) => {
            assert.equal(transactionActive, false);
            fileText = text;
            fileWrites += 1;
          },
        },
        postgres: {
          __esModule: true,
          default: (url: string, settings: { max: number }) => {
            assert.equal(settings.max, 1);
            connections.push(url);
            return sql;
          },
        },
      };
      assert.ok(name in dependencies, `Unexpected seed dependency: ${name}`);
      return dependencies[name];
    },
    URL,
  });
  const source = ts.transpileModule(
    readFileSync("server/infrastructure/persistence/drizzle/seed.ts", "utf8"),
    {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  runInContext(source, context);
  return {
    accounts,
    get closedConnections() {
      return closedConnections;
    },
    connections,
    get fileText() {
      return fileText;
    },
    get fileWrites() {
      return fileWrites;
    },
    queries,
    seed: () => exports.seedInitialAdmin(),
  };
}

test("should_avoid_database_activity_when_seed_module_is_imported", () => {
  assert.equal(seedFixture().connections.length, 0);
});

test("should_create_initial_admin_when_explicit_seed_runs_in_production", async () => {
  const fixture = seedFixture();
  await fixture.seed();
  assert.equal(
    fixture.connections[0],
    "postgresql://owner:fixture@db.example.com:5432/app"
  );
  assert.equal(fixture.accounts.length, 1);
  const [created] = fixture.accounts;
  assert.equal(created.email, "custom_admin@chatnest.local");
  assert.equal(created.name, "custom_admin");
  assert.equal(created.isAnonymous, false);
  assert.ok(created.password);
  assert.equal(compareSync("custom-seed-password", created.password), true);
  assert.match(fixture.queries[0], /pg_advisory_xact_lock/);
  assert.match(fixture.fileText, /AUTH_SECRET=fixture/);
  assert.match(
    fixture.fileText,
    /^PLATFORM_ADMIN_USER_IDS=existing-admin,seed-account-id$/m
  );
  assert.equal(fixture.closedConnections, 1);
});

test("should_keep_account_password_and_admin_ids_when_seed_runs_again", async () => {
  const fixture = seedFixture();
  await fixture.seed();
  const [created] = fixture.accounts;
  const originalHash = created.password;
  await fixture.seed();
  assert.equal(fixture.accounts.length, 1);
  assert.equal(created.password, originalHash);
  assert.equal(created.sessionRevision, 0);
  assert.equal(
    fixture.fileText.match(/^PLATFORM_ADMIN_USER_IDS=.*$/gm)?.join("\n"),
    "PLATFORM_ADMIN_USER_IDS=existing-admin,seed-account-id"
  );
  assert.equal(fixture.closedConnections, 2);
});

test("should_revise_sessions_when_seed_account_password_changes", async () => {
  const fixture = seedFixture({
    accounts: [
      {
        email: "custom_admin@chatnest.local",
        id: "seed-account-id",
        isAnonymous: false,
        name: "custom_admin",
        password: generateHashedPassword("previous-password"),
        sessionRevision: 7,
      },
    ],
    fileText: "AUTH_SECRET=fixture\nPLATFORM_ADMIN_USER_IDS=old-id\n",
  });
  await fixture.seed();
  assert.equal(fixture.accounts.length, 1);
  assert.ok(fixture.accounts[0].password);
  assert.equal(
    compareSync("custom-seed-password", fixture.accounts[0].password),
    true
  );
  assert.equal(fixture.accounts[0].sessionRevision, 8);
  assert.equal(
    fixture.fileText.match(/^PLATFORM_ADMIN_USER_IDS=/gm)?.length,
    1
  );
});

test("should_reject_duplicate_seed_accounts_before_registering_admin", async () => {
  const account = {
    email: "custom_admin@chatnest.local",
    isAnonymous: false,
    name: "custom_admin",
    password: null,
    sessionRevision: 0,
  };
  const fixture = seedFixture({
    accounts: [
      { ...account, id: "first" },
      { ...account, id: "second" },
    ],
  });
  await assert.rejects(fixture.seed(), /DUPLICATE_SEED_ACCOUNT/);
  assert.equal(fixture.accounts.length, 2);
  assert.equal(fixture.fileWrites, 0);
  assert.equal(fixture.closedConnections, 1);
});
