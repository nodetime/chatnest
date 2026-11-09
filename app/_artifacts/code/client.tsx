import Image from "next/image";
import { Tabs } from "radix-ui";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CodeEditor } from "@/app/_components/chat/code-editor";
import {
  Console,
  type ConsoleOutput,
  type ConsoleOutputContent,
} from "@/app/_components/chat/console";
import { Artifact } from "@/app/_components/chat/create-artifact";
import {
  CopyIcon,
  LogsIcon,
  MessageIcon,
  PlayIcon,
  RedoIcon,
  UndoIcon,
} from "@/app/_components/chat/icons";
import { generateUUID } from "@/app/_lib/utils";

const OUTPUT_HANDLERS = {
  basic: `
    # Basic output capture setup
  `,
  matplotlib: `
    import io
    import base64
    from matplotlib import pyplot as plt

    # Clear any existing plots
    plt.clf()
    plt.close('all')

    # Switch to agg backend
    plt.switch_backend('agg')

    def setup_matplotlib_output():
        def custom_show():
            if plt.gcf().get_size_inches().prod() * plt.gcf().dpi ** 2 > 25_000_000:
                print("Warning: Plot size too large, reducing quality")
                plt.gcf().set_dpi(100)

            png_buf = io.BytesIO()
            plt.savefig(png_buf, format='png')
            png_buf.seek(0)
            png_base64 = base64.b64encode(png_buf.read()).decode('utf-8')
            print(f'data:image/png;base64,{png_base64}')
            png_buf.close()

            plt.clf()
            plt.close('all')

        plt.show = custom_show
  `,
};

function detectRequiredHandlers(code: string): string[] {
  const handlers: string[] = ["basic"];

  if (code.includes("matplotlib") || code.includes("plt.")) {
    handlers.push("matplotlib");
  }

  return handlers;
}

type Metadata = {
  outputs: ConsoleOutput[];
};

const codeArtifactContent: Artifact<"code", Metadata>["content"] =
  function CodeArtifactContent({ metadata, setMetadata, ...props }) {
    const isSvg = props.title.toLowerCase().endsWith(".svg");
    const [imageUrl, setImageUrl] = useState("");
    const [previewError, setPreviewError] = useState(false);
    useEffect(() => {
      if (!isSvg) {
        return;
      }
      const url = URL.createObjectURL(
        new Blob([props.content], { type: "image/svg+xml" })
      );
      setImageUrl(url);
      setPreviewError(false);
      return () => URL.revokeObjectURL(url);
    }, [isSvg, props.content]);
    const handlePreviewError = useCallback(() => setPreviewError(true), []);
    const clearConsoleOutputs = useCallback(() => {
      setMetadata((currentMetadata) => ({
        ...currentMetadata,
        outputs: [],
      }));
    }, [setMetadata]);

    const editor = (
      <div className="relative min-h-[200px]">
        <CodeEditor
          {...props}
          isCurrentVersion={props.isCurrentVersion && !props.isReadonly}
          key={props.documentId}
        />
      </div>
    );

    return (
      <>
        {isSvg ? (
          <Tabs.Root className="w-full" defaultValue="preview">
            <Tabs.List
              aria-label="SVG 查看方式"
              className="inline-flex gap-1 rounded-lg bg-muted p-1"
            >
              <Tabs.Trigger
                className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-background focus-visible:outline-2 focus-visible:outline-ring"
                value="preview"
              >
                预览
              </Tabs.Trigger>
              <Tabs.Trigger
                className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-background focus-visible:outline-2 focus-visible:outline-ring"
                value="source"
              >
                源码
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content className="mt-3" value="preview">
              {previewError ? (
                <p className="p-6 text-sm text-muted-foreground" role="status">
                  预览未加载成功，可切换源码检查文件。
                </p>
              ) : (
                imageUrl && (
                  <div className="flex min-h-64 items-center justify-center rounded-xl border bg-white p-6">
                    {/* SVG is loaded as an image; its scripts never run in the application document. */}
                    <Image
                      alt={props.title}
                      className="h-auto w-auto max-h-[65dvh] max-w-full"
                      height={800}
                      key={imageUrl}
                      onError={handlePreviewError}
                      src={imageUrl}
                      unoptimized
                      width={1200}
                    />
                  </div>
                )
              )}
            </Tabs.Content>
            <Tabs.Content className="mt-3" value="source">
              {editor}
            </Tabs.Content>
          </Tabs.Root>
        ) : (
          editor
        )}

        {!isSvg && metadata?.outputs ? (
          <Console
            consoleOutputs={metadata.outputs}
            setConsoleOutputs={clearConsoleOutputs}
          />
        ) : null}
      </>
    );
  };

export const codeArtifact = new Artifact<"code", Metadata>({
  actions: [
    {
      description: "运行代码",
      icon: <PlayIcon size={18} />,
      id: "run-code",
      label: "运行",
      onClick: async ({ content, setMetadata }) => {
        const runId = generateUUID();
        const outputContent: ConsoleOutputContent[] = [];

        setMetadata((metadata) => ({
          ...metadata,
          outputs: [
            ...metadata.outputs,
            {
              contents: [],
              id: runId,
              status: "in_progress",
            },
          ],
        }));

        try {
          // @ts-expect-error - loadPyodide is not defined
          const currentPyodideInstance = await globalThis.loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/",
          });

          currentPyodideInstance.setStdout({
            batched: (output: string) => {
              outputContent.push({
                type: output.startsWith("data:image/png;base64")
                  ? "image"
                  : "text",
                value: output,
              });
            },
          });

          await currentPyodideInstance.loadPackagesFromImports(content, {
            messageCallback: (message: string) => {
              setMetadata((metadata) => ({
                ...metadata,
                outputs: [
                  ...metadata.outputs.filter((output) => output.id !== runId),
                  {
                    contents: [{ type: "text", value: message }],
                    id: runId,
                    status: "loading_packages",
                  },
                ],
              }));
            },
          });

          const requiredHandlers = detectRequiredHandlers(content);
          await requiredHandlers.reduce<Promise<void>>(
            async (previous, handler) => {
              await previous;

              if (!OUTPUT_HANDLERS[handler as keyof typeof OUTPUT_HANDLERS]) {
                return;
              }

              await currentPyodideInstance.runPythonAsync(
                OUTPUT_HANDLERS[handler as keyof typeof OUTPUT_HANDLERS]
              );

              if (handler === "matplotlib") {
                await currentPyodideInstance.runPythonAsync(
                  "setup_matplotlib_output()"
                );
              }
            },
            Promise.resolve()
          );

          await currentPyodideInstance.runPythonAsync(content);

          setMetadata((metadata) => ({
            ...metadata,
            outputs: [
              ...metadata.outputs.filter((output) => output.id !== runId),
              {
                contents: outputContent,
                id: runId,
                status: "completed",
              },
            ],
          }));
        } catch (error: unknown) {
          setMetadata((metadata) => ({
            ...metadata,
            outputs: [
              ...metadata.outputs.filter((output) => output.id !== runId),
              {
                contents: [
                  {
                    type: "text",
                    value:
                      error instanceof Error ? error.message : String(error),
                  },
                ],
                id: runId,
                status: "failed",
              },
            ],
          }));
        }
      },
    },
    {
      description: "上一版本",
      icon: <UndoIcon size={18} />,
      id: "previous-version",
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("prev");
      },
    },
    {
      description: "下一版本",
      icon: <RedoIcon size={18} />,
      id: "next-version",
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("next");
      },
    },
    {
      description: "复制代码",
      icon: <CopyIcon size={18} />,
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success("已复制到剪贴板");
      },
    },
  ],
  content: codeArtifactContent,
  description: "生成代码；代码执行仅支持 Python。",
  initialize: ({ setMetadata }) => {
    setMetadata((metadata) => ({
      ...metadata,
      outputs: [],
    }));
  },
  kind: "code",
  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === "data-codeDelta") {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: streamPart.data,
        isVisible:
          draftArtifact.status === "streaming" &&
          draftArtifact.content.length > 300 &&
          draftArtifact.content.length < 310
            ? true
            : draftArtifact.isVisible,
        status: "streaming",
      }));
    }
  },
  toolbar: [
    {
      description: "添加注释",
      icon: <MessageIcon />,
      onClick: ({ sendMessage }) => {
        sendMessage({
          parts: [
            {
              text: "Add comments to the code snippet for understanding",
              type: "text",
            },
          ],
          role: "user",
        });
      },
    },
    {
      description: "添加日志",
      icon: <LogsIcon />,
      onClick: ({ sendMessage }) => {
        sendMessage({
          parts: [
            {
              text: "Add logs to the code snippet for debugging",
              type: "text",
            },
          ],
          role: "user",
        });
      },
    },
  ],
});
