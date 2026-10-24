import { auth } from "@/app/(auth)/auth";
import { uploadCapacity } from "@/server/uploads/capacity";
import {
  authorizeUploadRequest,
  uploadErrorResponse,
} from "@/server/uploads/security";
import { registerUpload } from "@/server/uploads/service";
import { readUploadForm } from "@/server/uploads/validation";
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
