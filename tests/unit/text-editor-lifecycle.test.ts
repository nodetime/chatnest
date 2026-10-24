import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Props = {
  content: string;
  status: "idle" | "streaming";
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: never[];
  onSaveContent: (content: string, debounce: boolean) => void;
};

// Exercise actual component effect/transaction code without adding a DOM library.
// Only React's hook scheduler and the ProseMirror boundary are replaced. Parent
// browser acceptance separately checks real DOM identity, focus and typing.
function editorFixture() {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
  const slots: Slot[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  let previous: Props | undefined;
  let comparator: (a: Props, b: Props) => boolean;
  const document = (text: string) => ({
    content: { size: text.length, text },
    text,
  });
  const transaction = (text: string, changed: boolean) => {
    const meta = new Map<unknown, unknown>();
    return {
      doc: document(text),
      docChanged: changed,
      getMeta(key: unknown) {
        return meta.get(key);
      },
      replaceWith(_from: number, _to: number, content: { text: string }) {
        this.doc = document(content.text);
        this.docChanged = true;
        return this;
      },
      setMeta(key: unknown, value: unknown) {
        meta.set(key, value);
        return this;
      },
    };
  };
  type Transaction = ReturnType<typeof transaction>;
  const transactions: Transaction[] = [];
  const history: string[] = [];
  const state = (doc: ReturnType<typeof document>) => ({
    doc,
    get tr() {
      return transaction(this.doc.text, false);
    },
  });
  const views: View[] = [];
  class View {
    state: ReturnType<typeof state>;
    props: {
      editable?: () => boolean;
      dispatchTransaction?: (tr: Transaction) => void;
    } = {};
    destroyed = false;
    constructor(
      _container: unknown,
      options: { state: ReturnType<typeof state> }
    ) {
      this.state = options.state;
      views.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
    setProps(props: typeof this.props) {
      this.props = { ...this.props, ...props };
    }
    dispatch(tr: Transaction) {
      if (this.props.dispatchTransaction) {
        this.props.dispatchTransaction(tr);
      } else {
        this.state = state(tr.doc);
      }
    }
  }
  const hooks = {
    memo(component: (props: Props) => unknown, compare: typeof comparator) {
      comparator = compare;
      return component;
    },
    useCallback(callback: unknown) {
      cursor += 1;
      return callback;
    },
    useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
      const index = cursor;
      cursor += 1;
      const old = slots[index];
      if (
        !old ||
        deps.length !== old.deps?.length ||
        deps.some((item, i) => !Object.is(item, old.deps?.[i]))
      ) {
        slots[index] = { deps };
        effects.push(() => {
          old?.cleanup?.();
          slots[index].cleanup = effect();
        });
      }
    },
    useRef(initial: unknown) {
      const index = cursor;
      cursor += 1;
      slots[index] ??= {
        value: { current: index === 0 ? { mountedContainer: true } : initial },
      };
      return slots[index].value;
    },
    useState(initial: unknown) {
      const index = cursor;
      cursor += 1;
      slots[index] ??= { value: initial };
      return [
        slots[index].value,
        (value: unknown) => {
          slots[index].value = value;
        },
      ];
    },
  };
  const modules: Record<string, unknown> = {
    "./suggestion": {},
    "@/lib/editor/config": {
      documentSchema: {},
      handleTransaction: ({
        editorRef,
        transaction: tr,
        onSaveContent,
      }: {
        editorRef: { current: View };
        transaction: Transaction;
        onSaveContent: Props["onSaveContent"];
      }) => {
        transactions.push(tr);
        if (tr.docChanged && tr.getMeta("addToHistory") !== false) {
          history.push(editorRef.current.state.doc.text);
        }
        editorRef.current.state = state(tr.doc);
        if (tr.docChanged && !tr.getMeta("no-save")) {
          onSaveContent(tr.doc.text, true);
        }
      },
      headingRule: () => ({}),
    },
    "@/lib/editor/functions": {
      buildContentFromDocument: (doc: ReturnType<typeof document>) => doc.text,
      buildDocumentFromContent: document,
      createDecorations: () => ({}),
    },
    "@/lib/editor/suggestions": {
      projectWithPositions: () => [],
      suggestionsPlugin: {},
      suggestionsPluginKey: {},
    },
    "prosemirror-example-setup": { exampleSetup: () => [] },
    "prosemirror-inputrules": { inputRules: () => ({}) },
    "prosemirror-state": {
      EditorState: {
        create: ({ doc }: { doc: ReturnType<typeof document> }) => state(doc),
      },
    },
    "prosemirror-view": { DecorationSet: {}, EditorView: View },
    react: hooks,
    "react-dom": { createPortal: () => null },
    "react/jsx-runtime": {
      Fragment: "fragment",
      jsx: () => null,
      jsxs: () => null,
    },
  };
  const output = { exports: {} as { Editor: (props: Props) => void } };
  const compiled = ts.transpileModule(
    readFileSync("components/chat/text-editor.tsx", "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
      },
    }
  );
  runInNewContext(compiled.outputText, {
    exports: output.exports,
    module: output,
    require: (name: string) => {
      assert.ok(name in modules, `unexpected dependency ${name}`);
      return modules[name];
    },
  });
  return {
    render(props: Props) {
      if (previous && comparator(previous, props)) {
        return;
      }
      cursor = 0;
      effects = [];
      output.exports.Editor(props);
      for (const effect of effects) {
        effect();
      }
      previous = props;
    },
    transactions,
    type(text: string) {
      views.at(-1)?.dispatch(transaction(text, true));
    },
    undo() {
      const text = history.pop();
      if (text !== undefined) {
        views
          .at(-1)
          ?.dispatch(transaction(text, true).setMeta("addToHistory", false));
      }
    },
    unmount() {
      for (const slot of slots) {
        slot?.cleanup?.();
      }
    },
    views,
  };
}

const fixtureProps = (overrides: Partial<Props> = {}): Props => ({
  content: "initial",
  currentVersionIndex: 0,
  isCurrentVersion: true,
  onSaveContent: () => {
    /* No-op save for fixtures that only exercise guard state. */
  },
  status: "idle",
  suggestions: [],
  ...overrides,
});

test("sequential local edits retain the mounted view and dispatch handler until unmount", () => {
  const fixture = editorFixture();
  const saved: string[] = [];
  const initial = fixtureProps({
    onSaveContent: (content) => saved.push(content),
  });
  fixture.render(initial);
  const [mounted] = fixture.views;
  for (const content of ["initial a", "initial ab", "initial abc"]) {
    fixture.type(content);
    fixture.render({ ...initial, content });
    assert.equal(
      fixture.views.length,
      1,
      "content updates must not construct another view or lose focus"
    );
    assert.equal(mounted.destroyed, false);
    assert.equal(mounted.props.editable?.(), true);
  }
  assert.deepEqual(saved, ["initial a", "initial ab", "initial abc"]);
  fixture.unmount();
  assert.equal(mounted.destroyed, true);
});

test("readonly preview reconciles external content, including empty text, without enabling edits or saves", () => {
  const fixture = editorFixture();
  const saved: string[] = [];
  const initial = fixtureProps({
    isCurrentVersion: false,
    onSaveContent: (content) => saved.push(content),
  });
  fixture.render(initial);
  const [mounted] = fixture.views;
  for (const content of ["updated preview", ""]) {
    fixture.render({ ...initial, content });
    assert.equal(fixture.views.length, 1);
    assert.equal(mounted.props.editable?.(), false);
    assert.equal(mounted.state.doc.text, content);
    fixture.type("user mutation");
    assert.equal(mounted.state.doc.text, content);
  }
  assert.deepEqual(saved, []);
});

test("streaming status changes update readonly guards even when content stays equal", () => {
  const fixture = editorFixture();
  const initial = fixtureProps();
  fixture.render(initial);
  const [mounted] = fixture.views;
  fixture.render({ ...initial, status: "streaming" });
  assert.equal(mounted.props.editable?.(), false);
  fixture.render({ ...initial, content: "streamed text", status: "streaming" });
  assert.equal(mounted.state.doc.text, "streamed text");
  fixture.type("user mutation");
  assert.equal(mounted.state.doc.text, "streamed text");
  fixture.render({ ...initial, content: "streamed text" });
  assert.equal(mounted.props.editable?.(), true);
  assert.equal(fixture.views.length, 1);
});

test("external, readonly, empty and streamed content replacements never enter undo history", () => {
  for (const isCurrentVersion of [true, false]) {
    const fixture = editorFixture();
    const saved: string[] = [];
    const initial = fixtureProps({
      isCurrentVersion,
      onSaveContent: (content) => saved.push(content),
    });
    fixture.render(initial);
    for (const [content, status] of [
      ["external text", "idle"],
      ["", "idle"],
      ["streamed text", "streaming"],
    ] as const) {
      fixture.render({ ...initial, content, status });
      const replacement = fixture.transactions.findLast((tr) => tr.docChanged);
      assert.equal(replacement?.getMeta("no-save"), true);
      assert.equal(
        replacement?.getMeta("addToHistory"),
        false,
        "external replacements must not become undoable user edits"
      );
      fixture.undo();
      assert.equal(fixture.views.at(-1)?.state.doc.text, content);
    }
    assert.deepEqual(saved, []);
  }
});

test("ordinary edits retain in-document undo while reconciliations remain nonhistorical", () => {
  const fixture = editorFixture();
  const saved: string[] = [];
  const initial = fixtureProps({
    onSaveContent: (content) => saved.push(content),
  });
  fixture.render(initial);
  fixture.type("first edit");
  fixture.render({ ...initial, content: "first edit" });
  fixture.type("second edit");
  fixture.render({ ...initial, content: "second edit" });
  fixture.undo();
  assert.equal(fixture.views.at(-1)?.state.doc.text, "first edit");
  assert.deepEqual(saved, ["first edit", "second edit", "first edit"]);
});

test("text renderer identity keys change for documents and versions, never content or readonly state", () => {
  type Element = {
    type: unknown;
    key?: string;
    props: { children?: Element[] };
  };
  const jsx = (
    type: unknown,
    props: Element["props"],
    key?: string
  ): Element => ({ key, props, type });
  const modules: Record<string, unknown> = {
    "../actions": {},
    "@/components/chat/create-artifact": {
      Artifact: class {
        constructor(config: unknown) {
          Object.assign(this, config);
        }
      },
    },
    "@/components/chat/diffview": {},
    "@/components/chat/document-skeleton": {},
    "@/components/chat/icons": {},
    "@/components/chat/text-editor": { Editor: "editor" },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    sonner: { toast: {} },
  };
  const output = {
    exports: {} as {
      textArtifact: { content: (props: Record<string, unknown>) => Element };
    },
  };
  const compiled = ts.transpileModule(
    readFileSync("artifacts/text/client.tsx", "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
      },
    }
  );
  runInNewContext(compiled.outputText, {
    exports: output.exports,
    module: output,
    require: (name: string) => {
      assert.ok(name in modules);
      return modules[name];
    },
  });
  const initial = {
    content: "initial",
    currentVersionIndex: 0,
    documentId: "document-a",
    isCurrentVersion: true,
    isReadonly: false,
    mode: "edit",
    status: "idle",
  };
  const editorKey = (overrides = {}) =>
    output.exports.textArtifact
      .content({ ...initial, ...overrides })
      .props.children?.find((node) => node?.type === "editor")?.key;
  const original = editorKey();
  assert.ok(original, "text Editor must have a document/version identity key");
  assert.equal(editorKey({ content: "edited text" }), original);
  assert.equal(editorKey({ content: "" }), original);
  assert.equal(editorKey({ isReadonly: true }), original);
  assert.notEqual(editorKey({ documentId: "document-b" }), original);
  assert.notEqual(editorKey({ currentVersionIndex: 1 }), original);
  const preview = readFileSync("components/chat/document-preview.tsx", "utf8");
  assert.doesNotMatch(
    preview,
    /<Editor|from "\.\/text-editor"/,
    "chat file entries must not mount a duplicate editor"
  );
});

test("the empty text editor host retains usable width inside its flex renderer", () => {
  const source = readFileSync("components/chat/text-editor.tsx", "utf8");
  const hostClasses = source
    .match(/className="([^"]*)"\s+ref=\{containerRef\}/)?.[1]
    .split(/\s+/);
  assert.ok(
    hostClasses?.includes("w-full"),
    "an empty editor must retain a full-width focus target"
  );
  assert.ok(
    hostClasses?.includes("min-w-0"),
    "editor width must remain shrinkable without page overflow"
  );
});
