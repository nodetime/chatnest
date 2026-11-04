ALTER TABLE "account_deletion_requests" ADD COLUMN "tombstone_id" text;
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD COLUMN "retention_until" timestamp;
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD COLUMN "remote_deactivation_error" text;
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD COLUMN "remote_deactivation_request_id" text;
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD COLUMN "remote_deactivation_status" varchar DEFAULT 'not_required' NOT NULL;
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD COLUMN "notification_status" varchar DEFAULT 'not_configured' NOT NULL;
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_remote_status" CHECK ("account_deletion_requests"."remote_deactivation_status" in ('not_required','pending','completed','failed'));
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_notification_status" CHECK ("account_deletion_requests"."notification_status" in ('not_configured','pending','sent'));
--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_requests_tombstone_idx" ON "account_deletion_requests" USING btree ("tombstone_id");
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."tombstone_id" IS '脱敏后的不可变删除 tombstone 标识';
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."retention_until" IS '脱敏事实的最短保留期限';
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."remote_deactivation_status" IS '远端身份停用状态，不把失败伪装成完成';
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."notification_status" IS '通知发送事实；未配置适配器时保持 not_configured';
