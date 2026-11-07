ALTER TABLE "users" ADD COLUMN "session_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_session_revision" CHECK ("users"."session_revision" > 0);--> statement-breakpoint
COMMENT ON COLUMN "users"."session_revision" IS '认证会话修订号:递增后所有旧 JWT 失效';--> statement-breakpoint
COMMENT ON CONSTRAINT "users_session_revision" ON "users" IS '会话修订号必须为正整数';
