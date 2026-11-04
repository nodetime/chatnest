import assert from "node:assert/strict";
import { test } from "node:test";
import { getEnv, organizationsEnabled } from "./env";

// 读取点改造为行为等价:缺省不炸、改动即时可见,这里钉住这三条契约
test("未设置的可选变量返回 undefined 而不是抛错", () => {
  const saved = process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL;
  try {
    assert.equal(getEnv().POSTGRES_URL, undefined);
  } finally {
    if (saved !== undefined) {
      process.env.POSTGRES_URL = saved;
    }
  }
});

test("非法取值集中报错且信息带变量名", () => {
  // next-env 类型把 NODE_ENV 声明为只读,测试里经记录视图改写
  const env = process.env as Record<string, string | undefined>;
  const saved = env.NODE_ENV;
  env.NODE_ENV = "staging";
  try {
    assert.throws(() => getEnv(), /环境变量校验失败.*NODE_ENV/);
  } finally {
    if (saved === undefined) {
      // biome-ignore lint/performance/noDelete: process.env 赋 undefined 会存成字符串 "undefined",必须真正删键
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = saved;
    }
  }
});

test("环境变量修改即时可见(实现不缓存)", () => {
  const saved = process.env.LOG_LEVEL;
  try {
    process.env.LOG_LEVEL = "debug";
    assert.equal(getEnv().LOG_LEVEL, "debug");
    process.env.LOG_LEVEL = "warn";
    assert.equal(getEnv().LOG_LEVEL, "warn");
  } finally {
    if (saved === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = saved;
    }
  }
});

test("组织界面默认关闭，只有显式配置 1 才开启", () => {
  assert.equal(
    organizationsEnabled({ ACCOUNT_ORGANIZATIONS_ENABLED: undefined }),
    false
  );
  assert.equal(
    organizationsEnabled({ ACCOUNT_ORGANIZATIONS_ENABLED: "0" }),
    false
  );
  assert.equal(
    organizationsEnabled({ ACCOUNT_ORGANIZATIONS_ENABLED: "1" }),
    true
  );
});

test("三方积分精度固定为六位定点并拒绝漂移配置", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = env.POINT_SCALE;
  try {
    // biome-ignore lint/performance/noDelete: 需要真正移除变量以验证默认值
    delete env.POINT_SCALE;
    assert.equal(getEnv().POINT_SCALE, 1_000_000);
    env.POINT_SCALE = "1000000";
    assert.equal(getEnv().POINT_SCALE, 1_000_000);
    env.POINT_SCALE = "1000";
    assert.throws(() => getEnv(), /POINT_SCALE/);
  } finally {
    if (saved === undefined) {
      // biome-ignore lint/performance/noDelete: 还原测试环境必须真正移除变量
      delete env.POINT_SCALE;
    } else {
      env.POINT_SCALE = saved;
    }
  }
});

test("结算 worker 最大重试次数有明确默认值和边界", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = env.CHATNEST_SETTLEMENT_MAX_ATTEMPTS;
  try {
    // biome-ignore lint/performance/noDelete: 需要验证缺省值
    delete env.CHATNEST_SETTLEMENT_MAX_ATTEMPTS;
    assert.equal(getEnv().CHATNEST_SETTLEMENT_MAX_ATTEMPTS, undefined);
    env.CHATNEST_SETTLEMENT_MAX_ATTEMPTS = "8";
    assert.equal(getEnv().CHATNEST_SETTLEMENT_MAX_ATTEMPTS, 8);
    env.CHATNEST_SETTLEMENT_MAX_ATTEMPTS = "0";
    assert.throws(() => getEnv(), /CHATNEST_SETTLEMENT_MAX_ATTEMPTS/);
  } finally {
    if (saved === undefined) {
      // biome-ignore lint/performance/noDelete: 还原测试环境必须真正移除变量
      delete env.CHATNEST_SETTLEMENT_MAX_ATTEMPTS;
    } else {
      env.CHATNEST_SETTLEMENT_MAX_ATTEMPTS = saved;
    }
  }
});

test("账户 retention worker 批量大小有明确边界", () => {
  const saved = process.env.ACCOUNT_RETENTION_BATCH_SIZE;
  try {
    delete process.env.ACCOUNT_RETENTION_BATCH_SIZE;
    assert.equal(getEnv().ACCOUNT_RETENTION_BATCH_SIZE, undefined);
    process.env.ACCOUNT_RETENTION_BATCH_SIZE = "25";
    assert.equal(getEnv().ACCOUNT_RETENTION_BATCH_SIZE, 25);
    process.env.ACCOUNT_RETENTION_BATCH_SIZE = "101";
    assert.throws(() => getEnv(), /ACCOUNT_RETENTION_BATCH_SIZE/);
  } finally {
    if (saved === undefined) {
      delete process.env.ACCOUNT_RETENTION_BATCH_SIZE;
    } else {
      process.env.ACCOUNT_RETENTION_BATCH_SIZE = saved;
    }
  }
});

test("worker alert and payment recovery settings have bounded contracts", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = {
    alertUrl: env.CHATNEST_ALERT_WEBHOOK_URL,
    paymentBatch: env.PAYMENT_RECONCILE_BATCH_SIZE,
    timeout: env.CHATNEST_WORKER_TIMEOUT_MS,
  };
  try {
    env.CHATNEST_ALERT_WEBHOOK_URL = "https://alerts.example.test/chatnest";
    env.CHATNEST_WORKER_TIMEOUT_MS = "30000";
    env.PAYMENT_RECONCILE_BATCH_SIZE = "25";
    assert.equal(
      getEnv().CHATNEST_ALERT_WEBHOOK_URL,
      "https://alerts.example.test/chatnest"
    );
    assert.equal(getEnv().CHATNEST_WORKER_TIMEOUT_MS, 30_000);
    assert.equal(getEnv().PAYMENT_RECONCILE_BATCH_SIZE, 25);
    env.CHATNEST_WORKER_TIMEOUT_MS = "999";
    assert.throws(() => getEnv(), /CHATNEST_WORKER_TIMEOUT_MS/);
  } finally {
    if (saved.alertUrl === undefined) {
      // biome-ignore lint/performance/noDelete: 还原测试环境必须真正移除变量
      delete env.CHATNEST_ALERT_WEBHOOK_URL;
    } else {
      env.CHATNEST_ALERT_WEBHOOK_URL = saved.alertUrl;
    }
    if (saved.paymentBatch === undefined) {
      // biome-ignore lint/performance/noDelete: 还原测试环境必须真正移除变量
      delete env.PAYMENT_RECONCILE_BATCH_SIZE;
    } else {
      env.PAYMENT_RECONCILE_BATCH_SIZE = saved.paymentBatch;
    }
    if (saved.timeout === undefined) {
      // biome-ignore lint/performance/noDelete: 还原测试环境必须真正移除变量
      delete env.CHATNEST_WORKER_TIMEOUT_MS;
    } else {
      env.CHATNEST_WORKER_TIMEOUT_MS = saved.timeout;
    }
  }
});
