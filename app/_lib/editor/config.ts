import { textblockTypeInputRule } from "prosemirror-inputrules";
import { Fragment, type Node, Slice } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { MutableRefObject } from "react";

import { buildContentFromDocument, documentSchema } from "./markdown";

export { documentSchema } from "./markdown";

export function handleTableEnter(
  view: Pick<EditorView, "state" | "dispatch">,
  event: Pick<KeyboardEvent, "key" | "isComposing">
) {
  if (event.key !== "Enter" || event.isComposing) {
    return false;
  }
  const { $from, $to } = view.state.selection;
  if (!["table_cell", "table_header"].includes($from.parent.type.name)) {
    return false;
  }
  // Enter and Shift+Enter both insert a line break inside a cell. The default
  // splitBlock command would split the cell itself and change the column count.
  if ($from.sameParent($to)) {
    view.dispatch(
      view.state.tr
        .replaceSelectionWith(documentSchema.nodes.hard_break.create())
        .scrollIntoView()
    );
  }
  return true;
}

export function handleTablePaste(
  view: Pick<EditorView, "state" | "dispatch">,
  _event: ClipboardEvent,
  slice: Slice
) {
  const { $from, $to } = view.state.selection;
  if (!["table_cell", "table_header"].includes($from.parent.type.name)) {
    return false;
  }
  if (!$from.sameParent($to)) {
    return true;
  }
  const inline: Node[] = [];
  let hasBlock = false;
  slice.content.descendants((node) => {
    if (node.isTextblock) {
      if (hasBlock || inline.length > 0) {
        inline.push(documentSchema.nodes.hard_break.create());
      }
      hasBlock = true;
      for (let index = 0; index < node.childCount; index += 1) {
        const child = node.child(index);
        if (!child.isText || !child.text?.includes("\n")) {
          inline.push(child);
          continue;
        }
        for (const [lineIndex, line] of child.text.split(/\r?\n/).entries()) {
          if (lineIndex > 0) {
            inline.push(documentSchema.nodes.hard_break.create());
          }
          if (line) {
            inline.push(documentSchema.text(line, child.marks));
          }
        }
      }
      return false;
    }
    if (node.isInline) {
      inline.push(node);
      return false;
    }
    return true;
  });
  view.dispatch(
    view.state.tr
      .replaceSelection(new Slice(Fragment.fromArray(inline), 0, 0))
      .scrollIntoView()
  );
  return true;
}

export function headingRule(level: number) {
  return textblockTypeInputRule(
    new RegExp(`^(#{1,${level}})\\s$`),
    documentSchema.nodes.heading,
    () => ({ level })
  );
}

export const handleTransaction = ({
  transaction,
  editorRef,
  onSaveContent,
}: {
  transaction: Transaction;
  editorRef: MutableRefObject<EditorView | null>;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
}) => {
  if (!editorRef?.current) {
    return;
  }

  const newState = editorRef.current.state.apply(transaction);
  editorRef.current.updateState(newState);

  if (transaction.docChanged && !transaction.getMeta("no-save")) {
    const updatedContent = buildContentFromDocument(newState.doc);

    if (transaction.getMeta("no-debounce")) {
      onSaveContent(updatedContent, false);
    } else {
      onSaveContent(updatedContent, true);
    }
  }
};
