CREATE TABLE "alert_delivery_events" (
 "id" uuid PRIMARY KEY NOT NULL,
 "kind" text NOT NULL,
 "reasons" json NOT NULL,
 "outcome" text NOT NULL,
 "http_status" integer,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
 CONSTRAINT "alert_delivery_events_kind" CHECK (kind IN ('billing_attention','worker_failed')),
 CONSTRAINT "alert_delivery_events_outcome" CHECK (outcome IN ('pending','delivered','failed','skipped')),
 CONSTRAINT "alert_delivery_events_status" CHECK ((outcome='delivered' AND http_status IS NOT NULL AND http_status BETWEEN 200 AND 299) OR (outcome='failed' AND (http_status IS NULL OR http_status BETWEEN 100 AND 199 OR http_status BETWEEN 300 AND 599)) OR (outcome IN ('pending','skipped') AND http_status IS NULL))
);
--> statement-breakpoint
CREATE INDEX "alert_delivery_events_created_idx" ON "alert_delivery_events" ("created_at");
--> statement-breakpoint
COMMENT ON TABLE "alert_delivery_events" IS '单次告警投递事实；不保存URL、凭据或正文；保留30天';
COMMENT ON COLUMN "alert_delivery_events"."id" IS 'worker生成的单次投递幂等标识';
COMMENT ON COLUMN "alert_delivery_events"."kind" IS '固定告警类别';
COMMENT ON COLUMN "alert_delivery_events"."reasons" IS '白名单原因码数组';
COMMENT ON COLUMN "alert_delivery_events"."outcome" IS 'pending未知、delivered仅当次HTTP接受、failed失败、skipped未配置';
COMMENT ON COLUMN "alert_delivery_events"."http_status" IS '接收端HTTP状态；未知或未配置为空';
COMMENT ON COLUMN "alert_delivery_events"."created_at" IS '首次记录服务端时间';
COMMENT ON COLUMN "alert_delivery_events"."updated_at" IS '最近结果写入服务端时间';
COMMENT ON INDEX "alert_delivery_events_created_idx" IS '最新历史与30天保留清理索引';
COMMENT ON CONSTRAINT "alert_delivery_events_pkey" ON "alert_delivery_events" IS '单次投递幂等主键';
COMMENT ON CONSTRAINT "alert_delivery_events_kind" ON "alert_delivery_events" IS '限制固定告警类别';
COMMENT ON CONSTRAINT "alert_delivery_events_outcome" ON "alert_delivery_events" IS '限制投递结果状态';
COMMENT ON CONSTRAINT "alert_delivery_events_status" ON "alert_delivery_events" IS 'HTTP状态和结果一致性';
