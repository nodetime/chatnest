export {
  operationStateLabel,
  purposeLabel,
  subjectLabel,
} from "@/app/_lib/billing-labels";

const outcomeLabels: Record<string, string> = {
  failed: "失败",
  released: "已释放",
  success: "已完成",
};

export function outcomeLabel(outcome: string | null): string {
  return outcome ? (outcomeLabels[outcome] ?? "已返回") : "处理中";
}

export function sessionLabel(chatId: string): string {
  return /^[0-9a-f-]{24,}$/i.test(chatId) ? "一次会话" : chatId;
}

export function sessionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "进行中",
    completed: "已完成",
    overage_pending: "待处理",
    reconcile_pending: "正在结算",
  };
  return labels[status] ?? "状态未知";
}
