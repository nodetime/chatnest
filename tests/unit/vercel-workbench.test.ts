import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
function feature(file: string) {
  assert.ok(existsSync(file), `Missing workbench feature: ${file}`);
  return require(`../../${file}`);
}
const uuid = (id: string) =>
  `10000000-0000-4000-8000-${Buffer.from(id).toString("hex").slice(0, 12).padEnd(12, "0")}`;
const native = (
  id: string,
  title = id,
  type = "tool-createDocument",
  extra = {}
) => ({
  output: { id: uuid(id), kind: "text", title, ...extra },
  state: "output-available",
  toolCallId: id,
  type,
});
const messages = (parts: unknown[]) => [
  { id: "message", parts, role: "assistant" },
];

test("artifact collection accepts successful native outputs only, deduplicating latest names in first-seen order", () => {
  const { artifactCatalog } = feature("components/chat/artifact-catalog.ts");
  const input = messages([
    native("a", "First"),
    native("b", "Code", "tool-createDocument", { kind: "code" }),
    native("a", "Renamed", "tool-updateDocument"),
    native("table", "Rows", "tool-createResultTable", { kind: "sheet" }),
    native("dynamic", "Fake", "dynamic-tool"),
    native("mcp", "Fake", "tool-fixture__createDocument"),
    native("error", "Error", "tool-createDocument", { error: "failed" }),
    native("bad-kind", "Bad", "tool-createDocument", { kind: "binary" }),
    native("empty", "Empty", "tool-createDocument", { id: "" }),
    native("spaces", "Spaces", "tool-createDocument", { id: "  " }),
    native("query", "Query", "tool-createDocument", { id: "bad&chatId=other" }),
    native("coercion", "Kind", "tool-createDocument", { kind: ["text"] }),
    native("whitespace", "  "),
    { ...native("pending"), state: "input-available" },
    { ...native("denied"), state: "output-denied" },
  ]);
  const snapshot = JSON.stringify(input);
  assert.deepEqual(artifactCatalog(input), [
    { id: uuid("a"), kind: "text", title: "Renamed" },
    { id: uuid("b"), kind: "code", title: "Code" },
    { id: uuid("table"), kind: "sheet", title: "Rows" },
  ]);
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(artifactCatalog(messages([])), []);
  assert.deepEqual(artifactCatalog(messages([native("new-chat")])), [
    { id: uuid("new-chat"), kind: "text", title: "new-chat" },
  ]);
});

test("selection guards derive from actual streaming and unsaved editor state", () => {
  const { artifactSwitchReason } = feature(
    "components/chat/artifact-catalog.ts"
  );
  assert.equal(
    artifactSwitchReason({ isContentDirty: false, status: "idle" }),
    null
  );
  assert.match(
    artifactSwitchReason({ isContentDirty: true, status: "idle" }),
    /保存/
  );
  assert.match(
    artifactSwitchReason({ isContentDirty: false, status: "streaming" }),
    /生成/
  );
});

test("title projects native live title then persisted title then real first user text, never model or tool data", () => {
  const { projectChatTitle } = feature("components/chat/chat-title.ts");
  const input = [
    { parts: [{ text: "not a title", type: "text" }], role: "assistant" },
    { parts: [{ text: "  First\n question  ", type: "text" }], role: "user" },
  ];
  assert.equal(
    projectChatTitle({
      liveTitle: "Live",
      messages: input,
      persistedTitle: "Saved",
    }),
    "Live"
  );
  assert.equal(
    projectChatTitle({ messages: input, persistedTitle: "Saved" }),
    "Saved"
  );
  assert.equal(
    projectChatTitle({ messages: input, persistedTitle: "  " }),
    "First question"
  );
  assert.equal(
    projectChatTitle({ messages: messages([native("a")]) }),
    "新对话"
  );
  assert.equal(projectChatTitle({ messages: [] }), "新对话");
});

test("actual upstream primitives own task, artifact header and one keyed conversation scroller", () => {
  const activity = readFileSync("components/chat/activity-group.tsx", "utf8");
  assert.match(activity, /<Task[\s>]/);
  assert.match(activity, /<TaskTrigger/);
  const html = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {Task,TaskTrigger}=require('./components/ai-elements/task.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(Task,null,React.createElement(TaskTrigger,{title:'Native task'}))));`,
    ],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } }
  );
  assert.match(html, /<button[^>]+type="button"/);
  assert.match(html, /Native task/);
  const source = readFileSync("components/chat/messages.tsx", "utf8");
  assert.match(source, /<Conversation[\s\S]*?key=\{chatId\}/);
  assert.match(source, /<ConversationContent/);
  assert.match(source, /<ConversationScrollButton/);
  assert.doesNotMatch(
    source,
    /useMessages|messagesContainerRef|overflow-y-auto/
  );
  const header = readFileSync("components/chat/chat-header.tsx", "utf8");
  assert.match(header, /chatTitle/);
  assert.doesNotMatch(header, /ModelSelectorCompact/);
  const input = readFileSync("components/chat/multimodal-input.tsx", "utf8");
  assert.match(input, /<PromptInputBody/);
  assert.match(input, /<PromptInputHeader/);
  assert.match(
    input,
    /<PromptInputFooter[\s\S]*?<ModelSelectorCompact[\s\S]*?onModelChange=\{onModelChange\}/
  );
  const workspace = readFileSync("components/chat/workspace.tsx", "utf8");
  assert.doesNotMatch(workspace, /role="tablist"/);
  assert.match(
    workspace,
    /workspace\.tab !== "document" \|\| artifact\.documentId === "init"/
  );
  const artifact = readFileSync("components/chat/artifact.tsx", "utf8");
  assert.match(artifact, /<WorkspaceHeader/);
  assert.match(artifact, /isContentDirty=\{isContentDirty\}/);
  assert.match(artifact, /<ArtifactFrame/);
});

test("workspace chrome has one aligned top row and exposes existing action labels on wide screens", () => {
  const header = readFileSync("components/chat/workspace-header.tsx", "utf8");
  const chat = readFileSync("components/chat/chat-header.tsx", "utf8");
  const sidebar = readFileSync("components/chat/app-sidebar.tsx", "utf8");
  for (const source of [header, chat, sidebar]) {
    assert.match(source, /\bh-16\b/);
  }
  const actions = readFileSync("components/chat/artifact-actions.tsx", "utf8");
  assert.match(actions, /action.label \?\? action.description/);
  assert.match(actions, /hidden lg:inline/);
  assert.match(actions, /aria-label=\{action.description\}/);
});

test("real picker event handlers reopen the same file, reset new-file content and block dirty or streaming switches", () => {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `
    const assert = require('node:assert/strict');
    const { readFileSync } = require('node:fs');
    const { runInNewContext } = require('node:vm');
    const ts = require('typescript');
    const { openArtifactPreview } = require('./lib/artifacts/stream-state.ts');
    const { artifactSwitchReason } = require('./components/chat/artifact-catalog.ts');
    const jsx = (type,props) => ({type,props});
    let artifact = {documentId:'a',title:'A',kind:'text',status:'idle',content:'unsaved fixture',boundingBox:{top:0,left:0,width:0,height:0},isVisible:true};
    let tab='browser', open=false;
    const modules={
      'react':{useCallback:fn=>fn}, 'react/jsx-runtime':{jsx,jsxs:jsx},
      'lucide-react':{Check:'check',ChevronsUpDown:'chevron',FileText:'file'},
      '@/components/ui/button':{Button:'button'},
      '@/components/ui/dropdown-menu':{DropdownMenu:'menu',DropdownMenuContent:'content',DropdownMenuItem:'item',DropdownMenuLabel:'label',DropdownMenuSeparator:'separator',DropdownMenuTrigger:'trigger'},
      '@/hooks/use-artifact':{useArtifact:()=>({setArtifact:fn=>{artifact=fn(artifact)}})},
      '@/hooks/use-workspace':{useWorkspace:()=>({show:next=>{tab=next;open=true}})},
      '@/lib/artifacts/stream-state':{openArtifactPreview},
      './artifact-catalog':{artifactSwitchReason}, './artifact-type-label':{ArtifactTypeLabel:'kind'},
    };
    const output={exports:{}};
    const code=ts.transpileModule(readFileSync('components/chat/artifact-picker.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    runInNewContext(code,{exports:output.exports,module:output,require:name=>{assert.ok(name in modules,'unexpected '+name);return modules[name]}});
    const entries=[{id:'a',title:'A',kind:'text'},{id:'b',title:'B',kind:'code'}];
    const find=(tree,type)=>{
      const found=[]; const walk=node=>{if(Array.isArray(node)){node.forEach(walk);return}if(!node||typeof node!=='object')return;if(node.type===type)found.push(node);walk(node.props?.children)};walk(tree);return found;
    };
    const render=extra=>output.exports.ArtifactPicker({entries,activeId:artifact.documentId,title:artifact.title,...extra});
    find(render(),'item')[0].props.onSelect();
    assert.equal(open,true);assert.equal(tab,'document');assert.equal(artifact.content,'unsaved fixture');
    const original=JSON.stringify(artifact);open=false;
    for(const guard of [{isContentDirty:true},{status:'streaming'}]){
      const tree=render(guard);
      assert.equal(find(tree,'button')[0].props.disabled,true);
      find(tree,'item')[1].props.onSelect();
      assert.equal(JSON.stringify(artifact),original,'guard must protect handler as well as disabled trigger');assert.equal(open,false);
    }
    find(render(),'item')[1].props.onSelect();
    assert.equal(artifact.documentId,'b');assert.equal(artifact.kind,'code');assert.equal(artifact.content,'');assert.equal(artifact.status,'idle');assert.equal(open,true);
    const empty=output.exports.ArtifactPicker({entries:[]});
    assert.equal(find(empty,'item').length,0,'new chats never infer global artifact membership');
    assert.equal(find(empty,'button')[0].props.disabled,true);
    const list=output.exports.ArtifactPicker({entries,list:true});
    find(list,'button')[0].props.onClick();assert.equal(artifact.documentId,'a');
  `,
    ],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } }
  );
});
