// biome-ignore-all lint/suspicious/noArrayIndexKey: Bounded read-only text snapshots have no per-row state or reorder interactions.
import { ExternalLink } from "lucide-react";
import type { ResultPreview } from "./tool-presentation";

export function ToolResultPreview({
  preview,
  parameters = false,
}: {
  preview: ResultPreview;
  parameters?: boolean;
}) {
  const otherSources = preview.sources.filter(
    (source) =>
      !preview.records.some((record) => record.source?.url === source.url)
  );
  const blocks = parameters
    ? preview.blocks
    : preview.blocks.filter((block) => block.readable);
  const omitted =
    !parameters &&
    (preview.records.some((record) => record.fields.length > 0) ||
      blocks.length < preview.blocks.length);
  const detailsOnly =
    !parameters &&
    !preview.notice &&
    preview.records.length === 0 &&
    blocks.length === 0 &&
    otherSources.length === 0;
  return (
    <div
      className="min-w-0 space-y-3 text-sm leading-6"
      data-testid="tool-result-preview"
    >
      {preview.records.length > 0 && (
        <ul aria-label="返回记录" className="space-y-3">
          {preview.records.map((record, index) => (
            <li className="space-y-1" key={index}>
              {record.source ? (
                <a
                  className="flex min-h-9 items-center gap-2 rounded-md hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  href={record.source.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {record.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {record.source.domain}
                    </span>
                  </span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                </a>
              ) : (
                <p className="font-medium [overflow-wrap:anywhere]">
                  {record.title}
                </p>
              )}
              {!!record.text && (
                <p className="whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
                  {record.text}
                </p>
              )}
              {parameters && record.fields.length > 0 && (
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {record.fields.map((field, fieldIndex) => (
                    <div
                      className="flex min-w-0 gap-1 [overflow-wrap:anywhere]"
                      key={fieldIndex}
                    >
                      <dt>{field.label}:</dt>
                      <dd>{field.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
      {blocks.length > 0 && (
        <div className="max-h-80 space-y-3 overflow-auto [overflow-wrap:anywhere]">
          {blocks.map((block, index) => (
            <div className="space-y-1" key={`${index}-${block.label}`}>
              {!!block.label && (
                <p className="text-xs font-medium text-muted-foreground">
                  {block.label}
                </p>
              )}
              {parameters ? (
                <dl className="space-y-1">
                  {block.fields.map((field, fieldIndex) => (
                    <div
                      className="flex flex-wrap gap-x-2"
                      key={`${fieldIndex}-${field.label}`}
                    >
                      {!!field.label && (
                        <dt className="text-muted-foreground">{field.label}</dt>
                      )}
                      <dd className="min-w-0 whitespace-pre-wrap">
                        {field.text}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                block.fields.map((field, fieldIndex) => (
                  <p className="whitespace-pre-wrap" key={fieldIndex}>
                    {field.text}
                  </p>
                ))
              )}
            </div>
          ))}
        </div>
      )}
      {otherSources.length > 0 && (
        <ul
          aria-label="返回来源"
          className="space-y-1 border-t border-border/50 pt-2"
        >
          {otherSources.map((source) => (
            <li key={source.url}>
              <a
                className="flex min-h-9 items-center gap-2 rounded-md py-1 text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                href={source.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{source.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {source.domain}
                  </span>
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {!!preview.notice && (
        <p className="text-muted-foreground">{preview.notice}</p>
      )}
      {!!detailsOnly && (
        <p className="text-muted-foreground">
          结果已返回，完整内容见调用详情。
        </p>
      )}
      {!detailsOnly && (preview.truncated || omitted) && (
        <p className="text-xs text-muted-foreground">
          {parameters
            ? "仅展示部分参数，完整参数见调用详情。"
            : "仅展示部分返回内容，完整结果见调用详情。"}
        </p>
      )}
    </div>
  );
}
