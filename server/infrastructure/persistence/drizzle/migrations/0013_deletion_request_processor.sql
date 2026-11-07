ALTER TABLE "account_deletion_requests" ADD COLUMN "completed_by" text;--> statement-breakpoint
COMMENT ON COLUMN "account_deletion_requests"."completed_by" IS '完成处理的管理员主体或系统 worker 标识';
