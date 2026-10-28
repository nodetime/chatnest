import { z } from "zod";
import { ATTACHMENT_MIMES } from "@/server/domain/attachment/document-types";
import { assetIdFromRef } from "@/server/domain/attachment/refs";
import { selectionSchema } from "@/server/domain/capability/schema";
import {
  MAX_MESSAGE_CHARACTERS,
  MAX_MESSAGE_PARTS,
} from "@/server/domain/message/input-limits";

const textPartSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(MAX_MESSAGE_CHARACTERS)
    .refine((value) => !!value.trim()),
  type: z.enum(["text"]),
});

const filePartSchema = z.object({
  filename: z.string().min(1).max(250).optional(),
  mediaType: z.enum(ATTACHMENT_MIMES),
  name: z.string().min(1).max(250).optional(),
  type: z.enum(["file"]),
  url: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        assetIdFromRef(value);
        return true;
      } catch {
        return false;
      }
    }, "仅支持本平台上传的图片，请重新上传旧版外部附件。"),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

const userMessageSchema = z.object({
  id: z.uuid(),
  parts: z
    .array(partSchema)
    .min(1)
    .max(MAX_MESSAGE_PARTS)
    .refine(
      (parts) =>
        parts.reduce(
          (total, part) =>
            total + (part.type === "text" ? part.text.length : 0),
          0
        ) <= MAX_MESSAGE_CHARACTERS
    ),
  role: z.enum(["user"]),
});

const toolApprovalMessageSchema = z.object({
  id: z.string(),
  parts: z.array(z.record(z.string(), z.unknown())),
  role: z.enum(["user", "assistant"]),
});

export const postRequestBodySchema = z
  .object({
    capabilitySelection: selectionSchema.optional(),
    id: z.uuid(),
    message: userMessageSchema.optional(),
    messages: z.array(toolApprovalMessageSchema).min(1).max(1000).optional(),
    searchMode: z.enum(["auto", "web"]).default("auto"),
    selectedChatModel: z.string(),
    selectedVisibilityType: z.enum(["public", "private"]),
    trigger: z
      .enum(["submit-message", "regenerate-message", "edit-message"])
      .default("submit-message"),
  })
  .refine((body) => Boolean(body.message) !== Boolean(body.messages), {
    message:
      "Provide exactly one new user message or a tool interaction continuation",
  });

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
