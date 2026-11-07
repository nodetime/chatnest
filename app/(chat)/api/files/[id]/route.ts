import { auth } from "@/app/(auth)/auth";
import {
  deleteDraft,
  readAssetForDownload,
  readAssetMetadata,
} from "@/server/application/uploads/service";
import {
  authorizeUploadRequest,
  uploadErrorResponse,
} from "@/server/shared/uploads/security";

type Context = { params: Promise<{ id: string }> };
async function attachmentResponse(
  request: Request,
  context: Context,
  headOnly: boolean
) {
  try {
    const userId = authorizeUploadRequest((await auth())?.user, request, false);
    const { id } = await context.params;
    // Next discards a HEAD response stream without consuming or cancelling it.
    const { body, ...asset } = headOnly
      ? { ...(await readAssetMetadata(id, userId)), body: null }
      : await readAssetForDownload(id, userId, request.signal);
    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${asset.mime.startsWith("image/") ? "inline" : "attachment"}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(asset.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
        "Content-Length": String(asset.size),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Type": asset.mime,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const response = uploadErrorResponse(error);
    return headOnly
      ? new Response(null, {
          headers: response.headers,
          status: response.status,
        })
      : response;
  }
}
export function GET(request: Request, context: Context) {
  return attachmentResponse(request, context, false);
}
export function HEAD(request: Request, context: Context) {
  return attachmentResponse(request, context, true);
}
export async function DELETE(request: Request, context: Context) {
  try {
    const userId = authorizeUploadRequest((await auth())?.user, request, true);
    return Response.json(await deleteDraft((await context.params).id, userId));
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
