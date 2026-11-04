import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const payload = resolve(
  process.env.PAYLOAD_ROOT ?? "../../NexaZ/heymoro-starter"
);
const child = "scripts/run-platform-connected-acceptance.sh";
const nativeRuntimeUrl = `postgres://heymoro_native_app_123456abcdef:${"a".repeat(64)}@127.0.0.1:5433/heymoro_native_api_acceptance`;
function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "heymoro-native-api."));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(join(root, "media"));
  mkdirSync(join(root, "bin"));
  const log = join(root, "commands.log");
  writeFileSync(
    join(root, "bin/docker"),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$FIXTURE_COMMAND_LOG"\ncase "$*" in\n'ps --format {{.Names}}') echo chatnest-postgres;;\n*createdb*) exit "\${FIXTURE_CREATE_EXIT:-0}";;\nesac\n`,
    { mode: 0o700 }
  );
  writeFileSync(
    join(root, "bin/pnpm"),
    '#!/bin/sh\nprintf "pnpm %s\\n" "$*" >> "$FIXTURE_COMMAND_LOG"\nexit 17\n',
    { mode: 0o700 }
  );
  writeFileSync(
    join(root, "bin/lsof"),
    '#!/bin/sh\nprintf "lsof %s\\n" "$*" >> "$FIXTURE_COMMAND_LOG"\n[ -n "$FIXTURE_OCCUPIED_PORT" ] && [ "$1" = "-tiTCP:$FIXTURE_OCCUPIED_PORT" ]\n',
    { mode: 0o700 }
  );
  return {
    env: {
      DATABASE_URL: nativeRuntimeUrl,
      FIXTURE_COMMAND_LOG: log,
      HOME: process.env.HOME,
      NODE_ENV: "test" as const,
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      PAYLOAD_CONNECTED_ACCEPTANCE: "1",
      PAYLOAD_DB_PUSH: "0",
      PAYLOAD_NATIVE_API_DB_ACCEPTANCE: "1",
      PAYLOAD_PLATFORM_SERVICE_TOKEN: "fixture-only-not-a-service",
      PAYLOAD_ROOT: payload,
      UPLOAD_DIR: join(root, "media"),
    },
    log,
    root,
  };
}

test("connected parent mode rejects an invalid ChatNest root before any Docker lifecycle", () => {
  const result = spawnSync(
    "bash",
    [
      join(payload, "apps/server/scripts/run-native-api-acceptance.sh"),
      "--connected",
    ],
    {
      encoding: "utf8",
      env: {
        CHATNEST_ROOT: "/not-a-connected-checkout",
        HOME: process.env.HOME,
        NODE_ENV: "test" as const,
        PATH: process.env.PATH,
      },
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /CONNECTED_CHATNEST_ROOT_REQUIRED/);
});
for (const url of [
  nativeRuntimeUrl.replace("/heymoro_native_api_acceptance", "/heymoro"),
  `${nativeRuntimeUrl}?x=1`,
  nativeRuntimeUrl.replace("5433", "55432"),
  "postgres://postgres:postgres@127.0.0.1:5433/heymoro_native_api_acceptance",
]) {
  test(`connected child rejects a non-owned parent URL before Docker: ${new URL(url).pathname}`, (t) => {
    const f = fixture(t);
    const result = spawnSync("bash", [child], {
      encoding: "utf8",
      env: { ...f.env, DATABASE_URL: url },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /OWNED_CONNECTED_PARENT_REQUIRED/);
    assert.equal(result.stderr.includes("No such file"), false);
    assert.throws(() => readFileSync(f.log));
  });
}
test("connected child never acquires or drops an existing ChatNest fixture database", (t) => {
  const f = fixture(t);
  const result = spawnSync("bash", [child], {
    encoding: "utf8",
    env: { ...f.env, FIXTURE_CREATE_EXIT: "3" },
  });
  assert.notEqual(result.status, 0);
  const commands = readFileSync(f.log, "utf8");
  assert.match(
    commands,
    /createdb -U chatnest chatnest_platform_connected_acceptance/
  );
  assert.doesNotMatch(commands, /dropdb|compose.*stop|heymoro/);
});
test("connected child migration failure only removes its own database, retaining the parent and shared PG", (t) => {
  const f = fixture(t);
  const result = spawnSync("bash", [child], { encoding: "utf8", env: f.env });
  assert.notEqual(result.status, 0);
  const commands = readFileSync(f.log, "utf8");
  assert.match(
    commands,
    /dropdb -U chatnest --force chatnest_platform_connected_acceptance/
  );
  assert.doesNotMatch(commands, /compose.*stop|infra-postgres|heymoro_native/);
});

for (const field of [
  "PAYLOAD_CONNECTED_ACCEPTANCE",
  "PAYLOAD_NATIVE_API_DB_ACCEPTANCE",
  "PAYLOAD_DB_PUSH",
  "UPLOAD_DIR",
]) {
  test(`connected child rejects missing parent gate ${field} before Docker`, (t) => {
    const f = fixture(t);
    const result = spawnSync("bash", [child], {
      encoding: "utf8",
      env: { ...f.env, [field]: "" },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /OWNED_CONNECTED_PARENT_REQUIRED/);
    assert.throws(() => readFileSync(f.log));
  });
}
test("connected child rejects unknown arguments before Docker", (t) => {
  const f = fixture(t);
  const result = spawnSync("bash", [child, "--unknown"], {
    encoding: "utf8",
    env: f.env,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /OWNED_CONNECTED_PARENT_REQUIRED/);
  assert.throws(() => readFileSync(f.log));
});

test("connected browser rejects an unexpected Payload origin before fixture loading or any network", (t) => {
  const f = fixture(t);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--conditions=react-server",
      "scripts/platform-connected-browser-acceptance.ts",
    ],
    {
      encoding: "utf8",
      env: {
        ...f.env,
        CHATNEST_PLATFORM_CONNECTED_ACCEPTANCE: "1",
        CONNECTED_ACCEPTANCE_BASE_URL: "http://127.0.0.1:33385",
        CONNECTED_ACCEPTANCE_FILE: join(f.root, "must-not-be-read.json"),
        CONNECTED_ACCEPTANCE_PASSWORD: "fixture-only-password",
        MODEL_PROVIDER: "openai",
        OPENAI_API_KEY: "connected-no-provider-key",
        OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
        OPENAI_MODEL: "connected-no-model-calls",
        PAYMENT_CHECKOUT_BASE_URL: "http://127.0.0.1:9/owned-fixture-checkout",
        PLATFORM_BASE_URL: "http://127.0.0.1:3010",
        PLATFORM_MODE: "connected",
        PLATFORM_SERVICE_TOKEN: f.env.PAYLOAD_PLATFORM_SERVICE_TOKEN,
        POSTGRES_URL: `postgres://chatnest_connected_app_123456abcdef:${"a".repeat(64)}@127.0.0.1:55432/chatnest_platform_connected_acceptance`,
      },
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OWNED_CONNECTED_BROWSER_REQUIRED/);
  assert.doesNotMatch(result.stderr, /ENOENT|browserType\.launch/);
  assert.throws(() => readFileSync(f.log));
});

test("connected viewport captures wait for loaded admin data and this run's audit export", () => {
  const script = readFileSync(
    "scripts/platform-connected-browser-acceptance.ts",
    "utf8"
  );
  const viewportLoop = script.slice(
    script.indexOf("for (const width of [1440, 390])")
  );
  assert.match(viewportLoop, /getByText\("导出账务审计"/);
  assert.match(viewportLoop, /getByText\(\/读取中\/\)\)\.toHaveCount\(0\)/);
  assert.ok(
    viewportLoop.indexOf('getByText("导出账务审计"') <
      viewportLoop.indexOf(".screenshot(")
  );
});

test("connected fixture does not compete with the configured Porta service on 33383", (t) => {
  const f = fixture(t);
  const result = spawnSync("bash", [child], {
    encoding: "utf8",
    env: { ...f.env, FIXTURE_CREATE_EXIT: "3", FIXTURE_OCCUPIED_PORT: "33383" },
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /CONNECTED_FIXTURE_PORT_IN_USE/);
  assert.match(
    readFileSync(f.log, "utf8"),
    /createdb -U chatnest chatnest_platform_connected_acceptance/
  );
});
test("connected fixture refuses an occupied new owned port before acquiring any database", (t) => {
  const f = fixture(t);
  const result = spawnSync("bash", [child], {
    encoding: "utf8",
    env: { ...f.env, FIXTURE_CREATE_EXIT: "3", FIXTURE_OCCUPIED_PORT: "33385" },
  });
  assert.match(result.stdout, /CONNECTED_FIXTURE_PORT_IN_USE/);
  assert.doesNotMatch(
    readFileSync(f.log, "utf8"),
    /createdb|dropdb|compose|pnpm|ps --format/
  );
});

for (const base of [
  "http://127.0.0.1:33383",
  "http://localhost:33385",
  "http://127.0.0.1:33386",
]) {
  test(`connected browser rejects non-owned ChatNest origin ${base} before loading fixtures`, (t) => {
    const f = fixture(t);
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--conditions=react-server",
        "scripts/platform-connected-browser-acceptance.ts",
      ],
      {
        encoding: "utf8",
        env: {
          ...f.env,
          CHATNEST_PLATFORM_CONNECTED_ACCEPTANCE: "1",
          CONNECTED_ACCEPTANCE_BASE_URL: base,
          CONNECTED_ACCEPTANCE_FILE: join(f.root, "must-not-be-read.json"),
          CONNECTED_ACCEPTANCE_PASSWORD: "fixture-only-password",
          MODEL_PROVIDER: "openai",
          OPENAI_API_KEY: "connected-no-provider-key",
          OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
          OPENAI_MODEL: "connected-no-model-calls",
          PAYMENT_CHECKOUT_BASE_URL:
            "http://127.0.0.1:9/owned-fixture-checkout",
          PLATFORM_BASE_URL: "http://127.0.0.1:3016",
          PLATFORM_MODE: "connected",
          PLATFORM_SERVICE_TOKEN: f.env.PAYLOAD_PLATFORM_SERVICE_TOKEN,
          POSTGRES_URL: `postgres://chatnest_connected_app_123456abcdef:${"a".repeat(64)}@127.0.0.1:55432/chatnest_platform_connected_acceptance`,
        },
      }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /OWNED_CONNECTED_BROWSER_REQUIRED/);
    assert.doesNotMatch(result.stderr, /ENOENT|browserType\.launch/);
    assert.throws(() => readFileSync(f.log));
  });
}
