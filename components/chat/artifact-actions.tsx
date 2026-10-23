import { memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { artifactDefinitions, type UIArtifact } from "./artifact";
import {
  type ArtifactAction,
  type ArtifactActionContext,
  isArtifactActionActive,
} from "./create-artifact";

type ArtifactActionsProps = {
  artifact: UIArtifact;
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
              ? "size-9 rounded-md hover:bg-muted [&_svg]:size-4"
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
      {artifactDefinition.actions
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

export const ArtifactActions = memo(
  PureArtifactActions,
  (prevProps, nextProps) => {
    if (
      prevProps.layout !== nextProps.layout ||
      prevProps.artifact.kind !== nextProps.artifact.kind
    ) {
      return false;
    }
    if (prevProps.artifact.status !== nextProps.artifact.status) {
      return false;
    }
    if (prevProps.currentVersionIndex !== nextProps.currentVersionIndex) {
      return false;
    }
    if (prevProps.isCurrentVersion !== nextProps.isCurrentVersion) {
      return false;
    }
    if (prevProps.artifact.content !== nextProps.artifact.content) {
      return false;
    }
    if (prevProps.mode !== nextProps.mode) {
      return false;
    }

    return true;
  }
);
