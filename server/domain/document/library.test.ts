import assert from "node:assert/strict";
import test from "node:test";
import { projectLibraryEntry } from "./library";

test("library projections only include safe metadata, never content or owner id", () => {
  const entry = projectLibraryEntry({
    content: "private body",
    createdAt: new Date("2026-10-27T00:00:00Z"),
    id: "d1",
    kind: "text",
    title: "项目总结",
    userId: "private owner",
  });
  assert.deepEqual(entry, {
    chatId: null,
    createdAt: "2026-10-27T00:00:00.000Z",
    id: "d1",
    kind: "text",
    title: "项目总结",
  });
  assert.equal(JSON.stringify(entry).includes("private"), false);
});

test("generic sheets remain generic, not presumed result tables", () => {
  assert.equal(
    projectLibraryEntry({
      content: "a,b\n1,2",
      createdAt: new Date(),
      id: "s1",
      kind: "sheet",
      title: "预算",
      userId: "u",
    })?.chatId,
    null
  );
});
