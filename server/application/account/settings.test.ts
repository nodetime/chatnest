// biome-ignore-all lint/suspicious/useAwait: Repository fakes implement asynchronous production contracts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAccountSettingsService } from "@/server/application/account/settings";
import type {
  AccountExport,
  AccountRepository,
  AccountSettingsProjection,
} from "@/server/domain/account/repository";

const projection: AccountSettingsProjection = {
  account: {
    createdAt: "2026-10-31T00:00:00.000Z",
    email: "user@example.com",
    emailVerified: true,
    image: null,
    name: "用户",
    updatedAt: "2026-10-31T00:00:00.000Z",
  },
  deletionRequest: null,
  preferences: {
    defaultModelId: null,
    emailNotifications: true,
    revision: 1,
    updatedAt: "2026-10-31T00:00:00.000Z",
  },
};

function memory() {
  const calls: string[] = [];
  const repository: AccountRepository = {
    cancelDeletionRequest: async () => {
      calls.push("cancel");
      return true;
    },
    completeDeletionRequest: async ({ completedBy, requestId }) => {
      calls.push(`complete:${requestId}:${completedBy}`);
      return "completed";
    },
    exportData: async () => {
      calls.push("export");
      return {
        account: projection.account,
        chats: [],
        deletionRequest: projection.deletionRequest,
        documents: [],
        exportedAt: "now",
        preferences: projection.preferences,
      } satisfies AccountExport;
    },
    getSettings: async () => projection,
    listDeletionRequests: async () => [],
    markDeletionRemoteFailure: async () => {
      calls.push("remote-failure");
    },
    requestDeletion: async (_userId, reason) => {
      calls.push(`delete:${reason ?? ""}`);
      return projection;
    },
    revokeSessions: async () => {
      calls.push("revoke");
      return 2;
    },
    updatePreferences: async (input) => {
      calls.push(
        `preferences:${input.defaultModelId ?? ""}:${input.expectedRevision}`
      );
      return projection;
    },
    updateProfile: async (input) => {
      calls.push(`profile:${input.name ?? ""}`);
      return projection;
    },
  };
  return { calls, repository };
}

test("account settings validates and normalizes profile and model preferences", async () => {
  const { calls, repository } = memory();
  const service = createAccountSettingsService(repository);

  await service.updateProfile("user-1", { name: "  新名称  " });
  await service.updatePreferences("user-1", {
    defaultModelId: "",
    emailNotifications: false,
    expectedRevision: 1,
  });

  assert.deepEqual(calls, ["profile:新名称", "preferences::1"]);
  await assert.rejects(
    async () =>
      service.updatePreferences("user-1", {
        defaultModelId: "not-a-model",
        emailNotifications: true,
        expectedRevision: 1,
      }),
    /INVALID_DEFAULT_MODEL/
  );
});

test("account settings preserves revision and deletion boundaries", async () => {
  const { calls, repository } = memory();
  const service = createAccountSettingsService(repository);

  await service.updatePreferences("user-1", {
    defaultModelId: "moonshotai/kimi-k2.5",
    emailNotifications: true,
    expectedRevision: 7,
  });
  await service.requestDeletion("user-1", "  请删除旧数据  ");
  await service.cancelDeletion("user-1");
  await service.revokeSessions("user-1");
  await service.completeDeletionRequest({
    completedBy: "admin-1",
    requestId: "request-1",
  });
  await service.exportData("user-1");

  assert.deepEqual(calls, [
    "preferences:moonshotai/kimi-k2.5:7",
    "delete:请删除旧数据",
    "cancel",
    "revoke",
    "complete:request-1:admin-1",
    "export",
  ]);
  await assert.rejects(
    async () => service.requestDeletion("user-1", "x".repeat(501)),
    /INVALID_DELETION_REASON/
  );
});
