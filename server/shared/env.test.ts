import assert from "node:assert/strict";
import { test } from "node:test";
import { getEnv } from "./env";

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
