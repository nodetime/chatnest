"use client";

import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import { initialArtifactData, useArtifact } from "@/app/_hooks/use-artifact";
import { useWorkspace } from "@/app/_hooks/use-workspace";
import { applyResultTableEvent } from "@/server/domain/document/stream-state";
import { artifactDefinitions } from "./artifact";
import { artifactSwitchReason } from "./artifact-catalog";
import { useDataStream } from "./data-stream-provider";
import { getChatHistoryPaginationKey } from "./sidebar-history";

export function DataStreamHandler() {
  const { dataStream, setDataStream } = useDataStream();
  const { mutate } = useSWRConfig();
  const { chatId } = useActiveChat();

  const { artifact, metadata, setArtifact, setMetadata } = useArtifact();
  const { show } = useWorkspace();
  const blockedArtifact = useRef(false);

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }

    const newDeltas = dataStream.slice();
    setDataStream([]);

    let streamKind = artifact.kind;
    let streamDocumentId = artifact.documentId;
    for (const delta of newDeltas) {
      if (delta.type === "data-chat-title") {
        mutate(unstable_serialize(getChatHistoryPaginationKey));
        continue;
      }
      if (delta.type === "data-id") {
        streamDocumentId = delta.data;
        blockedArtifact.current =
          (delta.data !== artifact.documentId ||
            metadata?.documentPendingChanges === true ||
            metadata?.resultTablePendingChanges === true) &&
          artifactSwitchReason({
            isContentDirty: metadata?.documentPendingChanges === true,
            resultTablePendingChanges:
              metadata?.resultTablePendingChanges === true,
            status: artifact.status,
          }) !== null;
      }
      if (blockedArtifact.current) {
        if (delta.type === "data-finish") {
          blockedArtifact.current = false;
        }
        continue;
      }
      if (delta.type === "data-resultTable") {
        streamKind = "sheet";
        setArtifact((current) => applyResultTableEvent(current, delta.data));
        continue;
      }
      if (
        delta.type === "data-mcp-source" ||
        delta.type === "data-run-status"
      ) {
        continue;
      }
      if (delta.type === "data-kind") {
        streamKind = delta.data;
      }
      if (delta.type === "data-id") {
        show("document");
      }
      if (delta.type === "data-finish" && streamDocumentId !== "init") {
        mutate(
          `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/document?id=${streamDocumentId}&chatId=${chatId}`
        );
      }
      const artifactDefinition = artifactDefinitions.find(
        (currentArtifactDefinition) =>
          currentArtifactDefinition.kind === streamKind
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          setArtifact,
          setMetadata,
          streamPart: delta,
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: "streaming" };
        }

        switch (delta.type) {
          case "data-id":
            return {
              ...draftArtifact,
              ...(draftArtifact.documentId === delta.data
                ? {}
                : { content: "", title: "" }),
              documentId: delta.data,
              isVisible: true,
              status: "streaming",
            };

          case "data-title":
            return {
              ...draftArtifact,
              status: "streaming",
              title: delta.data,
            };

          case "data-kind":
            return {
              ...draftArtifact,
              kind: delta.data,
              status: "streaming",
            };

          case "data-clear":
            return {
              ...draftArtifact,
              content: "",
              status: "streaming",
            };

          case "data-finish":
            return {
              ...draftArtifact,
              status: "idle",
            };

          default:
            return draftArtifact;
        }
      });
    }
  }, [
    dataStream,
    setArtifact,
    setMetadata,
    artifact,
    metadata,
    chatId,
    setDataStream,
    mutate,
    show,
  ]);

  return null;
}
