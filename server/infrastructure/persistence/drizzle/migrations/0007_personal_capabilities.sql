CREATE TABLE "capability_settings" (
  "user_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "encrypted" text NOT NULL,
  "revision" integer NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "capability_settings_pk" PRIMARY KEY ("user_id", "kind"),
  CONSTRAINT "capability_settings_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "capability_settings_kind" CHECK ("kind" IN ('mcp', 'skills')),
  CONSTRAINT "capability_settings_revision" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "chat_capability_scopes" (
  "chat_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "selection" json NOT NULL,
  "grants" json NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chat_capability_scopes_pk" PRIMARY KEY ("chat_id"),
  CONSTRAINT "chat_capability_scopes_chat_fk" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE,
  CONSTRAINT "chat_capability_scopes_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "chat_capability_scopes_revision" CHECK ("revision" > 0)
);
--> statement-breakpoint
COMMENT ON TABLE "capability_settings" IS '个人能力配置表：按账号及种类隔离保存加密连接或技能';
COMMENT ON COLUMN "capability_settings"."user_id" IS '配置属主账号，仅服务端会话身份可访问';
COMMENT ON COLUMN "capability_settings"."kind" IS '配置种类：mcp 连接或 skills 个人技能';
COMMENT ON COLUMN "capability_settings"."encrypted" IS '绑定属主、种类及修订的 AES-GCM 密文';
COMMENT ON COLUMN "capability_settings"."revision" IS '单调递增修订，删除能力也保留配置行以防旧授权复活';
COMMENT ON COLUMN "capability_settings"."updated_at" IS '最近修改时间';
COMMENT ON CONSTRAINT "capability_settings_pk" ON "capability_settings" IS '联合主键：每个账号每种配置仅一行';
COMMENT ON INDEX "capability_settings_pk" IS '联合主键索引：按属主及配置种类定位个人密文';
COMMENT ON CONSTRAINT "capability_settings_user_fk" ON "capability_settings" IS '属主外键：账号删除时移除个人密文';
COMMENT ON CONSTRAINT "capability_settings_kind" ON "capability_settings" IS '种类约束：仅允许 mcp 与 skills 聚合';
COMMENT ON CONSTRAINT "capability_settings_revision" ON "capability_settings" IS '修订约束：持久修订必须为正整数';
COMMENT ON TABLE "chat_capability_scopes" IS '会话能力范围：保存本轮选择及授权指纹，审批续跑不得扩大';
COMMENT ON COLUMN "chat_capability_scopes"."chat_id" IS '所属会话，也是范围表主键';
COMMENT ON COLUMN "chat_capability_scopes"."user_id" IS '会话属主，仓储事务核实 chats.user_id';
COMMENT ON COLUMN "chat_capability_scopes"."revision" IS '当前范围修订，新用户轮次绑定后递增';
COMMENT ON COLUMN "chat_capability_scopes"."selection" IS '无凭据的连接与技能稳定标识选择';
COMMENT ON COLUMN "chat_capability_scopes"."grants" IS '已选择能力的授权指纹，不包含凭据明文';
COMMENT ON COLUMN "chat_capability_scopes"."updated_at" IS '最近绑定本轮范围的时间';
COMMENT ON CONSTRAINT "chat_capability_scopes_pk" ON "chat_capability_scopes" IS '主键：每个会话最多一份当前范围';
COMMENT ON INDEX "chat_capability_scopes_pk" IS '主键索引：按会话定位当前能力范围';
COMMENT ON CONSTRAINT "chat_capability_scopes_chat_fk" ON "chat_capability_scopes" IS '会话外键：会话删除时清理范围';
COMMENT ON CONSTRAINT "chat_capability_scopes_user_fk" ON "chat_capability_scopes" IS '属主外键：账号删除时清理范围';
COMMENT ON CONSTRAINT "chat_capability_scopes_revision" ON "chat_capability_scopes" IS '修订约束：范围修订必须为正整数';
