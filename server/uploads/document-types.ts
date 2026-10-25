// Browser-safe attachment capabilities and persisted extraction contract.
export const DOCUMENT_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
] as const;
export const ATTACHMENT_MIMES = [
  "image/jpeg",
  "image/png",
  ...DOCUMENT_MIMES,
] as const;
export const ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.pdf,.docx,.xlsx,.csv,.txt";
export const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
export const MAX_DOCUMENT_CHARACTERS = 1_000_000;
export type DocumentSegment = { ref: string; text: string };
export type DocumentExtraction = {
  status: "ready" | "truncated" | "locked" | "no_extractable_text";
  segments: DocumentSegment[];
  characters: number;
  warnings: string[];
};
export function isImageMime(mime: string) {
  return mime === "image/png" || mime === "image/jpeg";
}
export function isReadableExtraction(
  extraction: DocumentExtraction | undefined
) {
  return extraction?.status === "ready" || extraction?.status === "truncated";
}
export const extractionLabels = {
  locked: "文件加密 · 请上传解密副本",
  no_extractable_text: "未提取到文字 · 扫描件需先 OCR",
  ready: "已读取文字",
  truncated: "已读取文字（内容截断）",
};
