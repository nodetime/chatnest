const operationStateLabels: Record<string, string> = {
  cancelled: "已取消",
  captured: "已扣除",
  dispatched: "处理中",
  dispatching: "正在处理",
  failed: "失败",
  overage_pending: "待处理",
  reconcile_pending: "正在结算",
  released: "已退回",
  reserved: "已预留",
  settled: "已完成",
};

const toolLabels: Record<string, string> = {
  item_search: "商品搜索",
  onebound_1688_item_search: "商品搜索",
  onebound_1688_item_search_items: "商品搜索",
  search: "搜索服务",
};

export function operationStateLabel(state: string): string {
  return operationStateLabels[state] ?? "处理中";
}

export function subjectLabel(subjectType: string): string {
  return subjectType === "model" ? "模型" : "工具";
}

export function purposeLabel(
  subjectType: string,
  canonicalToolKey: string
): string {
  if (subjectType === "model") {
    return "回答问题";
  }
  const key = canonicalToolKey.split("/").at(-1) ?? "";
  return toolLabels[key] ?? "工具服务";
}

/** null是未知额度，undefined才是尚未读取；保留金额字符串精度。 */
export function availableBalanceLabel(
  value: string | null | undefined
): string {
  if (value === undefined) {
    return "读取中…";
  }
  return value === null ? "待启用或对账" : `${value} 积分`;
}
