DROP INDEX "execution_operations_attempt_idx";--> statement-breakpoint
DROP INDEX "settlement_outbox_idempotency_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "execution_operations_attempt_idx" ON "execution_operations" USING btree ("attempt_id");--> statement-breakpoint
COMMENT ON INDEX "execution_operations_attempt_idx" IS '按 attempt 唯一约束，阻止同一真实出站被重复接管';--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_outbox_idempotency_idx" ON "settlement_outbox" USING btree ("idempotency_key");--> statement-breakpoint
COMMENT ON INDEX "settlement_outbox_idempotency_idx" IS '按幂等键唯一约束，阻止同一结算命令重复入队';
