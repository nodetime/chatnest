import assert from "node:assert/strict";
import test from "node:test";
import { ModelNetworkError, modelDNSAddresses } from "./network";

test("部署 DNS pin 仅匹配精确域名，不改变缺省解析", () => {
  assert.equal(modelDNSAddresses("gateway.example", {}), null);
  const env = {
    MODEL_DNS_OVERRIDES: JSON.stringify({
      "gateway.example": ["1.1.1.1", "2606:4700:4700::1111"],
    }),
  };
  assert.deepEqual(modelDNSAddresses("gateway.example", env), [
    { address: "1.1.1.1", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ]);
  assert.equal(modelDNSAddresses("other.example", env), null);
  assert.equal(modelDNSAddresses("constructor", env), null);
  assert.equal(modelDNSAddresses("__proto__", env), null);
});

test("DNS pin 不开放内网、Fake-IP、通配域名或异常配置", () => {
  for (const value of [
    "not-json",
    "[]",
    '{"*.example":["1.1.1.1"]}',
    '{"https://gateway.example":["1.1.1.1"]}',
    '{"gateway.example":[]}',
    '{"gateway.example":["localhost"]}',
    ...["127.0.0.1", "10.0.0.1", "198.18.1.7", "::1", "169.254.169.254"].map(
      (ip) => JSON.stringify({ "gateway.example": [ip] })
    ),
  ]) {
    assert.throws(
      () =>
        modelDNSAddresses("gateway.example", { MODEL_DNS_OVERRIDES: value }),
      (error: unknown) =>
        error instanceof ModelNetworkError && error.code === "destination"
    );
  }
});
