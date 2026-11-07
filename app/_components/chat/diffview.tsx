import OrderedMap from "orderedmap";
import {
  type MarkSpec,
  type Node as ProsemirrorNode,
  Schema,
} from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { useEffect, useRef } from "react";
import { DiffType, diffEditor } from "@/app/_lib/editor/diff";
import { documentSchema, parseMarkdown } from "@/app/_lib/editor/markdown";

const diffSchema = new Schema({
  marks: OrderedMap.from({
    ...documentSchema.spec.marks.toObject(),
    diffMark: {
      attrs: { type: { default: "" } },
      toDOM(mark) {
        let className = "";

        switch (mark.attrs.type) {
          case DiffType.Inserted:
            className =
              "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 rounded-sm px-0.5 -mx-0.5";
            break;
          case DiffType.Deleted:
            className =
              "bg-red-500/15 line-through text-red-600 dark:text-red-400 rounded-sm px-0.5 -mx-0.5 opacity-70";
            break;
          default:
            className = "";
        }
        return ["span", { class: className }, 0];
      },
    } as MarkSpec,
  }),
  nodes: documentSchema.spec.nodes,
});

function computeDiff(oldDoc: ProsemirrorNode, newDoc: ProsemirrorNode) {
  return diffEditor(diffSchema, oldDoc.toJSON(), newDoc.toJSON());
}

type DiffEditorProps = {
  oldContent: string;
  newContent: string;
};

export const DiffView = ({ oldContent, newContent }: DiffEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      const oldDoc = parseMarkdown(oldContent, diffSchema);
      const newDoc = parseMarkdown(newContent, diffSchema);

      const diffedDoc = computeDiff(oldDoc, newDoc);

      const state = EditorState.create({
        doc: diffedDoc,
        plugins: [],
      });

      viewRef.current = new EditorView(editorRef.current, {
        editable: () => false,
        state,
      });

      requestAnimationFrame(() => {
        const firstDiff = editorRef.current?.querySelector(
          "[class*='bg-emerald'], [class*='bg-red']"
        );
        if (firstDiff) {
          firstDiff.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [oldContent, newContent]);

  return (
    <div
      className="diff-editor prose dark:prose-invert prose-neutral relative max-w-none"
      ref={editorRef}
    />
  );
};
