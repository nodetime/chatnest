"use client";

import { python } from "@codemirror/lang-python";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { memo, useEffect, useRef } from "react";
import type { Suggestion } from "@/server/domain/suggestion/types";

type EditorProps = {
  title?: string;
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: "streaming" | "idle";
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Suggestion[];
};

function PureCodeEditor({
  title,
  content,
  onSaveContent,
  status,
  isCurrentVersion,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const userScrolledRef = useRef(false);
  const configurationRef = useRef(new Compartment());
  const callbacksRef = useRef({ onSaveContent, status });

  useEffect(() => {
    callbacksRef.current = { onSaveContent, status };
  }, [onSaveContent, status]);

  useEffect(() => {
    if (containerRef.current) {
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const transaction = update.transactions.find(
            (tr) => !tr.annotation(Transaction.remote)
          );

          if (transaction) {
            const newContent = update.state.doc.toString();
            callbacksRef.current.onSaveContent(newContent, true);
          }
        }
      });

      const scrollListener = EditorView.domEventHandlers({
        scroll() {
          if (callbacksRef.current.status !== "streaming") {
            return;
          }
          const dom = editorRef.current?.scrollDOM;
          if (!dom) {
            return;
          }
          const atBottom =
            dom.scrollHeight - dom.scrollTop - dom.clientHeight < 40;
          userScrolledRef.current = !atBottom;
        },
      });

      const state = EditorState.create({
        extensions: [
          basicSetup,
          oneDark,
          configurationRef.current.of([]),
          updateListener,
          scrollListener,
        ],
      });
      editorRef.current = new EditorView({
        parent: containerRef.current,
        state,
      });
    }
    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    editorRef.current?.dispatch({
      effects: configurationRef.current.reconfigure([
        EditorState.readOnly.of(!isCurrentVersion || status === "streaming"),
        EditorView.editable.of(isCurrentVersion && status !== "streaming"),
        ...(title?.toLowerCase().endsWith(".py") ? [python()] : []),
      ]),
    });
  }, [status, isCurrentVersion, title]);

  useEffect(() => {
    if (status !== "streaming") {
      userScrolledRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    if (editorRef.current) {
      const currentContent = editorRef.current.state.doc.toString();

      if (status === "streaming" || currentContent !== content) {
        const transaction = editorRef.current.state.update({
          annotations: [
            Transaction.remote.of(true),
            Transaction.addToHistory.of(false),
          ],
          changes: {
            from: 0,
            insert: content,
            to: currentContent.length,
          },
        });

        editorRef.current.dispatch(transaction);

        if (status === "streaming" && !userScrolledRef.current) {
          requestAnimationFrame(() => {
            const dom = editorRef.current?.scrollDOM;
            if (dom) {
              dom.scrollTo({ top: dom.scrollHeight });
            }
          });
        }
      }
    }
  }, [content, status]);

  return (
    <div
      className="not-prose relative w-full min-h-[300px] pb-[calc(50dvh)]"
      ref={containerRef}
    />
  );
}

export const CodeEditor = memo(PureCodeEditor, (prevProps, nextProps) => {
  if (
    prevProps.title !== nextProps.title ||
    prevProps.isCurrentVersion !== nextProps.isCurrentVersion ||
    prevProps.onSaveContent !== nextProps.onSaveContent
  ) {
    return false;
  }
  if (prevProps.status === "streaming" && nextProps.status === "streaming") {
    return false;
  }

  if (prevProps.content !== nextProps.content) {
    return false;
  }

  if (prevProps.status !== nextProps.status) {
    return false;
  }

  if (prevProps.currentVersionIndex !== nextProps.currentVersionIndex) {
    return false;
  }

  return true;
});
