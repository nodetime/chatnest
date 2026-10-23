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
    for(const guard of [{isContentDirty:true},{status:'streaming'},{resultTablePendingChanges:true}]){
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

test("result-table publishes authoritative view/notes dirty and saving state; failures stay blocked and successful saves release", () => {
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
    const helpers = require('./lib/artifacts/result-table.ts');
    const jsx = (type,props) => ({type,props});
    const slots=[];let cursor=0,effects=[],pending=[],resolveFetch,bodySent,table;
    const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
    const react={useMemo:fn=>fn(),useState:initial=>{const index=cursor++;if(!slots[index])slots[index]={value:initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value}]},useEffect:(fn,deps)=>{const index=cursor++;const slot=slots[index]??(slots[index]={});if(!same(slot.deps,deps)){slot.deps=deps;effects.push(()=>{slot.cleanup?.();slot.cleanup=fn()})}}};
    const modules={
      react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{},'next-themes':{useTheme:()=>({resolvedTheme:'light'})},
      'react-data-grid':{__esModule:true,default:'grid'},'react-data-grid/lib/styles.css':{},
      '@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/textarea':{Textarea:'textarea'},
      '@/components/ui/collapsible':{Collapsible:'collapsible',CollapsibleContent:'collapse-content',CollapsibleTrigger:'collapse-trigger'},
      '@/components/ui/sheet':{Sheet:'sheet',SheetClose:'sheet-close',SheetContent:'sheet-content',SheetDescription:'sheet-description',SheetHeader:'sheet-header',SheetTitle:'sheet-title'},
      '@/lib/artifacts/result-table':helpers,'./result-table-source':{ResultTableSource:'source'},
    };
    const output={exports:{}};
    const code=ts.transpileModule(readFileSync('components/chat/result-table.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    runInNewContext(code,{exports:output.exports,module:output,process:{env:{}},setTimeout,URL,Blob,fetch:(_url,options)=>{bodySent=JSON.parse(options.body);return new Promise(resolve=>{resolveFetch=resolve})},require:name=>{assert.ok(name in modules,'unexpected '+name);return modules[name]}});
    const publish=value=>pending.push(value);
    const source={serverId:'fixture',serverName:'Fixture',toolName:'fixture__search',toolCallId:'call',timeBasis:'tool-completed',recordedAt:'2026-10-23T00:00:00.000Z'};
    const baseline=()=>({chatId:'chat',columns:[{label:'Title',path:'/title'}],notes:'',rows:[{title:'Original evidence'}],source,view:{filter:'',sort:[],visibleColumns:['/title']}});
    table=baseline();
    const evidence=JSON.stringify(table.rows);
    let props={};
    const render=()=>{cursor=0;effects=[];const tree=output.exports.ResultTableView({table,documentId:'document-a',expectedVersion:'2026-10-23T00:00:00.000Z',onPendingChange:publish,onSaved:content=>{table={...table,...JSON.parse(content)}},...props});effects.forEach(fn=>fn());return tree};
    const find=(tree,predicate)=>{const found=[];const walk=node=>{if(Array.isArray(node)){node.forEach(walk);return}if(!node||typeof node!=='object')return;if(predicate(node))found.push(node);walk(node.props?.children)};walk(tree);return found};
    const saveButton=tree=>find(tree,node=>node.type==='button'&&Array.isArray(node.props.children)&&node.props.children.some(text=>typeof text==='string'&&/保存/.test(text)))[0];
    (async()=>{
      let tree=render();assert.equal(pending.at(-1),false,'clean table publishes unlocked');
      find(tree,node=>node.props?.['aria-label']==='筛选结果')[0].props.onChange({target:{value:'Original'}});
      tree=render();assert.equal(pending.at(-1),true,'actual view filter change blocks chooser');
      let save=saveButton(tree).props.onClick();tree=render();assert.equal(pending.at(-1),true,'in-flight save stays blocked');
      assert.equal(bodySent.expectedVersion,'2026-10-23T00:00:00.000Z');assert.equal(bodySent.id,'document-a');
      resolveFetch({ok:true,json:async()=>[{content:JSON.stringify({view:bodySent.view,notes:bodySent.notes})}]});await save;
      tree=render();assert.equal(pending.at(-1),false,'successful rebaseline releases chooser');
      for(const status of [409,500]){
        find(tree,node=>node.type==='textarea')[0].props.onChange({target:{value:'Pending note '+status}});tree=render();assert.equal(pending.at(-1),true,'actual note edit blocks chooser');
        save=saveButton(tree).props.onClick();render();resolveFetch({ok:false,status,json:async()=>({})});await save;tree=render();
        assert.equal(pending.at(-1),true,'failed/CAS-conflicted edits stay blocked');assert.ok(find(tree,node=>node.props?.role==='alert').length);
      }
      for(const mode of [{readOnly:true},{inline:true}]){props=mode;render();assert.equal(pending.at(-1),false,'readonly/history or inline preview never invents a pending-save lock')}
      props={};render();assert.equal(pending.at(-1),true);for(const slot of slots)slot.cleanup?.();assert.equal(pending.at(-1),false,'unmount releases its original lock');
      assert.equal(JSON.stringify(table.rows),evidence,'pending projection never changes evidence');
    })().catch(error=>{console.error(error);process.exitCode=1});
  `,
    ],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } }
  );
});

test("table pending projection is composed through the existing sheet renderer and file picker", () => {
  const content = readFileSync("components/chat/create-artifact.tsx", "utf8");
  assert.match(content, /onResultTablePendingChange\?:/);
  const sheet = readFileSync("artifacts/sheet/client.tsx", "utf8");
  assert.match(sheet, /onPendingChange=\{onResultTablePendingChange\}/);
  const picker = readFileSync("components/chat/artifact-picker.tsx", "utf8");
  assert.match(picker, /resultTablePendingChanges/);
  const artifact = readFileSync("components/chat/artifact.tsx", "utf8");
  assert.match(
    artifact,
    /onResultTablePendingChange=\{handleResultTablePendingChange\}/
  );
});

test("actual artifact callback scopes pending metadata to the originating document and ignores late table notifications", () => {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `
    const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {runInNewContext}=require('node:vm');const ts=require('typescript');
    const jsx=(type,props)=>({type,props});const refs=[];let cursor=0;
    let artifact={documentId:'a',title:'Table A',kind:'sheet',content:'protected table',status:'idle',isVisible:true,boundingBox:{}};
    const metadata=new Map([['a',{other:'preserved-a'}],['b',{other:'preserved-b'}]]);
    const definitions=Object.fromEntries(['code','image','sheet','text'].map(kind=>[kind,{kind,content:kind+'-content'}]));
    const modules={
      'react':{memo:fn=>fn,useState:initial=>[initial,()=>{}],useCallback:fn=>fn,useEffect:()=>{},useRef:initial=>{const index=cursor++;return refs[index]??(refs[index]={current:initial})}},
      'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'date-fns':{formatDistance:()=>''},'date-fns/locale':{zhCN:{}},'fast-deep-equal':{__esModule:true,default:()=>true},'framer-motion':{AnimatePresence:'presence',motion:{div:'motion'}},
      'swr':{__esModule:true,default:()=>({}),useSWRConfig:()=>({mutate:async()=>{}})},'usehooks-ts':{useWindowSize:()=>({width:1280,height:900})},
      '@/artifacts/code/client':{codeArtifact:definitions.code},'@/artifacts/image/client':{imageArtifact:definitions.image},'@/artifacts/sheet/client':{sheetArtifact:definitions.sheet},'@/artifacts/text/client':{textArtifact:definitions.text},
      '@/components/ai-elements/artifact':{Artifact:'frame'},
      '@/hooks/use-artifact':{useArtifact:()=>{const id=artifact.documentId;return {artifact,setArtifact:()=>{},metadata:metadata.get(id),setMetadata:fn=>metadata.set(id,fn(metadata.get(id)))}}},
      '@/lib/artifacts/result-table':{isProtectedResultTable:()=>true},'@/lib/utils':{cn:()=>'',fetcher:()=>{}},
      './artifact-actions':{ArtifactActions:'actions'},'./artifact-catalog':{artifactCatalog:()=>[]},'./artifact-close-button':{ArtifactCloseButton:'close'},'./artifact-picker':{ArtifactPicker:'picker'},'./artifact-type-label':{ArtifactTypeLabel:'kind'},'./icons':{LoaderIcon:'loader'},'./toolbar':{Toolbar:'toolbar'},'./version-footer':{VersionFooter:'versions'},'./workspace-header':{WorkspaceHeader:'header'},
    };
    const output={exports:{}};const code=ts.transpileModule(readFileSync('components/chat/artifact.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    runInNewContext(code,{exports:output.exports,module:output,process:{env:{}},require:name=>{assert.ok(name in modules,'unexpected '+name);return modules[name]}});
    const find=(tree,predicate)=>{if(Array.isArray(tree)){for(const node of tree){const hit=find(node,predicate);if(hit)return hit}return}if(!tree||typeof tree!=='object')return;if(predicate(tree))return tree;return find(tree.props?.children,predicate)};
    const render=()=>{cursor=0;return output.exports.Artifact({chatId:'chat',messages:[],embedded:true,isReadonly:false,status:'ready'})};
    const callbackA=find(render(),node=>node.type==='sheet-content').props.onResultTablePendingChange;
    assert.equal(typeof callbackA,'function');callbackA(true);
    assert.equal(metadata.get('a').resultTablePendingChanges,true);assert.equal(metadata.get('a').other,'preserved-a');
    assert.equal(find(render(),node=>node.type==='picker').props.resultTablePendingChanges,true,'real metadata locks the composed picker');
    artifact={...artifact,documentId:'b',title:'Table B'};
    const callbackB=find(render(),node=>node.type==='sheet-content').props.onResultTablePendingChange;
    callbackA(false);callbackA(true);
    assert.equal(metadata.get('b').resultTablePendingChanges,undefined,'old callback cannot lock or unlock new document');
    callbackB(true);assert.equal(metadata.get('b').resultTablePendingChanges,true);callbackB(false);assert.equal(metadata.get('b').resultTablePendingChanges,false);assert.equal(metadata.get('b').other,'preserved-b');
    const tree=render();const picker=find(tree,node=>node.type==='picker');assert.equal(picker.props.resultTablePendingChanges,false);
  `,
    ],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } }
  );
});
