export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { checkDatabaseReadiness } = await import(
      "./server/infrastructure/persistence/drizzle/runtime-role"
    );
    await checkDatabaseReadiness();
  }
  const [{ OpenTelemetry }, { registerOTel }, { registerTelemetry }] =
    await Promise.all([
      import("@ai-sdk/otel"),
      import("@vercel/otel"),
      import("ai"),
    ]);
  registerOTel({ serviceName: "chatbot" });
  registerTelemetry(new OpenTelemetry());
}
