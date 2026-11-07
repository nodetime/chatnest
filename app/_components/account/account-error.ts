const accountErrorLabels: Record<string, string> = {
  ACCOUNT_NOT_FOUND: "账户资料暂时无法读取，请重新登录。",
  ACCOUNT_SETTINGS_UNAVAILABLE: "账户设置暂时无法读取，请稍后刷新。",
  APPROVAL_ACTOR_MISMATCH: "这条审批只能由批准它的管理员执行。",
  APPROVAL_ALREADY_PROCESSED: "这条审批已经被处理，请刷新列表。",
  APPROVAL_EXPIRED: "这条审批已过期，请重新提交申请。",
  APPROVAL_REQUIRED: "这项账务变更需要先完成审批。",
  APPROVAL_SNAPSHOT_REQUIRED: "这条审批缺少完整调账明细，请重新申请。",
  BILLING_READ_FAILED: "积分数据暂时无法读取，请稍后刷新。",
  CHECKOUT_NOT_CONFIGURED: "充值服务尚未配置，请联系管理员。",
  CHECKOUT_NOT_FOUND: "这笔支付记录暂时不存在，请返回充值页面重新查看。",
  DISPUTE_REVIEW_STALE: "原付款证据尚未齐全或已变化，请刷新并核查全部案件。",
  IDENTITY_EXCHANGE_FAILED: "账户余额同步暂时不可用，请稍后刷新。",
  PLATFORM_NOT_CONNECTED: "积分服务暂时不可用，请稍后刷新。",
  PLATFORM_UNAVAILABLE: "积分服务暂时不可用，请稍后刷新。",
  REVISION_CONFLICT: "余额刚刚发生变化，请刷新后重试。",
  SESSION_REVOKE_UNAVAILABLE: "会话撤销暂时失败，请稍后重试。",
};

export function accountErrorMessage(
  code: string | undefined,
  fallback: string
) {
  return (code && accountErrorLabels[code]) || fallback;
}
