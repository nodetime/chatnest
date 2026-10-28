import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasPendingInteraction } from "@/server/domain/message/agent-interactions";
import {
  activityDisplayState,
  activitySummary,
  groupActivityParts,
  initialActivityDisclosure,
  reconcileActivityDisclosure,
} from "./activity-groups";

function client(code: string) {
  return execFileSync(process.execPath, ["--import", "tsx", "-e", code], {
    encoding: "utf8",
    env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
  });
}
const harness = `
 const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
 const jsx=(type,props,key)=>({type,props,key});
 const load=(file,mods)=>{const out={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:out.exports,module:out,process:{env:{}},require:n=>mods[n]??require(n)});return out.exports};
 const nodes=t=>{const r=[];const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(n&&typeof n==='object'){r.push(n);walk(n.props?.children)}};walk(t);return r};
 const base={'./activity-groups':require('./app/_components/chat/activity-groups.ts'),'react/jsx-runtime':{jsx,jsxs:jsx},react:{useCallback:fn=>fn,useRef:()=>({current:null})},'@/app/_lib/utils':{cn:()=>'',sanitizeText:t=>t},'../ai-elements/message':{MessageContent:'content',MessageResponse:'response'},'../ai-elements/shimmer':{Shimmer:'shimmer'},'../ai-elements/tool':{},'./activity-group':{ActivityGroup:'activity'},'./data-stream-provider':{useDataStream:()=>({})},'./document':{DocumentToolResult:'legacy-artifact'},'./document-preview':{DocumentPreview:'artifact'},'./message-actions':{MessageActions:'actions'},'./message-reasoning':{MessageReasoning:'reasoning'},'./preview-attachment':{PreviewAttachment:'attachment'},'./tool-activity':{ToolActivity:'tool'},'./ask-user':{AskUser:'ask'},'./weather':{}};
`;

test("普通执行不自动展开，Todo 成功快照只由进度面板展示，失败记录仍可查看", () => {
  const running = {
    input: {},
    state: "input-available",
    toolCallId: "lookup",
    toolName: "lookup",
    type: "dynamic-tool",
  } as any;
  assert.equal(
    initialActivityDisclosure(activitySummary([running], true)).open,
    false
  );
  const todo = {
    input: { items: [] },
    output: {
      items: [{ id: "one", status: "in_progress", title: "核对材料" }],
    },
    state: "output-available",
    toolCallId: "plan",
    type: "tool-updateTodo",
  } as any;
  assert.equal(groupActivityParts([todo]).length, 0);
  assert.equal(
    groupActivityParts([
      { ...todo, errorText: "failed", state: "output-error" },
    ]).length,
    1
  );
  assert.equal(
    groupActivityParts([{ ...todo, output: { unexpected: true } }]).length,
    1
  );
});

test("停止时尚未生成完整的 Ask 不占用回答和审批入口", () => {
  assert.equal(
    hasPendingInteraction([
      {
        id: "a",
        parts: [
          {
            input: {},
            state: "input-streaming",
            toolCallId: "ask",
            type: "tool-askUser",
          },
        ],
        role: "assistant",
      },
    ] as any),
    false
  );
  assert.equal(
    hasPendingInteraction([
      {
        id: "a",
        parts: [
          {
            approval: { id: "approval" },
            input: {},
            state: "approval-requested",
            toolCallId: "tool",
            toolName: "write",
            type: "dynamic-tool",
          },
        ],
        role: "assistant",
      },
    ] as any),
    true
  );
  const html = client(
    `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {AskUser}=require('./app/_components/chat/ask-user.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(AskUser,{messageId:'a',part:{type:'tool-askUser',toolCallId:'ask',state:'input-streaming',input:{}},isRunning:false,onAnswer:async()=>{}})));`
  );
  assert.match(html, /提问已中断/);
  assert.doesNotMatch(html, /正在整理|<form/);
});

test("已回答 Ask 默认收起长表单；Todo 有界滚动和任务图标", () => {
  const html = client(
    `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {AskUser}=require('./app/_components/chat/ask-user.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(AskUser,{messageId:'a',part:{type:'tool-askUser',toolCallId:'ask',state:'output-available',input:{title:'选择范围',questions:[{id:'scope',label:'范围',type:'text',required:true}]},output:{status:'answered',answers:{scope:'我的选择'}}},onAnswer:async()=>{}})));`
  );
  assert.match(html, /<details[^>]*data-testid="ask-answer-summary"/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:[\s=>])/);
  assert.match(html, /我的选择/);
  const todo = readFileSync(
    new URL("./task-progress.tsx", import.meta.url),
    "utf8"
  );
  assert.match(todo, /ListTodo/);
  assert.match(todo, /overflow-y-auto/);
  assert.match(todo, /break-words/);
});

test("原生文档和建议工具失败或停止使用统一状态，不显示永久加载或裸参数", () => {
  client(`${harness}
    const {PreviewMessage}=load('app/_components/chat/message.tsx',base);
    for(const type of ['tool-createDocument','tool-updateDocument','tool-requestSuggestions']){
      for(const state of ['output-error','input-available']){
        const tree=PreviewMessage({message:{id:'a',role:'assistant',parts:[{type,toolCallId:type,state,input:{title:'报告',id:'id'},errorText:state==='output-error'?'failure':undefined}]},isLoading:false,isReadonly:false});
        assert.equal(nodes(tree).filter(n=>n.type==='tool').length,1,type+' '+state);
        assert.equal(nodes(tree).filter(n=>n.type==='artifact').length,0);
      }
    }
  `);
});

test("消息里的产物卡片与选择器共用未保存保护，同文件重开保留草稿", () => {
  client(`${harness}
    let artifact={documentId:'a',content:'unsaved',status:'idle',isVisible:true,boundingBox:{width:1,height:1,left:0,top:0},kind:'text',title:'A'},metadata={},shown=0,warnings=0;
    const react={memo:fn=>fn,useCallback:fn=>fn,useMemo:fn=>fn(),useRef:()=>({current:null})};
    const {DocumentPreview}=load('app/_components/chat/document-preview.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},react,'fast-deep-equal':()=>false,'lucide-react':{},swr:{__esModule:true,default:()=>({data:[],isLoading:false})},'@/app/_hooks/use-active-chat':{useActiveChat:()=>({chatId:'chat'})},'@/app/_hooks/use-artifact':{useArtifact:()=>({artifact,metadata,setArtifact:fn=>artifact=fn(artifact)})},'@/app/_hooks/use-workspace':{useWorkspace:()=>({open:false,show:()=>shown++})},'@/app/_lib/utils':{},'./artifact-type-label':{artifactTypeLabels:{text:'文档'}},'./file-symbol':{},'./artifact-catalog':require('./app/_components/chat/artifact-catalog.ts'),'@/server/domain/document/stream-state':require('./server/domain/document/stream-state.ts'),sonner:{toast:{error:()=>warnings++}}});
    const click=(id)=>{const tree=DocumentPreview({isReadonly:false,result:{id,title:id,kind:'text'}});const hit=nodes(tree).find(n=>n.type?.name==='PureHitboxLayer');const button=hit.type(hit.props);button.props.onClick({currentTarget:{getBoundingClientRect:()=>artifact.boundingBox}})};
    for(const flag of ['documentPendingChanges','resultTablePendingChanges']){metadata={[flag]:true};click('b');assert.equal(artifact.documentId,'a');assert.equal(artifact.content,'unsaved');}
    metadata={};artifact.status='streaming';click('b');assert.equal(artifact.documentId,'a');
    artifact.status='idle';metadata={documentPendingChanges:true};click('a');assert.equal(artifact.content,'unsaved');assert.equal(shown,1);
    metadata={};click('b');assert.equal(artifact.documentId,'b');assert.equal(artifact.content,'');assert.equal(warnings,3);
  `);
});

test("真实 SDK 中 Ask 提交后 Stop 根据落库证据区分已保存和未确认，不自动重跑", () => {
  const output = client(`${harness}
    (async()=>{const {Chat}=require('@ai-sdk/react');const {validateAskUserOutput,hasSavedAskResponse}=require('./server/domain/message/agent-interactions.ts');
    for(const confirmed of [false,true]){
      let started,reads=0,requests=0;const begun=new Promise(r=>started=r);
      const output={status:'answered',answers:{scope:'自定义答案'}};const input={title:'选择范围',questions:[{id:'scope',label:'范围',type:'text',required:true}]};
      const stored={id:'a',role:'assistant',parts:[{type:'tool-askUser',toolCallId:'ask',state:confirmed?'output-available':'input-available',input,...(confirmed?{output}:{})}]};
      const origin=new Chat({id:'chat',messages:[{...stored,parts:[{...stored.parts[0],state:'input-available'}]}],transport:{sendMessages:async req=>{requests++;return new ReadableStream({start(c){started();req.abortSignal.addEventListener('abort',()=>c.error(new DOMException('Stopped','AbortError')),{once:true})}})},reconnectToStream:async()=>null}});
      const gate={chatId:'chat',released:false,revision:0,paused:false,answerPending:false,manual:false};const source=fs.readFileSync('app/_hooks/use-active-chat.tsx','utf8');const snippet=source.slice(source.indexOf('  const answerAskUser = useCallback('),source.indexOf('  const reviseAskUser = useCallback(')).replace('const answerAskUser','globalThis.answerAskUser');
      const context={activeInstance:origin,chatId:'chat',chatInstanceRef:{current:origin},interactionGate:{current:gate},isReadonly:false,useCallback:fn=>fn,setPausedChatId(){},validateAskUserOutput,hasSavedAskResponse,fetchWithErrorHandlers:async()=>{reads++;return {json:async()=>({messages:[stored]})}},process:{env:{}},AbortSignal};
      vm.runInNewContext(ts.transpileModule(snippet,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
      const task=context.answerAskUser({messageId:'a',toolCallId:'ask',output});const observed=task.then(()=>true,()=>false);await begun;gate.paused=true;gate.revision++;await origin.stop();assert.equal(await observed,confirmed);assert.equal(reads,1);assert.equal(requests,1);assert.equal(gate.answerPending,false);
    }process.stdout.write('ASK_STOP_DONE');})().catch(e=>{console.error(e);process.exitCode=1});
  `);
  assert.match(output, /ASK_STOP_DONE/);
});

test("人工展开工具过程后完成不收走内容，新增审批仍主动显露", () => {
  const active = {
    input: {},
    state: "input-available",
    toolCallId: "read",
    toolName: "read",
    type: "dynamic-tool",
  } as any;
  const summary = activitySummary([active], true);
  const selected = {
    ...initialActivityDisclosure(summary),
    manual: true,
    open: true,
  };
  assert.equal(
    reconcileActivityDisclosure(
      selected,
      activitySummary([{ ...active, output: {}, state: "output-available" }])
    ).open,
    true
  );
  const closed = { ...selected, open: false };
  assert.equal(
    reconcileActivityDisclosure(
      closed,
      activitySummary([
        { ...active, approval: { id: "new" }, state: "approval-requested" },
      ])
    ).open,
    true
  );
});

test("原生文档返回 error 是失败，而 MCP 的同名字段仍保持源数据语义", () => {
  for (const type of [
    "tool-updateDocument",
    "tool-requestSuggestions",
    "tool-createResultTable",
  ]) {
    const part = {
      input: {},
      output: { error: "Document not found" },
      state: "output-available",
      toolCallId: type,
      type,
    } as any;
    assert.equal(activityDisplayState(part), "output-error");
    assert.equal(initialActivityDisclosure(activitySummary([part])).open, true);
  }
  const external = {
    input: {},
    output: { error: "provider evidence" },
    state: "output-available",
    toolCallId: "external",
    toolName: "updateDocument",
    type: "dynamic-tool",
  } as any;
  assert.equal(activityDisplayState(external), "output-available");
});

test("Ask 本地结果尚未确认保存时显示待确认，而不是已回答", () => {
  const output = client(`${harness}
    (async()=>{let slots=[],cursor=0;const react={useId:()=> 'ask-form',useCallback:fn=>fn,useRef:initial=>{const i=cursor++;return slots[i]??(slots[i]={current:initial})},useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value]}};
    const {AskUser}=load('app/_components/chat/ask-user.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},react,'@/app/_components/ai-elements/question':{Question:'question',QuestionInput:'input',QuestionActions:'actions'},'@/app/_components/ui/button':{Button:'button'}});
    let props={messageId:'a',part:{type:'tool-askUser',toolCallId:'ask',state:'input-available',input:{title:'范围',questions:[{id:'scope',label:'范围',type:'text',required:true}]}},onAnswer:async response=>{props={...props,part:{...props.part,state:'output-available',output:response.output}};throw Error('not acknowledged')},onRevise:async()=>{}};
    const render=()=>{cursor=0;return AskUser(props)};let tree=render();nodes(tree).find(n=>n.type==='question').props.onValueChange({text:'保留答案',selectedValues:[]});tree=render();await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=render();assert.match(JSON.stringify(tree),/提交待确认/);assert.ok(!nodes(tree).some(n=>n.type==='button'&&n.props.children==='修改回答'));assert.ok(nodes(tree).some(n=>n.type==='button'&&n.props.children==='重试提交'));assert.match(JSON.stringify(tree),/保留答案/);process.stdout.write('ACK_UI_DONE')})().catch(e=>{console.error(e);process.exitCode=1});
  `);
  assert.match(output, /ACK_UI_DONE/);
});
