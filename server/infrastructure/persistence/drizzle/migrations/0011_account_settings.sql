CREATE TABLE "account_deletion_requests" (
	"cancelled_at" timestamp,
	"completed_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar DEFAULT 'requested' NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "account_deletion_requests_status" CHECK ("account_deletion_requests"."status" in ('requested','cancelled','completed'))
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"default_model_id" text,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "user_preferences_revision" CHECK ("user_preferences"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_deletion_requests_user_status_idx" ON "account_deletion_requests" USING btree ("user_id","status");
--> statement-breakpoint
COMMENT ON TABLE "user_preferences" IS '个人偏好表:保存用户级通知和默认模型选择,不混入平台工作区配置';
--> statement-breakpoint
COMMENT ON COLUMN "user_preferences"."created_at" IS '偏好创建时间';
--> statement-breakpoint
COMMENT ON COLUMN "user_preferences"."default_model_id" IS '默认模型标识;为空时使用部署默认模型';
--> statement-breakpoint
COMMENT ON COLUMN "user_preferences"."email_notifications" IS '是否接收产品通知邮件';
--> statement-breakpoint
COMMENT ON COLUMN "user_preferences"."revision" IS '偏好修订号;更新接口用来防止旧表单覆盖新设置';
--> statement-breakpoint
COMMENT ON COLUMN "user_preferences"."updated_at" IS '偏好最近更新时间';
--> statement-breakpoint
COMMENT ON COLUMN "user_preferences"."user_id" IS '所属用户,也是偏好聚合主键';
--> statement-breakpoint
COMMENT ON CONSTRAINT "user_preferences_revision" ON "user_preferences" IS '修订号必须为正整数';
--> statement-breakpoint
COMMENT ON TABLE "account_deletion_requests" IS '账号删除申请表:记录用户申请和撤回事实,不直接删除账务与审计数据';
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."cancelled_at" IS '撤回时间';
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."completed_at" IS '管理员完成处理时间';
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."id" IS '申请唯一标识';
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."reason" IS '申请原因,可为空,不保存额外敏感资料';
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."requested_at" IS '提交时间';
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."status" IS '申请状态: requested/cancelled/completed';
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."user_id" IS '所属用户';
--> statement-breakpoint
COMMENT ON INDEX "account_deletion_requests_user_status_idx" IS '用户状态查询索引';
--> statement-breakpoint
COMMENT ON CONSTRAINT "account_deletion_requests_pkey" ON "account_deletion_requests" IS '主键约束:删除申请标识唯一';
--> statement-breakpoint
COMMENT ON CONSTRAINT "account_deletion_requests_user_id_users_id_fk" ON "account_deletion_requests" IS '属主外键:申请必须归属既有用户,账号删除时级联清理';
--> statement-breakpoint
COMMENT ON CONSTRAINT "account_deletion_requests_status" ON "account_deletion_requests" IS '申请状态只允许 requested/cancelled/completed';
--> statement-breakpoint
COMMENT ON CONSTRAINT "user_preferences_pkey" ON "user_preferences" IS '主键约束:每个用户只有一份个人偏好';
--> statement-breakpoint
COMMENT ON CONSTRAINT "user_preferences_user_id_users_id_fk" ON "user_preferences" IS '属主外键:偏好必须归属既有用户,账号删除时级联清理';
