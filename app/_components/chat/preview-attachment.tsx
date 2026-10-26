import { RotateCcw } from "lucide-react";
import type { Attachment } from "@/app/_lib/types";
import { cn } from "@/app/_lib/utils";
import { extractionLabels } from "@/server/domain/attachment/document-types";
import { Spinner } from "../ui/spinner";
import { FileSymbol } from "./file-symbol";
import { CrossSmallIcon } from "./icons";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  compact = false,
  onRemove,
  onRetry,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  compact?: boolean;
  onRemove?: () => void;
  onRetry?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  const isImage = contentType?.startsWith("image");
  const status = isUploading
    ? "上传 / 读取中…"
    : attachment.error
      ? "读取失败"
      : attachment.extraction
        ? extractionLabels[attachment.extraction.status]
        : "文档附件";
  const size =
    attachment.size === undefined
      ? undefined
      : attachment.size < 1_048_576
        ? `${(attachment.size / 1024).toFixed(2)} KiB`
        : `${(attachment.size / 1_048_576).toFixed(2)} MiB`;
  const hasError =
    !!attachment.error ||
    ["locked", "no_extractable_text"].includes(
      attachment.extraction?.status ?? ""
    );

  return (
    <div
      className={cn(
        "relative min-w-0 max-w-full shrink-0 overflow-hidden rounded-[12px] border border-border/60 bg-muted/40",
        isImage
          ? "h-24 w-24"
          : compact
            ? "inline-flex h-8 w-fit items-center gap-1.5 rounded-md bg-background px-2.5"
            : "flex h-16 w-72 items-center gap-2 px-3"
      )}
      data-testid="input-attachment-preview"
    >
      {isImage ? (
        // biome-ignore lint/performance/noImgElement: authenticated private previews must bypass the image optimizer
        <img
          alt={name ?? "图片附件"}
          className="size-full object-cover"
          height={96}
          src={url}
          width={96}
        />
      ) : (
        <>
          <FileSymbol
            className={compact ? "size-3.5" : "size-5"}
            kind={/\.(xlsx?|csv)$/i.test(name ?? "") ? "sheet" : "text"}
          />
          <div
            className={cn(
              "min-w-0 flex-1 text-xs",
              compact && "flex items-center gap-2"
            )}
          >
            <p className="truncate font-medium text-foreground" title={name}>
              {name}
            </p>
            {compact ? (
              <p className="shrink-0 text-[10px] text-muted-foreground">
                {name?.split(".").pop()?.toUpperCase()}
              </p>
            ) : (
              <div
                className="mt-1 flex min-w-0 items-center gap-1 text-muted-foreground"
                title={
                  attachment.error ?? attachment.extraction?.warnings.join("\n")
                }
              >
                <span className="max-w-[55%] shrink-0 truncate">
                  {name?.split(".").pop()?.toUpperCase()}
                  {size === undefined ? "" : ` · ${size}`} ·
                </span>
                {!!isUploading && (
                  <Spinner
                    className="size-3 shrink-0"
                    data-testid="input-attachment-loader"
                  />
                )}
                <span
                  className={cn("truncate", hasError && "text-destructive")}
                  title={status}
                >
                  {status}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {!!(isUploading && isImage) && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-[12px] bg-black/40 backdrop-blur-sm"
          data-testid="input-attachment-loader"
        >
          <Spinner className="size-5" />
        </div>
      )}

      {!isUploading && (onRemove || (onRetry && attachment.error)) && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5",
            isImage && "absolute right-1 top-1"
          )}
        >
          {!!(onRetry && attachment.error) && (
            <button
              aria-label={`重试 ${name}`}
              className="flex size-9 items-center justify-center rounded-lg bg-background text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              onClick={onRetry}
              type="button"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
          {!!onRemove && (
            <button
              aria-label={`移除附件 ${name ?? ""}`}
              className="flex size-9 items-center justify-center rounded-lg bg-background text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              onClick={onRemove}
              type="button"
            >
              <CrossSmallIcon size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
