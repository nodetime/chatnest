import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUseCases } from "@/server/composition";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";

const MAX_BODY_BYTES = 16_384;

function unauthorized() {
  return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

async function regularUser() {
  const session = await auth();
  return session?.user?.type === "regular" ? session.user : null;
}

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error("BODY_TOO_LARGE");
  }
  return JSON.parse(raw) as unknown;
}

export async function GET() {
  const user = await regularUser();
  if (!user) {
    return unauthorized();
  }
  const settings = await getUseCases().account.get(user.id);
  return settings
    ? Response.json(settings, {
        headers: { "Cache-Control": "private, no-store" },
      })
    : Response.json({ code: "ACCOUNT_NOT_FOUND" }, { status: 404 });
}

export async function PATCH(request: Request) {
  const user = await regularUser();
  if (!user) {
    return unauthorized();
  }
  if (!sameOriginBrowserControl(request)) {
    return Response.json({ code: "ORIGIN_MISMATCH" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return Response.json(
      {
        code:
          error instanceof Error && error.message === "BODY_TOO_LARGE"
            ? "BODY_TOO_LARGE"
            : "INVALID_JSON",
      },
      {
        status:
          error instanceof Error && error.message === "BODY_TOO_LARGE"
            ? 413
            : 400,
      }
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ code: "INVALID_SETTINGS" }, { status: 400 });
  }
  const input = body as { preferences?: unknown; profile?: unknown };
  if ((input.profile === undefined) === (input.preferences === undefined)) {
    return Response.json({ code: "SETTINGS_SCOPE_REQUIRED" }, { status: 400 });
  }
  try {
    const settings =
      input.profile === undefined
        ? await getUseCases().account.updatePreferences(
            user.id,
            input.preferences
          )
        : await getUseCases().account.updateProfile(user.id, input.profile);
    return settings
      ? Response.json(settings, {
          headers: { "Cache-Control": "private, no-store" },
        })
      : Response.json({ code: "ACCOUNT_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ code: "INVALID_SETTINGS" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_DEFAULT_MODEL") {
      return Response.json({ code: error.message }, { status: 400 });
    }
    if (
      error instanceof Error &&
      error.message === "ACCOUNT_SETTINGS_REVISION_CONFLICT"
    ) {
      return Response.json({ code: error.message }, { status: 409 });
    }
    return Response.json(
      { code: "ACCOUNT_SETTINGS_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
