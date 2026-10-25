import { toast } from "sonner";
import { Artifact } from "@/app/_components/chat/create-artifact";
import { CopyIcon, RedoIcon, UndoIcon } from "@/app/_components/chat/icons";
import { ImageEditor } from "@/app/_components/chat/image-editor";

export const imageArtifact = new Artifact({
  actions: [
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
      description: "复制图片",
      icon: <CopyIcon size={18} />,
      onClick: ({ content }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${content}`;

        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              navigator.clipboard.write([
                new ClipboardItem({ "image/png": blob }),
              ]);
            }
          }, "image/png");
        };

        toast.success("已复制图片");
      },
    },
  ],
  content: ImageEditor,
  description: "生成图片",
  kind: "image",
  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === "data-imageDelta") {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: streamPart.data,
        isVisible: true,
        status: "streaming",
      }));
    }
  },
  toolbar: [],
});
