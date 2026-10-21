import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { sameOriginBrowserControl } from "@/lib/agent/browser-policy";
import {
  ResultTableMutationError,
  resultViewSchema,
} from "@/lib/artifacts/result-table";
import { saveResultTableView } from "@/lib/db/queries";
import { readBoundedBody, UploadError } from "@/lib/uploads/validation";

const bodySchema = z
  .object({
    chatId: z.uuid(),
    expectedVersion: z.iso.datetime(),
    id: z.uuid(),
    notes: z.string().max(10_000),
    view: resultViewSchema,
  })
  .strict();
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!sameOriginBrowserControl(request)) {
    return Response.json({ error: "Origin mismatch" }, { status: 403 });
  }
  try {
    const body = bodySchema.parse(
      JSON.parse((await readBoundedBody(request, 256 * 1024)).toString("utf8"))
    );
    return Response.json(
      await saveResultTableView({ ...body, userId: session.user.id }),
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ResultTableMutationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: "Invalid result table view" },
        { status: 400 }
      );
    }
    return Response.json(
      { error: "Result table save failed; changes are not saved." },
      { status: 503 }
    );
  }
}
