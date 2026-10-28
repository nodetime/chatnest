import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
type Node = { type: string; props: Record<string, any> };
const jsx = (type: string, props: Node["props"]) => ({ props, type });
function load(file: string, modules: Record<string, unknown>, globals = {}) {
  const output = { exports: {} as Record<string, any> };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  runInNewContext(code, {
    exports: output.exports,
    module: output,
    process: { env: {} },
    require: (name: string) => {
      assert.ok(name in modules, `unexpected dependency ${name}`);
      return modules[name];
    },
    ...globals,
  });
  return output.exports;
}
function find(tree: any, type: string): Node | undefined {
  if (Array.isArray(tree)) {
    return tree.map((node) => find(node, type)).find(Boolean);
  }
  if (!tree || typeof tree !== "object") {
    return;
  }
  return tree.type === type
    ? tree
    : (find(tree.props?.children, type) ?? find(tree.props?.actions, type));
}

test("generic downloads preserve all four native artifact formats and normalize filenames", () => {
  const { artifactExport } = require("../../_artifacts/export.ts");
  assert.deepEqual(
    artifactExport({
      content: "# Report\n正文",
      kind: "text",
      title: "Plan/notes",
    }),
    {
      content: "# Report\n正文",
      encoding: "utf8",
      filename: "Plan-notes.md",
      mediaType: "text/markdown;charset=utf-8",
    }
  );
  assert.equal(
    artifactExport({ content: "print(1)", kind: "code", title: "Code" })
      .filename,
    "Code.py"
  );
  assert.equal(
    artifactExport({ content: "a,b\n1,2", kind: "sheet", title: "Table" })
      .mediaType,
    "text/csv;charset=utf-8"
  );
  assert.equal(
    artifactExport({ content: "iVBORw==", kind: "image", title: "Image" })
      .encoding,
    "base64"
  );
  assert.equal(
    artifactExport({
      content: "",
      kind: "text",
      title: "../\\\u0000",
    }).filename.includes("/"),
    false
  );
});

test("closing a document preserves its identity, type and unsaved content for reopening", () => {
  let artifact = {
    content: "draft",
    documentId: "same",
    isVisible: true,
    kind: "code",
    status: "idle",
    title: "Code",
  };
  const { ArtifactCloseButton } = load(
    "app/_components/chat/artifact-close-button.tsx",
    {
      "./icons": { CrossIcon: "cross" },
      "@/app/_hooks/use-artifact": {
        useArtifact: () => ({
          setArtifact: (fn: any) => {
            artifact = fn(artifact);
          },
        }),
      },
      react: { memo: (fn: unknown) => fn, useCallback: (fn: unknown) => fn },
      "react/jsx-runtime": { jsx, jsxs: jsx },
    }
  );
  ArtifactCloseButton().props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(artifact)), {
    content: "draft",
    documentId: "same",
    isVisible: false,
    kind: "code",
    status: "idle",
    title: "Code",
  });
});

test("legacy result card uses native open semantics and reopens the document workspace", () => {
  let artifact = {
    content: "old body",
    documentId: "old",
    isVisible: true,
    kind: "text",
    status: "idle",
  };
  let shown = "";
  const {
    openArtifactPreview,
  } = require("../../../server/domain/document/stream-state.ts");
  const { DocumentToolResult } = load("app/_components/chat/document.tsx", {
    "./icons": {},
    "@/app/_hooks/use-artifact": {
      useArtifact: () => ({
        setArtifact: (fn: any) => {
          artifact = fn(artifact);
        },
      }),
    },
    "@/app/_hooks/use-workspace": {
      useWorkspace: () => ({
        show: (tab: string) => {
          shown = tab;
        },
      }),
    },
    "@/server/domain/document/stream-state": { openArtifactPreview },
    react: { memo: (fn: unknown) => fn, useCallback: (fn: unknown) => fn },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    sonner: {
      toast: {
        error() {
          /* No-op: this fixture observes other callbacks. */
        },
      },
    },
  });
  const result = { id: "new", kind: "sheet", title: "Data" };
  const click = () =>
    DocumentToolResult({
      isReadonly: false,
      result,
      type: "create",
    }).props.onClick({
      currentTarget: {
        getBoundingClientRect: () => ({
          height: 10,
          left: 0,
          top: 0,
          width: 10,
        }),
      },
    });
  click();
  assert.equal(artifact.documentId, "new");
  assert.equal(artifact.kind, "sheet");
  assert.equal(
    artifact.content,
    "",
    "different documents never inherit the old body"
  );
  assert.equal(shown, "document");
  artifact.content = "same body";
  click();
  assert.equal(artifact.content, "same body");
});

test("late editor and version callbacks cannot change or save the newly opened document", () => {
  const refs: any[] = [];
  let cursor = 0;
  let calls = 0;
  let writes = 0;
  let artifact = {
    boundingBox: {},
    content: "A",
    documentId: "a",
    isVisible: true,
    kind: "text",
    status: "idle",
    title: "A",
  };
  const definitions = Object.fromEntries(
    ["code", "image", "sheet", "text"].map((kind) => [
      kind,
      { content: `${kind}-content`, kind },
    ])
  );
  const modules: Record<string, unknown> = {
    "./artifact-actions": { ArtifactActions: "actions" },
    "./artifact-catalog": { artifactCatalog: () => [] },
    "./artifact-close-button": { ArtifactCloseButton: "close" },
    "./artifact-picker": { ArtifactPicker: "picker" },
    "./artifact-type-label": { ArtifactTypeLabel: "kind" },
    "./icons": { LoaderIcon: "loader" },
    "./toolbar": { Toolbar: "toolbar" },
    "./version-footer": { VersionFooter: "versions" },
    "./workspace-header": { WorkspaceHeader: "header" },
    "@/app/_components/ai-elements/artifact": { Artifact: "frame" },
    "@/app/_hooks/use-artifact": {
      useArtifact: () => ({
        artifact,
        setArtifact: (fn: any) => {
          artifact = fn(artifact);
        },
        setMetadata() {
          writes += 1;
        },
      }),
    },
    "@/app/_lib/utils": {
      cn: (...items: string[]) => items.join(" "),
      fetcher() {
        /* No-op: this fixture observes other callbacks. */
      },
    },
    "@/server/domain/document/result-table": {
      isProtectedResultTable: () => false,
      parseResultTable: () => null,
    },
    "date-fns": { formatDistance: () => "" },
    "date-fns/locale": { zhCN: {} },
    "fast-deep-equal": { __esModule: true, default: () => true },
    "framer-motion": { AnimatePresence: "presence", motion: { div: "motion" } },
    react: {
      memo: (fn: unknown) => fn,
      useCallback: (fn: unknown) => fn,
      useEffect() {
        /* No-op: this fixture observes other callbacks. */
      },
      useRef: (value: unknown) => {
        const index = cursor;
        cursor += 1;
        refs[index] ??= { current: value };
        return refs[index];
      },
      useState: (value: unknown) => [
        value === -1 ? 0 : value,
        () => {
          writes += 1;
        },
      ],
    },
    "react/jsx-runtime": { Fragment: "fragment", jsx, jsxs: jsx },
    swr: {
      __esModule: true,
      default: () => ({
        data: [{ content: artifact.content, id: artifact.documentId }],
      }),
      useSWRConfig: () => ({ mutate: () => Promise.resolve() }),
    },
    "usehooks-ts": { useWindowSize: () => ({ height: 900, width: 1280 }) },
  };
  for (const kind of ["code", "image", "sheet", "text"]) {
    modules[`@/app/_artifacts/${kind}/client`] = {
      [`${kind}Artifact`]: definitions[kind],
    };
  }
  const { Artifact } = load("app/_components/chat/artifact.tsx", modules, {
    clearTimeout,
    fetch: () => {
      calls += 1;
      return Promise.resolve({ ok: true });
    },
    setTimeout,
  });
  const render = () => {
    cursor = 0;
    return Artifact({
      chatId: "chat",
      embedded: true,
      isReadonly: false,
      messages: [],
      status: "ready",
    });
  };
  const first = render();
  const save = find(first, "text-content")?.props.onSaveContent;
  const metadata = find(first, "text-content")?.props.setMetadata;
  const version = find(first, "actions")?.props.handleVersionChange;
  assert.equal(typeof save, "function");
  artifact = { ...artifact, content: "B", documentId: "b" };
  render();
  writes = 0;
  save("late edit", false);
  version("toggle");
  metadata({ suggestions: ["old document"] });
  assert.equal(artifact.content, "B");
  assert.equal(
    calls,
    0,
    "old editor cannot initiate a request after navigation"
  );
  assert.equal(
    writes,
    0,
    "old callbacks cannot dirty or change the current viewer mode"
  );
  artifact = { ...artifact, content: "fresh A", documentId: "a" };
  render();
  save("obsolete A edit", false);
  metadata({ suggestions: ["obsolete A"] });
  version("toggle");
  assert.equal(
    artifact.content,
    "fresh A",
    "returning to the same ID does not revive old editor callbacks"
  );
  assert.equal(calls, 0);
  assert.equal(writes, 0);
});

test("workspace header has one 64px title rail and a secondary keyboard mode menu", () => {
  const { WorkspaceHeader } = load(
    "app/_components/chat/workspace-header.tsx",
    {
      "@/app/_components/ai-elements/artifact": {
        ArtifactActions: "actions",
        ArtifactClose: "close",
        ArtifactHeader: "header",
        ArtifactTitle: "title",
      },
      "@/app/_components/ui/button": { Button: "button" },
      "@/app/_components/ui/dropdown-menu": {
        DropdownMenu: "menu",
        DropdownMenuContent: "menu-content",
        DropdownMenuRadioGroup: "radio-group",
        DropdownMenuRadioItem: "radio-item",
        DropdownMenuTrigger: "menu-trigger",
      },
      "@/app/_hooks/use-workspace": {
        useWorkspace: () => ({
          close() {
            /* No-op: this fixture observes other callbacks. */
          },
          expanded: false,
          tab: "document",
          update() {
            /* No-op: this fixture observes other callbacks. */
          },
        }),
      },
      "@/app/_lib/utils": {
        cn: (...items: string[]) => items.filter(Boolean).join(" "),
      },
      "lucide-react": {},
      "react/jsx-runtime": { jsx, jsxs: jsx },
    }
  );
  const header = WorkspaceHeader({ children: "Document title" });
  assert.match(header.props.className, /h-\[64px\]/);
  assert.equal(
    header.props.children[0].props.children,
    "Document title",
    "document identity precedes the secondary view selector"
  );
  assert.equal(find(header, "radio-group")?.props.value, "document");
});

test("browser tool activity never displaces a visible primary document", () => {
  const shown: string[] = [];
  const refs: any[] = [];
  let cursor = 0;
  const effects: (() => void)[] = [];
  const { Workspace } = load(
    "app/_components/chat/workspace.tsx",
    {
      "./artifact-catalog": { artifactCatalog: () => [] },
      "./artifact-picker": { ArtifactPicker: "picker" },
      "./browser-workspace": { BrowserWorkspace: "browser" },
      "./conversation-sources": { ConversationSources: "sources" },
      "./workspace-header": { WorkspaceHeader: "header" },
      "@/app/_hooks/use-active-chat": {
        useActiveChat: () => ({
          chatId: "chat",
          messages: [],
          status: "streaming",
        }),
      },
      "@/app/_hooks/use-artifact": {
        useArtifact: () => ({
          artifact: { documentId: "doc", isVisible: true },
        }),
      },
      "@/app/_hooks/use-workspace": {
        useWorkspace: () => ({
          close() {
            /* No-op: this fixture observes other callbacks. */
          },
          open: true,
          show: (tab: string) => shown.push(tab),
          tab: "document",
        }),
      },
      "@/app/_lib/utils": {
        cn: (...items: string[]) => items.filter(Boolean).join(" "),
      },
      "@/server/domain/message/workspace-events": {
        browserWorkspaceEvents: () => ["call"],
      },
      "lucide-react": { FileText: "file" },
      react: {
        useEffect: (fn: () => void) => effects.push(fn),
        useRef: (value: unknown) => {
          const index = cursor;
          cursor += 1;
          refs[index] ??= { current: value };
          return refs[index];
        },
      },
      "react/jsx-runtime": { jsx, jsxs: jsx },
    },
    {
      window: {
        addEventListener() {
          /* No-op: this fixture observes other callbacks. */
        },
        removeEventListener() {
          /* No-op: this fixture observes other callbacks. */
        },
      },
    }
  );
  Workspace({ children: "document" });
  for (const effect of effects) {
    effect();
  }
  assert.deepEqual(shown, ["document"]);
});

test("readonly and historical viewers retain native export without code execution actions", () => {
  const { artifactExport } = require("../../_artifacts/export.ts");
  const { ArtifactActions } = load(
    "app/_components/chat/artifact-actions.tsx",
    {
      "../ui/tooltip": {},
      "./artifact": {
        artifactDefinitions: [
          {
            actions: [
              { description: "运行代码", id: "run-code" },
              { description: "复制代码", id: "copy" },
            ],
            kind: "code",
          },
        ],
      },
      "./create-artifact": { isArtifactActionActive: () => false },
      "@/app/_artifacts/export": { artifactExport },
      "@/app/_lib/utils": { cn: (...items: string[]) => items.join(" ") },
      "lucide-react": { Download: "download" },
      react: {
        memo: (fn: unknown) => fn,
        useCallback: (fn: unknown) => fn,
        useState: (value: unknown) => [value, () => null],
      },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      sonner: {},
    }
  );
  const tree = ArtifactActions({
    artifact: { content: "print(1)", kind: "code", status: "idle" },
    isReadonly: true,
    layout: "header",
  });
  const actions = tree.props.children
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .map((node: Node) => node.props.action.description);
  assert.deepEqual(Array.from(actions), ["导出产物", "复制代码"]);
});

test("historical preview cards never rewrite the active document's animation bounds", () => {
  const effects: (() => void)[] = [];
  let writes = 0;
  const { DocumentPreview } = load(
    "app/_components/chat/document-preview.tsx",
    {
      "./artifact-catalog": { artifactSwitchReason: () => null },
      "./artifact-type-label": { artifactTypeLabels: { text: "文本" } },
      "./file-symbol": { FileSymbol: "file" },
      "@/app/_hooks/use-active-chat": {
        useActiveChat: () => ({ chatId: "chat" }),
      },
      "@/app/_hooks/use-artifact": {
        useArtifact: () => ({
          artifact: { documentId: "active", kind: "code", status: "idle" },
          setArtifact: () => {
            writes += 1;
          },
        }),
      },
      "@/app/_hooks/use-workspace": {
        useWorkspace: () => ({ open: true, tab: "document" }),
      },
      "@/app/_lib/utils": {},
      "@/server/domain/document/stream-state": {},
      "fast-deep-equal": {},
      "lucide-react": {},
      react: {
        memo: (fn: unknown) => fn,
        useEffect: (fn: () => void) => effects.push(fn),
        useMemo: (fn: () => unknown) => fn(),
        useRef: () => ({
          current: {
            getBoundingClientRect: () => ({
              height: 60,
              width: 200,
              x: 100,
              y: 100,
            }),
          },
        }),
      },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      sonner: {
        toast: {
          error() {
            /* This read-only test never opens a card. */
          },
        },
      },
      swr: {
        __esModule: true,
        default: () => ({
          data: [{ id: "historical", kind: "text", title: "Old" }],
        }),
      },
    }
  );
  DocumentPreview({
    isReadonly: false,
    result: { id: "historical", kind: "text", title: "Old" },
  });
  for (const effect of effects) {
    effect();
  }
  assert.equal(writes, 0);
});

test("late text suggestions initialization and streaming retain unsaved-document metadata", async () => {
  let complete: (value: unknown[]) => void = () => undefined;
  let metadata: Record<string, any> = {
    documentPendingChanges: false,
    other: "kept",
  };
  const module = load("app/_artifacts/text/client.tsx", {
    "../actions": {
      getSuggestions: () =>
        new Promise<unknown[]>((resolve) => {
          complete = resolve;
        }),
    },
    "@/app/_components/chat/create-artifact": {
      Artifact: class {
        constructor(configuration: object) {
          Object.assign(this, configuration);
        }
      },
    },
    "@/app/_components/chat/diffview": {},
    "@/app/_components/chat/document-skeleton": {},
    "@/app/_components/chat/icons": {},
    "@/app/_components/chat/text-editor": {},
    "react/jsx-runtime": { jsx, jsxs: jsx },
    sonner: { toast: {} },
  });
  const setMetadata = (update: any) => {
    metadata = typeof update === "function" ? update(metadata) : update;
  };
  const pending = module.textArtifact.initialize({
    documentId: "doc",
    setMetadata,
  });
  metadata.documentPendingChanges = true;
  complete([{ id: "first" }]);
  await pending;
  assert.equal(metadata.documentPendingChanges, true);
  assert.equal(metadata.other, "kept");
  module.textArtifact.onStreamPart({
    setMetadata,
    streamPart: { data: { id: "second" }, type: "data-suggestion" },
  });
  assert.equal(metadata.documentPendingChanges, true);
  assert.equal(metadata.suggestions.length, 2);
});
