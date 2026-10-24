import { auth } from "@/app/(auth)/auth";
import {
  authorizeUploadRequest,
  uploadErrorResponse,
} from "@/server/uploads/security";
import {
  configureStorage,
  purgeExpiredDrafts,
  storageStatus,
  testStorage,
} from "@/server/uploads/service";
import { readBoundedBody, UploadError } from "@/server/uploads/validation";
export async function GET(request: Request) {
  try {
    authorizeUploadRequest((await auth())?.user, request, false, true);
    return Response.json(await storageStatus(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const userId = authorizeUploadRequest(
      (await auth())?.user,
      request,
      true,
      true
    );
    let body: {
      action?: unknown;
      enabled?: unknown;
      revision?: unknown;
    } | null;
    try {
      body = JSON.parse(
        (await readBoundedBody(request, 4096)).toString("utf8")
      );
    } catch (error) {
      if (error instanceof UploadError) {
        throw error;
      }
      // biome-ignore lint/style/useErrorCause: Sanitize this boundary error; underlying errors may contain private paths or request content.
      throw new UploadError(400, "请求格式错误。");
    }
    if (body?.action === "test") {
      return Response.json(await testStorage());
    }
    if (body?.action === "cleanup") {
      await purgeExpiredDrafts();
      return Response.json({ ok: true });
    }
    if (
      body?.action !== "configure" ||
      typeof body.enabled !== "boolean" ||
      typeof body.revision !== "number" ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 1
    ) {
      throw new UploadError(400, "存储设置格式错误。");
    }
    return Response.json(
      await configureStorage(body.enabled, body.revision, userId)
    );
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
