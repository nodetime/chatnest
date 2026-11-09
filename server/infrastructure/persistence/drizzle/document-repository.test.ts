import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { isValidSheetCsv } from "@/server/domain/document/sheet-csv";
import { ChatbotError } from "@/server/shared/errors";

test("统一保存入口拒绝错列和破损 CSV，合法引号及换行原样保存", async () => {
  const saved: any[] = [];
  let current: any[] = [];
  const manualWrites: any[] = [];
  const { documentRepository } = load(
    "server/infrastructure/persistence/drizzle/document-repository.ts",
    {
      "./client": {
        db: {
          transaction: (run: any) =>
            run({
              execute: () => Promise.resolve(),
              insert: () => ({
                values: (row: any) => ({
                  returning: () => {
                    saved.push(row);
                    return Promise.resolve([row]);
                  },
                }),
              }),
              select: () => ({
                from: () => ({
                  where: () => ({ orderBy: () => Promise.resolve(current) }),
                }),
              }),
              update: () => ({
                set: (row: any) => ({
                  where: () => ({
                    returning: () => {
                      manualWrites.push(row);
                      return Promise.resolve([row]);
                    },
                  }),
                }),
              }),
            }),
        },
      },
      "./schema": { document: {} },
      "@/server/domain/document/library": {},
      "@/server/domain/document/result-table": {
        isProtectedResultTable: () => false,
      },
      "@/server/domain/document/sheet-csv": { isValidSheetCsv },
      "@/server/shared/errors": {
        ChatbotError: class extends Error {},
      },
      "drizzle-orm": {
        and: () => null,
        desc: () => null,
        eq: () => null,
        sql: () => null,
      },
    }
  );
  const save = (content: string) =>
    documentRepository.save({
      content,
      id: "sheet",
      kind: "sheet",
      title: "对比表",
      userId: "owner",
    });
  await Promise.all(
    [
      "商品,链接,平台,备注\n台灯,,未返回链接,1688,未知",
      "商品,备注\n台灯",
      '商品,备注\n台灯,"未闭合',
      " \n",
    ].map((invalid) => assert.rejects(save(invalid), /bad_request:document/))
  );
  assert.equal(saved.length, 0, "校验失败不写入新版本");
  const valid = '商品,备注\r\n"台灯,暖白","用户备注\n第二行"\r\n';
  await save(valid);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].content, valid, "不自动改写、补列或缩写内容");
  current = saved;
  await assert.rejects(
    documentRepository.updateContent({
      content: "商品,备注\n台灯",
      id: "sheet",
    }),
    /bad_request:document/
  );
  assert.equal(manualWrites.length, 0);
  await documentRepository.updateContent({ content: valid, id: "sheet" });
  assert.equal(manualWrites[0].content, valid);
  const timestamp = current[0].createdAt;
  const edited = "商品,备注\n台灯,用户刚刚保存的修改\n";
  current = [{ ...current[0], content: edited }];
  await assert.rejects(
    documentRepository.save({
      content: valid,
      expectedContent: valid,
      expectedVersion: timestamp.toISOString(),
      id: "sheet",
      kind: "sheet",
      title: "对比表",
      userId: "owner",
    }),
    /bad_request:document/
  );
  assert.equal(
    saved.length,
    1,
    "same-timestamp manual edits are not overwritten by stale execution"
  );
  await documentRepository.save({
    content: valid,
    expectedContent: edited,
    expectedVersion: timestamp.toISOString(),
    id: "sheet",
    kind: "sheet",
    title: "对比表",
    userId: "owner",
  });
  assert.equal(saved.length, 2);
});

test("文档 API 将两种保存入口的校验失败返回 JSON 400，其他错误继续上抛", async () => {
  let failure: Error = new ChatbotError("bad_request:document");
  const { POST } = load("app/(chat)/api/document/route.ts", {
    "@/app/(auth)/auth": {
      auth: () => Promise.resolve({ user: { id: "owner" } }),
    },
    "@/server/composition": {
      getUseCases: () => ({
        documents: {
          listById: () => Promise.resolve([{ userId: "owner" }]),
          save: () => Promise.reject(failure),
          updateContent: () => Promise.reject(failure),
        },
      }),
    },
    "@/server/domain/document/result-table": {
      isProtectedResultTable: () => false,
    },
    "@/server/shared/errors": { ChatbotError },
    zod: { z },
  });
  const request = (isManualEdit: boolean) => ({
    json: () =>
      Promise.resolve({
        content: "商品,备注\n台灯",
        isManualEdit,
        kind: "text", // Manual writes must validate the persisted sheet kind.
        title: "对比表",
      }),
    url: "http://localhost/api/document?id=sheet",
  });
  await Promise.all(
    [false, true].map(async (manual) => {
      const response = await POST(request(manual));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, "bad_request:document");
    })
  );
  failure = new Error("storage offline");
  await assert.rejects(POST(request(false)), /storage offline/);
});

function load(file: string, modules: Record<string, unknown>) {
  const output = { exports: {} as Record<string, any> };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  runInNewContext(code, {
    exports: output.exports,
    module: output,
    process: { env: {} },
    Response,
    require: (name: string) => {
      if (!Object.hasOwn(modules, name)) {
        throw new Error(`Unexpected dependency: ${name}`);
      }
      return modules[name];
    },
    URL,
  });
  return output.exports;
}
