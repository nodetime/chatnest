-- 基础设施从进程日志采集异常，不再在业务库保存告警投递历史。
DROP TABLE IF EXISTS "public"."alert_delivery_events";
