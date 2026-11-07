ALTER TABLE "account_deletion_requests" ADD COLUMN "notification_address" text;
--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."notification_address" IS '已完成删除后的通知投递地址；未配置通知适配器时仅保留脱敏事实';
