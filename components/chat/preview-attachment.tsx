import { FileText, RotateCcw } from "lucide-react";
import type { Attachment } from "@/lib/types";
import { extractionLabels } from "@/lib/uploads/document-types";
import { Spinner } from "../ui/spinner";
import { CrossSmallIcon } from "./icons";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
  onRetry,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
  onRetry?: () => void;
}) => {
  const { name, url, contentType } = attachment;

  return (
    <div
      className="group relative h-24 min-w-24 max-w-64 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted"
      data-testid="input-attachment-preview"
    >
      {contentType?.startsWith("image") ? (
        // biome-ignore lint/performance/noImgElement: authenticated private previews must bypass the image optimizer
        <img
          alt={name ?? "图片附件"}
          className="size-full object-cover"
          height={96}
          src={url}
          width={96}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground text-xs">
          <div className="flex min-w-44 flex-col gap-1 px-3 py-2">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{name}</span>
            </span>
            <span>
              {attachment.size
                ? `${(attachment.size / 1_048_576).toFixed(2)} MiB · `
                : ""}
              {name?.split(".").pop()?.toUpperCase()}
            </span>
            <span
              className={
                attachment.error ||
                ["locked", "no_extractable_text"].includes(
                  attachment.extraction?.status ?? ""
                )
                  ? "text-destructive"
                  : ""
              }
              title={
                attachment.error ?? attachment.extraction?.warnings.join("\n")
              }
            >
              {attachment.error
                ? "读取失败"
                : attachment.extraction
                  ? extractionLabels[attachment.extraction.status]
                  : isUploading
                    ? "上传 / 读取中…"
                    : "文档附件"}
            </span>
          </div>
        </div>
      )}

      {isUploading ? (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm"
          data-testid="input-attachment-loader"
        >
          <Spinner className="size-5" />
        </div>
      ) : null}

      {onRetry && attachment.error && !isUploading && (
        <button
          aria-label={`重试 ${name}`}
          className="absolute right-8 top-1.5 rounded-full bg-background p-1"
          onClick={onRetry}
          type="button"
        >
          <RotateCcw className="size-4" />
        </button>
      )}
      {onRemove && !isUploading && (
        <button
          aria-label={`移除附件 ${name ?? ""}`}
          className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-opacity hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onRemove}
          type="button"
        >
          <CrossSmallIcon size={10} />
        </button>
      )}
    </div>
  );
};
