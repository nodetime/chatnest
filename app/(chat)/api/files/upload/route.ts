import { auth } from "@/app/(auth)/auth";
import { registerUpload } from "@/server/application/uploads/service";
import { uploadCapacity } from "@/server/domain/attachment/capacity";
import {
  authorizeUploadRequest,
  uploadErrorResponse,
} from "@/server/shared/uploads/security";
import { readUploadForm } from "@/server/shared/uploads/validation";
export async function POST(request: Request) {
  try {
    const ownerId = authorizeUploadRequest((await auth())?.user, request, true);
    const result = await uploadCapacity.run(async () => {
      const { file, chatId } = await readUploadForm(request);
      return registerUpload(ownerId, chatId, file);
    });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
