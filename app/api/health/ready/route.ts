import { connection } from "next/server";
import { checkDatabaseReadiness } from "@/server/composition";

export async function GET() {
  await connection();
  try {
    await checkDatabaseReadiness();
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { status: "not_ready" },
      { headers: { "Cache-Control": "no-store" }, status: 503 }
    );
  }
}
