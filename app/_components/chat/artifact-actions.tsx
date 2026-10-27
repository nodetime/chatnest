import { Download } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { artifactExport } from "@/app/_artifacts/export";
import { cn } from "@/app/_lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { artifactDefinitions, type UIArtifact } from "./artifact";
import {
  type ArtifactAction,
  type ArtifactActionContext,
  isArtifactActionActive,
} from "./create-artifact";

type ArtifactActionsProps = {
  artifact: UIArtifact;
  isReadonly?: boolean;
  layout?: "toolbar" | "header";
  handleVersionChange: (type: "next" | "prev" | "toggle" | "latest") => void;
  currentVersionIndex: number;
  isCurrentVersion: boolean;
  mode: "edit" | "diff";
  metadata: ArtifactActionContext["metadata"];
  setMetadata: ArtifactActionContext["setMetadata"];
};

function ArtifactActionButton({
  action,
  actionContext,
  disabled,
  isActive,
  setIsLoading,
  layout,
}: {
  action: ArtifactAction;
  layout: "toolbar" | "header";
  actionContext: ArtifactActionContext;
  disabled: boolean;
  isActive: boolean;
  setIsLoading: (isLoading: boolean) => void;
}) {
  const handleClick = useCallback(async () => {
    setIsLoading(true);

    try {
      await Promise.resolve(action.onClick(actionContext));
    } catch {
      toast.error("操作执行失败，请重试。");
    } finally {
      setIsLoading(false);
    }
  }, [action, actionContext, setIsLoading]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={action.description}
          className={cn(
            "flex items-center justify-center text-muted-foreground transition-all duration-150 focus-visible:outline-2 focus-visible:outline-ring",
            layout === "header"
              ? "size-9 rounded-md hover:bg-muted @min-[960px]:w-auto @min-[960px]:gap-1.5 @min-[960px]:px-2 [&_svg]:size-4"
              : "rounded-full p-3",
            "hover:text-foreground",
            "active:scale-95",
            "disabled:pointer-events-none disabled:opacity-30",
            {
              "text-foreground": isActive,
            }
          )}
          disabled={disabled}
          onClick={handleClick}
          type="button"
        >
          {action.icon}
          {layout === "header" && (
            <span className="hidden lg:inline @max-[960px]:hidden text-xs">
              {action.label ?? action.description}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={8}>
        {action.description}
      </TooltipContent>
    </Tooltip>
  );
}

function PureArtifactActions({
  artifact,
  handleVersionChange,
  currentVersionIndex,
  isCurrentVersion,
  mode,
  metadata,
  setMetadata,
  layout = "toolbar",
  isReadonly = false,
}: ArtifactActionsProps) {
  const [isLoading, setIsLoading] = useState(false);

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind
  );

  if (!artifactDefinition) {
    throw new Error("Artifact definition not found!");
  }

  const actionContext: ArtifactActionContext = {
    content: artifact.content,
    currentVersionIndex,
    handleVersionChange,
    isCurrentVersion,
    metadata,
    mode,
    setMetadata,
  };

  return (
    <div
      className={cn(
        "flex items-center gap-0.5",
        layout === "header" ? "shrink-0" : "flex-col"
      )}
    >
      {layout === "header" && (
        <ArtifactActionButton
          action={{
            description: "导出产物",
            icon: <Download className="size-4" />,
            label: "导出",
            onClick: () => {
              const file = artifactExport(artifact);
              const body =
                file.encoding === "base64"
                  ? Uint8Array.from(atob(file.content), (char) =>
                      char.charCodeAt(0)
                    )
                  : file.content;
              const url = URL.createObjectURL(
                new Blob([body], { type: file.mediaType })
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = file.filename;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            },
          }}
          actionContext={actionContext}
          disabled={isLoading || artifact.status === "streaming"}
          isActive={false}
          layout={layout}
          setIsLoading={setIsLoading}
        />
      )}
      {artifactDefinition.actions
        .filter((action) => !isReadonly || action.id !== "run-code")
        .filter(
          (action) =>
            layout !== "header" ||
            !["previous-version", "next-version"].includes(action.id ?? "")
        )
        .map((action) => {
          const disabled =
            isLoading || artifact.status === "streaming"
              ? true
              : action.isDisabled
                ? action.isDisabled(actionContext)
                : false;

          return (
            <ArtifactActionButton
              action={action}
              actionContext={actionContext}
              disabled={disabled}
              isActive={isArtifactActionActive(action, mode)}
              key={action.id ?? action.description}
              layout={layout}
              setIsLoading={setIsLoading}
            />
          );
        })}
    </div>
  );
}

// Handler and metadata identity matter even when two documents have equal text.
export const ArtifactActions = memo(PureArtifactActions);
