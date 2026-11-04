// biome-ignore-all lint/performance/noAwaitInLoops: exact owned database seeds run in deterministic order.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { hash } from "bcrypt-ts";
import { isOwnedChatnestRuntime } from "./owned-payload-runtime.mjs";

export type ConnectedFixture = {
  issuer: string;
  groupId: string;
  operationId: string;
  attemptId: string;
  modelId: string;
  planSlug: string;
  adjustmentKey: string;
  personas: Array<{
    name: "requester" | "approver" | "operator" | "customer";
    role: "admin" | "operator" | "customer";
    subject: string;
    email: string;
  }>;
  refundRecoveryEventId?: number;
  refundAttentionUserId?: number;
  refundAttentionCheckouts?: { pending: string; review_required: string };
  paymentCaseGapCheckout?: string;
  disputeReviewCheckout?: string;
  disputeReviewApprovalId?: string;
  customerId?: number;
  organizationId?: number;
  organizationName?: string;
  walletApprovalId?: string;
  organizationAdjustmentKeys?: string[];
  checkoutScopeIds?: string[];
  unknownSnapshotCheckoutId?: string;
};
async function main() {
  assert(
    process.env.CHATNEST_PLATFORM_CONNECTED_ACCEPTANCE === "1" &&
      isOwnedChatnestRuntime(process.env.POSTGRES_URL),
    "EXACT_OWNED_CONNECTED_DATABASE_REQUIRED"
  );
  const file = process.env.CONNECTED_ACCEPTANCE_FILE;
  const password = process.env.CONNECTED_ACCEPTANCE_PASSWORD;
  assert(file && password);
  const data: ConnectedFixture = {
    adjustmentKey: "",
    attemptId: `试${"😀".repeat(127)}`,
    groupId: "😀".repeat(129),
    issuer: `connected-${randomUUID()}`,
    modelId: `connected-${randomUUID()}`,
    operationId: `执${"😀".repeat(127)}`,
    personas: ["requester", "approver", "operator", "customer"].map((name) => ({
      email: `${name}-${randomUUID().slice(0, 12)}@example.test`,
      name: name as ConnectedFixture["personas"][number]["name"],
      role:
        name === "operator"
          ? "operator"
          : name === "customer"
            ? "customer"
            : "admin",
      subject: randomUUID(),
    })),
    planSlug: `connected-${randomUUID()}`,
  };
  const { getDatabaseClient } = await import(
    "../server/infrastructure/persistence/drizzle/connection"
  );
  const sql = getDatabaseClient();
  try {
    const encoded = await hash(password, 10);
    for (const persona of data.personas) {
      await sql`INSERT INTO users(id,email,password,name,is_anonymous,session_revision) VALUES(${persona.subject},${persona.email},${encoded},${persona.name},false,1)`;
    }
    writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
    console.log(
      JSON.stringify({ scope: "owned-connected-chatnest", seededUsers: 4 })
    );
  } finally {
    await sql.end();
  }
}
main().catch(() => {
  console.error("CONNECTED_CHATNEST_SEED_FAILED");
  process.exitCode = 1;
});
