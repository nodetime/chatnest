import { v7 as uuidv7 } from "uuid";
import { auth } from "@/app/(auth)/auth";
import { registerUpload } from "@/server/application/uploads/service";
import { uploadCapacity } from "@/server/domain/attachment/capacity";
import {
  authorizeUploadRequest,
  uploadErrorResponse,
} from "@/server/shared/uploads/security";
import { readUploadForm } from "@/server/shared/uploads/validation";
export async function POST(request: Request) {
  const traceId = request.headers.get("x-trace-id") ?? uuidv7();
  try {
    const ownerId = authorizeUploadRequest((await auth())?.user, request, true);
    const result = await uploadCapacity.run(async () => {
      const { file, chatId } = await readUploadForm(request);
      return registerUpload(ownerId, chatId, file);
    });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store", "x-trace-id": traceId },
    });
  } catch (error) {
    const response = uploadErrorResponse(error);
    response.headers.set("x-trace-id", traceId);
    if (response.status === 408 || response.status === 413) {
      // The self-hosted Node HTTP/1 listener may still have an unfinished body.
      response.headers.set("Connection", "close");
    }
    return response;
  }
}
