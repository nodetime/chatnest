import { sendDeletionNotification } from "@/server/application/account/notification-worker";
import { createAccountSettingsService } from "@/server/application/account/settings";
import { createAdminAlertsService } from "@/server/application/admin/alerts";
import { deleteChat } from "@/server/application/chat/delete-chat";
import { wrapModelWithBilling } from "@/server/application/chat/model-billing";
import {
  type SendMessageInput,
  sendMessage,
} from "@/server/application/chat/send-message";
import { createPlatformBillingClient } from "@/server/application/platform/client";
import { createRequestToolBilling } from "@/server/application/platform/execution-gate";
import { deactivatePlatformIdentity } from "@/server/application/platform/identity";
import {
  replayDeadLetterSettlement,
  runSettlementWorkerOnce,
} from "@/server/application/platform/settlement-worker";
import {
  closeBrowserSession,
  getBrowserSession,
} from "@/server/infrastructure/browser/browser-session";
import { readAgentConfig } from "@/server/infrastructure/mcp/config";
import { discoverSkills } from "@/server/infrastructure/mcp/skills";
import { accountRepository } from "@/server/infrastructure/persistence/drizzle/account-repository";
import { alertHistoryRepository } from "@/server/infrastructure/persistence/drizzle/alert-history-repository";
import { billingRepository } from "@/server/infrastructure/persistence/drizzle/billing-repository";
import { chatRepository } from "@/server/infrastructure/persistence/drizzle/chat-repository";
import { documentRepository } from "@/server/infrastructure/persistence/drizzle/document-repository";
import { messageRepository } from "@/server/infrastructure/persistence/drizzle/message-repository";
import { suggestionRepository } from "@/server/infrastructure/persistence/drizzle/suggestion-repository";
import { userRepository } from "@/server/infrastructure/persistence/drizzle/user-repository";
import { voteRepository } from "@/server/infrastructure/persistence/drizzle/vote-repository";
import { getEnv } from "@/server/shared/env";

// 模块级装配工厂:平台层(route/actions)只经此入口取用例与域门面,不触碰仓储实现(R3 的豁免点)。
// P3 域门面只暴露平台层实际需要的方法;chat 编排走 sendMessage 用例,写入侧 replace* 不外露。
// 单进程内只装配一次;测试不走这里,直接以 mock 仓储调 sendMessage/deleteChat。
// 命名避开 use 前缀:biome React 预设会把 use* 当 hook,嵌套调用即误报 useHookAtTopLevel
function buildUseCases() {
  const env = getEnv();
  const chats = chatRepository;
  const messages = messageRepository;
  return {
    account: createAccountSettingsService({
      deactivatePlatformIdentity:
        env.PLATFORM_MODE === "connected" &&
        env.PLATFORM_BASE_URL &&
        env.PLATFORM_SERVICE_TOKEN
          ? ({ subject }) =>
              deactivatePlatformIdentity({
                baseUrl: env.PLATFORM_BASE_URL as string,
                issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
                serviceToken: env.PLATFORM_SERVICE_TOKEN as string,
                subject,
              })
          : undefined,
      notificationLimit: env.ACCOUNT_DELETION_NOTIFICATION_BATCH_SIZE,
      notifyDeletion: env.ACCOUNT_DELETION_NOTIFICATION_WEBHOOK_URL
        ? (input) =>
            sendDeletionNotification(input, {
              token: env.ACCOUNT_DELETION_NOTIFICATION_WEBHOOK_TOKEN,
              url: env.ACCOUNT_DELETION_NOTIFICATION_WEBHOOK_URL as string,
            })
        : undefined,
      repository: accountRepository,
      retentionLimit: env.ACCOUNT_RETENTION_BATCH_SIZE,
    }),
    admin: {
      alertsSnapshot: createAdminAlertsService({
        readHistory: alertHistoryRepository.list,
        readPaymentOverview:
          env.PLATFORM_MODE === "connected" &&
          env.PLATFORM_BASE_URL &&
          env.PLATFORM_SERVICE_TOKEN
            ? (subject) =>
                createPlatformBillingClient({
                  adminIdentity: {
                    issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
                    subject,
                  },
                  baseUrl: env.PLATFORM_BASE_URL as string,
                  serviceToken: env.PLATFORM_SERVICE_TOKEN as string,
                  timeoutMs: 5000,
                }).adminOverview?.({ limit: 1 }) ?? Promise.resolve(undefined)
            : undefined,
        readSettlement: () => billingRepository.getSettlementHealth?.(),
        webhookConfigured: Boolean(env.CHATNEST_ALERT_WEBHOOK_URL),
      }).snapshot,
      purgeAlertHistory: alertHistoryRepository.purge,
      recordAlertEvent: alertHistoryRepository.record,
    },
    // ---- P3 域门面(平台层只读/受控写)----
    // agent 基础设施门面(R3 豁免点):配置读取与技能发现是外部世界 IO,平台层经此进入
    agent: {
      discoverSkills: () => discoverSkills(),
      readConfig: () => readAgentConfig(),
    },
    billing: {
      replaySettlement: (id: string) =>
        replayDeadLetterSettlement(billingRepository, id),
      runSettlementWorker: () => {
        if (
          env.PLATFORM_MODE !== "connected" ||
          !env.PLATFORM_BASE_URL ||
          !env.PLATFORM_SERVICE_TOKEN
        ) {
          throw new Error("Connected billing platform is not configured");
        }
        const client = createPlatformBillingClient({
          baseUrl: env.PLATFORM_BASE_URL,
          serviceToken: env.PLATFORM_SERVICE_TOKEN,
        });
        return runSettlementWorkerOnce({
          client,
          leaseMs: (env.CHATNEST_SETTLEMENT_LEASE_SECONDS ?? 300) * 1000,
          limit: env.CHATNEST_SETTLEMENT_BATCH_SIZE,
          maxAttempts: env.CHATNEST_SETTLEMENT_MAX_ATTEMPTS,
          repository: billingRepository,
        });
      },
      settlementHealth: () => billingRepository.getSettlementHealth?.(),
    },
    // 共享浏览器会话门面(R3 豁免点):有状态基础设施,平台层经此进入
    browser: {
      closeSession: closeBrowserSession,
      getSession: getBrowserSession,
    },
    chats: {
      deleteAllByUserId: chats.deleteAllByUserId.bind(chats),
      findById: chats.findById.bind(chats),
      listByUser: chats.listByUser.bind(chats),
      updateTitle: chats.updateTitle.bind(chats),
      updateVisibility: chats.updateVisibility.bind(chats),
    },
    deleteChat: (input: { id: string; userId: string }) =>
      deleteChat(input, { chats }),
    documents: {
      deleteAfterTimestamp:
        documentRepository.deleteAfterTimestamp.bind(documentRepository),
      listById: documentRepository.listById.bind(documentRepository),
      listRecentByUser:
        documentRepository.listRecentByUser.bind(documentRepository),
      save: documentRepository.save.bind(documentRepository),
      saveResultTableView:
        documentRepository.saveResultTableView.bind(documentRepository),
      updateContent: documentRepository.updateContent.bind(documentRepository),
    },
    messages: {
      deleteByChatIdAfterTimestamp:
        messages.deleteByChatIdAfterTimestamp.bind(messages),
      findById: messages.findById.bind(messages),
      listByChatId: messages.listByChatId.bind(messages),
    },
    // 断线续流登记(stream_ids):平台层 Response 组装阶段调用,不经用例
    registerResumeStream: (chatId: string, streamId: string) =>
      chats.createStreamId(chatId, streamId),
    sendMessage: (input: SendMessageInput) =>
      sendMessage(input, {
        chats,
        messages,
        modelBillingFactory:
          env.PLATFORM_MODE === "connected"
            ? ({
                chatId,
                modelId,
                organizationId,
                runId,
                session,
                stepIndex,
                userId,
              }) => {
                const client =
                  env.PLATFORM_BASE_URL &&
                  env.PLATFORM_SERVICE_TOKEN &&
                  session.platform?.token
                    ? createPlatformBillingClient({
                        baseUrl: env.PLATFORM_BASE_URL,
                        serviceToken: env.PLATFORM_SERVICE_TOKEN,
                        userToken: session.platform.token,
                      })
                    : undefined;
                if (!client) {
                  return () => {
                    throw new Error(
                      "Connected model billing requires platform and user session"
                    );
                  };
                }
                return (model: unknown) =>
                  wrapModelWithBilling(model, {
                    chatId,
                    client,
                    modelId,
                    organizationId,
                    repository: billingRepository,
                    runId,
                    stepIndex,
                    userId,
                  });
              }
            : undefined,
        toolBillingFactory:
          env.PLATFORM_MODE === "connected"
            ? ({ chatId, organizationId, runId, session, userId }) => {
                const client =
                  env.PLATFORM_BASE_URL &&
                  env.PLATFORM_SERVICE_TOKEN &&
                  session.platform?.token
                    ? createPlatformBillingClient({
                        baseUrl: env.PLATFORM_BASE_URL,
                        serviceToken: env.PLATFORM_SERVICE_TOKEN,
                        userToken: session.platform.token,
                      })
                    : undefined;
                return createRequestToolBilling({
                  chatId,
                  client,
                  mode: "connected",
                  organizationId,
                  repository: billingRepository,
                  runId,
                  userId,
                });
              }
            : undefined,
      }),
    suggestions: {
      listByDocumentId:
        suggestionRepository.listByDocumentId.bind(suggestionRepository),
    },
    users: {
      create: userRepository.create.bind(userRepository),
      createGuest: userRepository.createGuest.bind(userRepository),
      findByEmail: userRepository.findByEmail.bind(userRepository),
      getSessionRevision:
        userRepository.getSessionRevision.bind(userRepository),
      revokeSessions: userRepository.revokeSessions.bind(userRepository),
    },
    votes: {
      listByChatId: voteRepository.listByChatId.bind(voteRepository),
      upsert: voteRepository.upsert.bind(voteRepository),
    },
  };
}

let cached: ReturnType<typeof buildUseCases> | undefined;

export function getUseCases() {
  if (!cached) {
    cached = buildUseCases();
  }
  return cached;
}

// Operational readiness uses the same policy as production initialization.
export { checkDatabaseReadiness } from "@/server/infrastructure/persistence/drizzle/runtime-role";
