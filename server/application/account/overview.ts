import type {
  PlatformBillingClient,
  PlatformSessionSummary,
} from "@/server/application/platform/protocol";

export type AccountOverview = {
  account: {
    email: string;
    name: string | null;
  };
  billing: {
    balancePoints: string | null;
    status: "connected" | "degraded" | "unavailable";
  };
  recentUsage: PlatformSessionSummary | null;
  subscription: {
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    planName: string;
    status: string;
  } | null;
};

type AccountIdentity = {
  email?: string | null;
  id: string;
  name?: string | null;
};

export async function loadAccountOverview(input: {
  createClient: () => Promise<PlatformBillingClient | null>;
  user: AccountIdentity;
}): Promise<AccountOverview> {
  const account = {
    email: input.user.email ?? "",
    name: input.user.name ?? null,
  };
  let client: PlatformBillingClient | null;
  try {
    client = await input.createClient();
  } catch {
    client = null;
  }

  if (!client?.sessionList) {
    return {
      account,
      billing: { balancePoints: null, status: "unavailable" },
      recentUsage: null,
      subscription: null,
    };
  }

  try {
    const sessionList = await client.sessionList();
    let subscription: AccountOverview["subscription"] = null;
    if (client.subscriptions) {
      try {
        const result = await client.subscriptions();
        const current = result.subscriptions.find((item) =>
          ["active", "trialing", "past_due", "incomplete"].includes(item.status)
        );
        subscription = current
          ? {
              cancelAtPeriodEnd: current.cancelAtPeriodEnd,
              currentPeriodEnd: current.currentPeriodEnd,
              planName: current.plan?.name ?? "订阅方案",
              status: current.status,
            }
          : null;
      } catch {
        subscription = null;
      }
    }
    return {
      account,
      billing: {
        balancePoints: sessionList.balancePoints,
        status: "connected",
      },
      recentUsage: sessionList.sessions[0] ?? null,
      subscription,
    };
  } catch {
    return {
      account,
      billing: { balancePoints: null, status: "degraded" },
      recentUsage: null,
      subscription: null,
    };
  }
}
