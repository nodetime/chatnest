CREATE TABLE "external_identities" (
  "platform_id" text NOT NULL,
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "external_identities_pk" PRIMARY KEY("platform_id", "issuer", "subject"),
  CONSTRAINT "external_identities_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "external_identities_user_idx" ON "external_identities" USING btree ("user_id");
--> statement-breakpoint
COMMENT ON TABLE "external_identities" IS '外部平台主体到 ChatNest 本地 actor 的稳定身份映射';
COMMENT ON COLUMN "external_identities"."platform_id" IS '外部平台实例标识';
COMMENT ON COLUMN "external_identities"."issuer" IS '外部身份签发方';
COMMENT ON COLUMN "external_identities"."subject" IS '外部身份主体';
COMMENT ON COLUMN "external_identities"."user_id" IS 'ChatNest 本地用户外键';
COMMENT ON COLUMN "external_identities"."created_at" IS '映射创建时间';
COMMENT ON COLUMN "external_identities"."updated_at" IS '映射最近确认时间';
COMMENT ON INDEX "external_identities_user_idx" IS '按本地用户查询外部身份';
--> statement-breakpoint
CREATE TABLE "execution_operations" (
  "operation_id" text PRIMARY KEY NOT NULL,
  "attempt_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "chat_id" uuid NOT NULL,
  "run_id" text,
  "canonical_tool_key" text NOT NULL,
  "subject_type" text NOT NULL,
  "state" text NOT NULL,
  "price_version" text,
  "reserved_points" text,
  "dispatch_evidence" text,
  "receipt" json,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "execution_operations_attempt_nonempty" CHECK ("attempt_id" <> ''),
  CONSTRAINT "execution_operations_state" CHECK ("state" in ('ready','sending','sent','settled','failed','reconcile_pending')),
  CONSTRAINT "execution_operations_subject_type" CHECK ("subject_type" in ('model','tool')),
  CONSTRAINT "execution_operations_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "execution_operations_chat_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "execution_operations_user_idx" ON "execution_operations" USING btree ("user_id", "created_at");
CREATE INDEX "execution_operations_attempt_idx" ON "execution_operations" USING btree ("attempt_id");
--> statement-breakpoint
COMMENT ON TABLE "execution_operations" IS '模型或工具执行 operation 与单次 attempt 的本地可靠性状态';
COMMENT ON COLUMN "execution_operations"."operation_id" IS '平台 operation 唯一标识';
COMMENT ON COLUMN "execution_operations"."attempt_id" IS '一次真实出站 attempt 唯一标识';
COMMENT ON COLUMN "execution_operations"."user_id" IS '本地用户属主外键';
COMMENT ON COLUMN "execution_operations"."chat_id" IS '所属聊天外键';
COMMENT ON COLUMN "execution_operations"."run_id" IS 'Agent run 标识';
COMMENT ON COLUMN "execution_operations"."canonical_tool_key" IS 'provider/platform/api canonical 工具身份';
COMMENT ON COLUMN "execution_operations"."subject_type" IS '账务主体类型 model 或 tool';
COMMENT ON COLUMN "execution_operations"."state" IS '本地执行状态';
COMMENT ON COLUMN "execution_operations"."price_version" IS '平台价格版本快照';
COMMENT ON COLUMN "execution_operations"."reserved_points" IS '平台预留积分十进制字符串';
COMMENT ON COLUMN "execution_operations"."dispatch_evidence" IS 'Porta 出站证据状态';
COMMENT ON COLUMN "execution_operations"."receipt" IS 'Porta receipt 不可变 JSON 快照';
COMMENT ON COLUMN "execution_operations"."created_at" IS 'operation 创建时间';
COMMENT ON COLUMN "execution_operations"."updated_at" IS 'operation 最近更新时间';
COMMENT ON INDEX "execution_operations_user_idx" IS '按用户和时间查询执行操作';
COMMENT ON INDEX "execution_operations_attempt_idx" IS '按 attempt 恢复执行状态';
--> statement-breakpoint
CREATE TABLE "execution_receipts" (
  "receipt_id" text PRIMARY KEY NOT NULL,
  "operation_id" text NOT NULL,
  "attempt_id" text NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "payload" json NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "execution_receipts_revision" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE INDEX "execution_receipts_attempt_idx" ON "execution_receipts" USING btree ("attempt_id");
--> statement-breakpoint
COMMENT ON TABLE "execution_receipts" IS '不依赖消息 parts 的不可变执行收据';
COMMENT ON COLUMN "execution_receipts"."receipt_id" IS 'receipt 唯一标识';
COMMENT ON COLUMN "execution_receipts"."operation_id" IS '对应 operation';
COMMENT ON COLUMN "execution_receipts"."attempt_id" IS '对应 attempt';
COMMENT ON COLUMN "execution_receipts"."revision" IS 'receipt 修订号';
COMMENT ON COLUMN "execution_receipts"."payload" IS '签名 receipt JSON 快照';
COMMENT ON COLUMN "execution_receipts"."created_at" IS 'receipt 保存时间';
COMMENT ON INDEX "execution_receipts_attempt_idx" IS '按 attempt 查询 receipt';
--> statement-breakpoint
CREATE TABLE "settlement_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "operation_id" text NOT NULL,
  "command" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "payload" json NOT NULL,
  "state" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "settlement_outbox_command" CHECK ("command" in ('report','cancel','reconcile')),
  CONSTRAINT "settlement_outbox_state" CHECK ("state" in ('pending','processing','succeeded','failed'))
);
--> statement-breakpoint
CREATE INDEX "settlement_outbox_idempotency_idx" ON "settlement_outbox" USING btree ("idempotency_key");
--> statement-breakpoint
COMMENT ON TABLE "settlement_outbox" IS '平台结算命令恢复队列，不重放供应商调用';
COMMENT ON COLUMN "settlement_outbox"."id" IS 'outbox 行唯一标识';
COMMENT ON COLUMN "settlement_outbox"."operation_id" IS '对应 operation';
COMMENT ON COLUMN "settlement_outbox"."command" IS 'report、cancel 或 reconcile 命令';
COMMENT ON COLUMN "settlement_outbox"."idempotency_key" IS '平台账务幂等键';
COMMENT ON COLUMN "settlement_outbox"."payload" IS '不含凭据和原始响应正文的命令 JSON';
COMMENT ON COLUMN "settlement_outbox"."state" IS 'outbox 状态';
COMMENT ON COLUMN "settlement_outbox"."attempts" IS '已尝试次数';
COMMENT ON COLUMN "settlement_outbox"."next_attempt_at" IS '下次恢复时间';
COMMENT ON COLUMN "settlement_outbox"."created_at" IS '命令创建时间';
COMMENT ON COLUMN "settlement_outbox"."updated_at" IS '命令最近更新时间';
COMMENT ON INDEX "settlement_outbox_idempotency_idx" IS '按幂等键查找结算命令';
