ALTER TABLE "account_deletion_requests" ADD COLUMN "retention_purged_at" timestamp;
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."retention_purged_at" IS '保留期限到达后完成个人内容清理的时间';
