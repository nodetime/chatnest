export async function createCheckoutIdempotencyKey(input: {
  nonce: string;
  planSlug: string;
  userId?: string;
}): Promise<string> {
  const userId = input.userId ?? "anonymous";
  if (!input.nonce || !input.planSlug || !userId) {
    throw new Error("IDEMPOTENCY_INPUT_INVALID");
  }
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([userId, input.planSlug, input.nonce])
    )
  );
  return `checkout:${Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}
