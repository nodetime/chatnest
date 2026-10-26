import { auth } from "@/app/(auth)/auth";
import { deleteDraft, readAsset } from "@/server/application/uploads/service";
import {
  authorizeUploadRequest,
  uploadErrorResponse,
} from "@/server/shared/uploads/security";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const userId = authorizeUploadRequest((await auth())?.user, request, false);
    const { id } = await context.params;
    const asset = await readAsset(id, userId);
    return new Response(new Uint8Array(asset.bytes), {
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
    return uploadErrorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const userId = authorizeUploadRequest((await auth())?.user, request, true);
    return Response.json(await deleteDraft((await context.params).id, userId));
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
