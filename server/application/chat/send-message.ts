import {
  convertToModelMessages,
  createUIMessageStream,
  isStepCount,
  streamText,
  type ToolSet,
  toUIMessageStream,
} from "ai";
import matter from "gray-matter";
import {
  getModelConnection,
  getRuntimeModels,
  resolveModelId,
} from "@/server/application/ai/model-connection";
import {
  getCapabilities,
  getModelAvailability,
} from "@/server/application/ai/model-service";
import {
  completionStepSettings,
  systemPrompt,
} from "@/server/application/ai/prompts";
import { getLanguageModel } from "@/server/application/ai/providers";
import {
  createTaskCapabilityService,
  readUserCatalog,
} from "@/server/application/capability/runtime";
import { agentInteractionTools } from "@/server/application/chat/tools/agent-interactions";
import { createDocument } from "@/server/application/chat/tools/create-document";
import { createResultTable } from "@/server/application/chat/tools/create-result-table";
import { editDocument } from "@/server/application/chat/tools/edit-document";
import { executeCodeTool } from "@/server/application/chat/tools/execute-code";
import { readAttachmentTool } from "@/server/application/chat/tools/read-attachment";
import { requestSuggestions } from "@/server/application/chat/tools/request-suggestions";
import { updateDocument } from "@/server/application/chat/tools/update-document";
import { createImageViewer } from "@/server/application/chat/tools/view-image";
import { SettingsError } from "@/server/application/mcp/security";
import { prepareAttachmentContext } from "@/server/application/uploads/context";
import {
  commitUserMessage,
  readAssetForContext,
  readAttachmentAsset,
} from "@/server/application/uploads/service";
import { AttachmentRoundBudget } from "@/server/domain/attachment/document-budget";
import {
  hasCurrentCapabilityScope,
  historicalSkillNames,
  projectLoadedSkillResultsForModel,
  projectSkillContextForModel,
} from "@/server/domain/capability/projection";
import type { CapabilitySelection } from "@/server/domain/capability/schema";
import type { ChatRepository } from "@/server/domain/chat/repository";
import { canAccessChat } from "@/server/domain/chat/types";
import {
  hasPendingInteraction,
  storedAskUserOutputs,
} from "@/server/domain/message/agent-interactions";
import { convertToUIMessages } from "@/server/domain/message/convert";
import { generateUUID } from "@/server/domain/message/ids";
import {
  prepareMessageEdit,
  prepareRegeneration,
  projectSettledToolHistory,
} from "@/server/domain/message/message-turn";
import { agentStreamErrorText } from "@/server/domain/message/porta-error";
import type {
  MessageRepository,
  StoredMessage,
} from "@/server/domain/message/repository";
import {
  boundedMcpHistory,
  historyProjectionTools,
  projectMcpModelMessages,
  ResultEvidenceLedger,
  restoreResultEvidence,
} from "@/server/domain/message/result-evidence";
import {
  createRunFailureReporter,
  hasRunFailure,
} from "@/server/domain/message/run-failure";
import type {
  ChatMessage,
  WaitingStatusData,
} from "@/server/domain/message/types";
import { entitlementsByUserType } from "@/server/domain/user/entitlements";
import type { ChatSession } from "@/server/domain/user/types";
import { createBrowserTools } from "@/server/infrastructure/browser/browser-tools";
import { createAgentRuntime } from "@/server/infrastructure/mcp/runtime";
import { readSkillFile } from "@/server/infrastructure/mcp/skills";
import { ChatbotError } from "@/server/shared/errors";
import { checkIpRateLimit } from "@/server/shared/ratelimit";
import {
  isProductionEnvironment,
  isTestEnvironment,
} from "@/server/shared/runtime";
import { metadataOnlyTelemetry } from "@/server/shared/telemetry";
import { generateTitleFromUserMessage } from "./generate-title";
import type { wrapModelWithBilling } from "./model-billing";

// 发送消息用例(P2 从 app/(chat)/api/chat/route.ts 的 postWithModelSettings 整体迁入)
// 边界约定:输入为平台层已解析的请求体 + 会话用户;输出 UIMessageStream,不产 HTTP Response;
// 业务失败一律抛 ChatbotError,由平台层统一映射。逻辑与迁移前保持一致,仅替换:
// session->input.user、queries->仓储、Response 返回->异常抛出、@/app 类型->domain 类型。

export type SendMessageBody = {
  id: string;
  message?: { id: string; role: string; parts: unknown[] };
  messages?: { id: string; role: string; parts: unknown[] }[];
  searchMode: "auto" | "web";
  capabilitySelection?: CapabilitySelection;
  selectedChatModel: string;
  selectedVisibilityType: "public" | "private";
  trigger: "submit-message" | "regenerate-message" | "edit-message";
};

export type SendMessageInput = {
  body: SendMessageBody;
  // 平台层已鉴权的会话视图:业务只消费 user,expires 为工具侧 Session 结构兼容保留
  session: ChatSession;
  organizationId?: string;
  ip?: string;
  signal: AbortSignal;
};

export type SendMessageDeps = {
  chats: ChatRepository;
  messages: MessageRepository;
  toolBilling?: (input: {
    args: unknown;
    canonicalToolKey: string;
    chatId: string;
    next: () => Promise<unknown>;
    toolCallId: string;
    userId: string;
  }) => Promise<unknown>;
  toolBillingFactory?: (input: {
    chatId: string;
    organizationId?: string;
    runId: string;
    session: ChatSession;
    userId: string;
  }) =>
    | ((call: {
        args: unknown;
        canonicalToolKey: string;
        next: () => Promise<unknown>;
        toolCallId: string;
      }) => Promise<unknown>)
    | undefined;
  modelBillingFactory?: (input: {
    chatId: string;
    modelId: string;
    organizationId?: string;
    runId: string;
    session: ChatSession;
    stepIndex: () => number;
    userId: string;
  }) =>
    | ((model: unknown) => ReturnType<typeof wrapModelWithBilling>)
    | undefined;
};

const HEALTH_CHECK_DELAY_MS = 9000;

function isModelStreamActivity(chunk: { type: string }) {
  return !["start", "start-step", "finish-step", "finish", "raw"].includes(
    chunk.type
  );
}

export async function sendMessage(
  input: SendMessageInput,
  deps: SendMessageDeps
) {
  const { session } = input;
  const { user } = session;
  const { chats, messages: messageRepo } = deps;
  const {
    id,
    message,
    messages,
    selectedChatModel,
    selectedVisibilityType,
    trigger,
    searchMode,
  } = input.body;

  if (!isTestEnvironment && !getModelConnection().configured) {
    throw new ChatbotError("offline:configuration");
  }

  const chatModel = resolveModelId(selectedChatModel);

  await checkIpRateLimit(input.ip);

  const messageCount = await messageRepo.countByUserSince(user.id, 1);

  if (messageCount > entitlementsByUserType[user.type].maxMessagesPerHour) {
    throw new ChatbotError("rate_limit:chat");
  }

  const isToolApprovalFlow = Boolean(messages);
  const isRegeneration = trigger === "regenerate-message";
  const isEdit = trigger === "edit-message";
  if ((isRegeneration || isEdit) && (!message || isToolApprovalFlow)) {
    throw new ChatbotError("bad_request:api");
  }

  const chat = await chats.findById(id);
  let messagesFromDb: StoredMessage[] = [];
  let titlePromise: Promise<string> | null = null;

  if (chat) {
    if (!canAccessChat(chat, user.id)) {
      throw new ChatbotError("forbidden:chat");
    }
    messagesFromDb = await messageRepo.listByChatId(id);
  } else if (isRegeneration || isEdit) {
    throw new ChatbotError("bad_request:api");
  }

  let uiMessages: ChatMessage[];
  const isAskContinuation = isToolApprovalFlow;
  const regeneration = isRegeneration
    ? prepareRegeneration(
        convertToUIMessages(messagesFromDb),
        message?.id ?? ""
      )
    : null;
  if (isRegeneration && !regeneration) {
    throw new ChatbotError("bad_request:api");
  }

  const edit =
    isEdit && message
      ? prepareMessageEdit(
          convertToUIMessages(messagesFromDb),
          message.id,
          message.parts
            .filter((part) => (part as { type: string }).type === "text")
            .map((part) => (part as { text: string }).text)
            .join("")
        )
      : null;
  if (isEdit && !edit) {
    throw new ChatbotError("bad_request:api");
  }
  if (edit) {
    uiMessages = edit.context;
  } else if (regeneration) {
    uiMessages = regeneration.context;
  } else if (isAskContinuation && messages) {
    const committed = await messageRepo.mergeInteractionResponses({
      chatId: id,
      responses: messages as ChatMessage[],
      userId: user.id,
    });
    messagesFromDb = committed.messages;
    uiMessages = convertToUIMessages(committed.messages);
    if (!committed.changed || hasPendingInteraction(uiMessages)) {
      // 部分表单答案也立即持久化。等待其它回答/审批或重复提交时不再调用模型。
      return createUIMessageStream<ChatMessage>({
        execute: ({ writer }) => {
          for (const chunk of storedAskUserOutputs(uiMessages)) {
            writer.write(chunk);
          }
          writer.write({ finishReason: "tool-calls", type: "finish" });
        },
        originalMessages: uiMessages,
      });
    }
  } else {
    uiMessages = [
      ...convertToUIMessages(messagesFromDb),
      message as ChatMessage,
    ];
  }

  const modelConfig = getRuntimeModels().find((m) => m.id === chatModel);
  const modelCapabilities = await getCapabilities();
  const capabilities = modelCapabilities[chatModel];
  const isReasoningModel = capabilities?.reasoning === true;
  const supportsTools = capabilities?.tools === true;
  const attachmentBudget = new AttachmentRoundBudget();
  const resolvedAttachmentContext = await prepareAttachmentContext(
    uiMessages,
    capabilities?.vision === true,
    (assetId) => readAssetForContext(assetId, user.id, id),
    supportsTools,
    attachmentBudget
  );
  const taskCapabilities = await createTaskCapabilityService({
    chatId: id,
    load: () => readUserCatalog(user),
    userId: user.id,
  }).prepare(input.body.capabilitySelection, isToolApprovalFlow, async () => {
    if (message?.role === "user" && !isRegeneration && !isEdit) {
      await commitUserMessage({
        chatId: id,
        message: {
          attachments: [],
          chatId: id,
          createdAt: new Date(),
          id: message.id,
          parts: message.parts,
          role: "user",
        },
        ownerId: user.id,
        visibility: selectedVisibilityType,
      });
    }
  });
  if (
    isToolApprovalFlow &&
    !hasCurrentCapabilityScope(uiMessages, taskCapabilities.snapshot.revision)
  ) {
    throw new SettingsError(
      409,
      "此审批不属于当前任务范围，请发送新消息重新确认能力。"
    );
  }
  const evidenceLedger = new ResultEvidenceLedger();
  const contextIds = new Set(uiMessages.map((item) => item.id));
  const evidenceHistory = messagesFromDb.filter((item) =>
    contextIds.has(item.id)
  );
  restoreResultEvidence(evidenceLedger, evidenceHistory);
  const historyTools = historyProjectionTools(evidenceLedger, evidenceHistory);
  const imageViewer = createImageViewer(evidenceLedger, input.signal);
  const usedSkillNames = supportsTools
    ? historicalSkillNames(resolvedAttachmentContext)
    : new Set<string>();
  const currentSkillInstructions = new Map(
    await Promise.all(
      taskCapabilities.skills
        .filter((skill) => usedSkillNames.has(skill.name))
        .map(async (skill) => {
          await taskCapabilities.assertCurrent(
            `skill:${skill.id ?? `builtin:${skill.name}`}`
          );
          return [
            skill.name,
            matter(await readSkillFile(skill, "SKILL.md")).content,
          ] as const;
        })
    )
  );
  const skillContext = projectSkillContextForModel(
    resolvedAttachmentContext,
    currentSkillInstructions
  );
  const attachmentContext = boundedMcpHistory(
    skillContext.messages,
    historyTools,
    evidenceLedger
  );
  const modelHistory = projectSettledToolHistory(
    attachmentContext,
    isToolApprovalFlow ? uiMessages.at(-1)?.id : undefined
  );
  const modelMessages = await convertToModelMessages(modelHistory, {
    ignoreIncompleteToolCalls: true,
    tools: { ...historyTools, viewImage: imageViewer.tool },
  });
  if (!chat && message?.role === "user" && !isRegeneration && !isEdit) {
    titlePromise = generateTitleFromUserMessage({
      message: message as ChatMessage,
    }).catch(() => "New chat");
  }

  const runFailure = createRunFailureReporter();
  const requestToolBilling = deps.toolBillingFactory?.({
    chatId: id,
    organizationId: input.organizationId,
    runId: message?.id ?? id,
    session,
    userId: user.id,
  });
  const requestModelBilling = deps.modelBillingFactory?.({
    chatId: id,
    modelId: chatModel,
    organizationId: input.organizationId,
    runId: message?.id ?? id,
    session,
    stepIndex: (() => {
      let value = 0;
      return () => {
        const current = value;
        value += 1;
        return current;
      };
    })(),
    userId: user.id,
  });
  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer: dataStream }) => {
      dataStream.write({
        data: { revision: taskCapabilities.snapshot.revision },
        id: "capability-scope",
        type: "data-capability-scope",
      });
      if (isAskContinuation) {
        for (const chunk of storedAskUserOutputs(uiMessages)) {
          dataStream.write(chunk);
        }
      }
      // Approval continuation extends the same assistant: update only our status part.
      const previous = uiMessages.at(-1);
      if (isToolApprovalFlow && previous && hasRunFailure(previous)) {
        dataStream.write({
          data: { state: "resumed" },
          id: "run-status",
          type: "data-run-status",
        });
      }
      const modelName = modelConfig?.name ?? chatModel;
      let hasModelActivity = false;
      let healthCheckTimer: ReturnType<typeof setTimeout> | undefined;

      const clearHealthCheckTimer = () => {
        if (healthCheckTimer) {
          clearTimeout(healthCheckTimer);
        }
      };

      const writeWaitingStatus = (
        phase: WaitingStatusData["phase"],
        messageText: string
      ) => {
        if (hasModelActivity && phase !== "thinking") {
          return;
        }
        dataStream.write({
          data: {
            message: messageText,
            modelId: chatModel,
            modelName,
            phase,
          },
          transient: true,
          type: "data-waiting-status",
        });
      };

      writeWaitingStatus("waiting", "正在连接模型…");

      healthCheckTimer = setTimeout(() => {
        getModelAvailability(chatModel)
          .then((availability) => {
            if (availability === "impacted") {
              writeWaitingStatus(
                "health",
                `${modelName} 当前可能响应较慢或暂不可用…`
              );
            } else {
              writeWaitingStatus("still-waiting", "仍在等待模型响应…");
            }
          })
          .catch(() => {
            writeWaitingStatus("still-waiting", "仍在等待模型响应…");
          });
      }, HEALTH_CHECK_DELAY_MS);

      const markModelActive = () => {
        if (hasModelActivity) {
          return;
        }
        hasModelActivity = true;
        clearHealthCheckTimer();
        writeWaitingStatus("thinking", "正在分析…");
      };

      const stopWaitingStatus = () => {
        hasModelActivity = true;
        clearHealthCheckTimer();
      };

      let runtime: Awaited<ReturnType<typeof createAgentRuntime>> | undefined;
      try {
        runtime = await createAgentRuntime(
          input.signal,
          undefined,
          async () => taskCapabilities.config,
          {
            authorizeSkill: (skill) =>
              taskCapabilities.assertCurrent(
                `skill:${skill.id ?? `builtin:${skill.name}`}`
              ),
            authorizeTool: (server) =>
              taskCapabilities.assertCurrent(
                `server:${server.capabilityId ?? server.id}`
              ),
            billToolCall:
              requestToolBilling ??
              (deps.toolBilling
                ? ({ args, canonicalToolKey, next, toolCallId }) =>
                    deps.toolBilling?.({
                      args,
                      canonicalToolKey,
                      chatId: id,
                      next,
                      toolCallId,
                      userId: user.id,
                    }) ?? next()
                : undefined),
            ledger: evidenceLedger,
            onSkillLoaded: (name, body) => {
              currentSkillInstructions.set(name, body);
            },
            onSource: (source) =>
              dataStream.write({ data: source, type: "data-mcp-source" }),
            skills: taskCapabilities.skills,
          }
        );
        if (supportsTools) {
          try {
            Object.assign(
              runtime.tools,
              await createBrowserTools(user.id, id, runtime.signal)
            );
          } catch {
            /* Keep chat and existing tools usable if the local browser cannot start. */
          }
        }
        const tools: ToolSet = {
          ...agentInteractionTools(),
          executeCode: executeCodeTool(runtime.signal),
          ...(capabilities?.vision === true
            ? { viewImage: imageViewer.tool }
            : {}),
          createResultTable: createResultTable({
            chatId: id,
            dataStream,
            ledger: evidenceLedger,
            session,
          }),
          readAttachment: readAttachmentTool(
            (assetId) => readAttachmentAsset(assetId, user.id, id),
            attachmentBudget
          ),
          ...runtime.tools,
          createDocument: createDocument({
            dataStream,
            session,
          }),
          editDocument: editDocument({ dataStream, session }),
          requestSuggestions: requestSuggestions({
            dataStream,
            modelId: chatModel,
            session,
          }),
          updateDocument: updateDocument({
            dataStream,
            modelId: chatModel,
            session,
          }),
        };
        const instructions = [
          systemPrompt({ supportsTools }),
          supportsTools
            ? runtime.instructions
            : "No tools are available to this model for this turn.",
          searchMode === "web"
            ? "The user selected web search for this turn. Use the available tools; explain any unavailable capability."
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        const { maxSteps } = runtime.config;
        const reachedStepLimit = isStepCount(maxSteps);
        const result = streamText({
          abortSignal: runtime.signal,
          activeTools: supportsTools ? Object.keys(tools) : [],
          instructions,
          maxOutputTokens: runtime.config.maxOutputTokens,
          // A retry re-enters billing middleware and opens another reservation.
          // Let the existing reconciliation own a charged attempt with unknown outcome.
          maxRetries: requestModelBilling ? 0 : undefined,
          messages: modelMessages,
          model: (() => {
            const baseModel = getLanguageModel(chatModel);
            return requestModelBilling
              ? requestModelBilling(baseModel)
              : baseModel;
          })(),
          onAbort() {
            // A runtime/model deadline is a failed request, not an explicit user stop.
            if (!input.signal.aborted) {
              runFailure.report((part) => dataStream.write(part));
            }
            stopWaitingStatus();
          },
          onChunk({ chunk }) {
            if (isModelStreamActivity(chunk)) {
              markModelActive();
            }
          },
          onEnd() {
            stopWaitingStatus();
          },
          onError() {
            if (!input.signal.aborted) {
              runFailure.report((part) => dataStream.write(part));
            }
            stopWaitingStatus();
          },
          prepareStep: ({ messages: stepMessages, stepNumber }) => {
            const currentInstructions = [
              instructions,
              supportsTools
                ? projectSkillContextForModel([], currentSkillInstructions)
                    .instructions
                : "",
            ]
              .filter(Boolean)
              .join("\n\n");
            return {
              instructions: currentInstructions,
              ...(supportsTools
                ? completionStepSettings(
                    stepNumber,
                    maxSteps,
                    currentInstructions
                  )
                : {}),
              messages: imageViewer.projectMessages(
                projectMcpModelMessages(
                  projectLoadedSkillResultsForModel(
                    stepMessages,
                    currentSkillInstructions
                  ),
                  evidenceLedger
                )
              ),
            };
          },
          providerOptions: {
            ...(modelConfig?.gatewayOrder && {
              gateway: { order: modelConfig.gatewayOrder },
            }),
            ...(modelConfig?.reasoningEffort && {
              openai: { reasoningEffort: modelConfig.reasoningEffort },
            }),
          },
          stopWhen: async (context) => {
            const reached = await reachedStepLimit(context);
            if (reached && !input.signal.aborted) {
              runFailure.report((part) => dataStream.write(part));
            }
            return reached;
          },
          telemetry: {
            ...metadataOnlyTelemetry,
            functionId: "stream-text",
            isEnabled: isProductionEnvironment,
          },
          timeout: {
            toolMs: runtime.config.toolTimeoutMs,
            totalMs: runtime.config.timeoutMs,
          },
          tools,
        });

        dataStream.merge(
          toUIMessageStream({
            onError: agentStreamErrorText,
            sendReasoning: isReasoningModel,
            sendSources: true,
            stream: result.stream,
          })
        );
        await result.text;
      } catch (error) {
        if (!input.signal.aborted) {
          runFailure.report((part) => dataStream.write(part));
        }
        throw error;
      } finally {
        stopWaitingStatus();
        await runtime?.close();
      }

      if (titlePromise) {
        try {
          const title = await titlePromise;
          dataStream.write({ data: title, type: "data-chat-title" });
          chats.updateTitle(id, title);
        } catch {
          /* non-fatal */
        }
      }
    },
    generateId: () => regeneration?.answerId ?? generateUUID(),
    onEnd: async ({
      messages: finishedMessages,
      responseMessage,
      isAborted,
      finishReason,
    }) => {
      if (edit) {
        if (
          runFailure.failed ||
          isAborted ||
          input.signal.aborted ||
          !finishReason ||
          finishReason === "error" ||
          !responseMessage.parts.length
        ) {
          return;
        }
        await messageRepo.replaceEditedTurn({
          answer: {
            attachments: [],
            chatId: id,
            createdAt: new Date(),
            id: responseMessage.id,
            parts: responseMessage.parts,
            role: "assistant",
          },
          chatId: id,
          edited: edit.edited,
          snapshot: messagesFromDb,
          userId: user.id,
        });
      } else if (regeneration) {
        if (
          runFailure.failed ||
          isAborted ||
          input.signal.aborted ||
          !finishReason ||
          finishReason === "error" ||
          !responseMessage.parts.length
        ) {
          return;
        }
        await messageRepo.replaceRegeneratedAnswer({
          answer: {
            attachments: [],
            chatId: id,
            createdAt: new Date(),
            id: responseMessage.id,
            parts: responseMessage.parts,
            role: "assistant",
          },
          chatId: id,
          snapshot: messagesFromDb,
          userId: user.id,
        });
      } else if (isAskContinuation) {
        await messageRepo.updateContinuationParts({
          chatId: id,
          response: responseMessage,
          snapshot: messagesFromDb,
          userId: user.id,
        });
      } else if (finishedMessages.length > 0) {
        await messageRepo.saveMany(
          finishedMessages.map((currentMessage) => ({
            attachments: [],
            chatId: id,
            createdAt: new Date(),
            id: currentMessage.id,
            parts: currentMessage.parts,
            role: currentMessage.role,
          }))
        );
      }
    },
    onError: (error) => {
      if (
        error instanceof Error &&
        error.message?.includes(
          "AI Gateway requires a valid credit card on file to service requests"
        )
      ) {
        return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
      }
      return "本轮执行未完成。请检查模型或工具连接后重试；不要把未完成的结果当作结论。";
    },
    originalMessages: isToolApprovalFlow ? uiMessages : undefined,
  });

  return stream;
}
