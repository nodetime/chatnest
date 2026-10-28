import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

function clientScript(code: string) {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "-e", code],
    {
      encoding: "utf8",
      env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
    }
  );
  if (code.includes("ASYNC_DONE")) {
    assert.match(
      output,
      /ASYNC_DONE/,
      "async assertions must finish before the child exits"
    );
  }
  return output;
}

const harness = `
  const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
  const jsx=(type,props,key)=>({type,props,key});
  const hooks=()=>{const slots=[];let cursor=0,dirty=false;const react={useCallback:fn=>fn,useRef:initial=>{const i=cursor++;return slots[i]??(slots[i]={current:initial});},useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;dirty=true;}];}};return {react,render(fn,props){let tree;do{dirty=false;cursor=0;tree=fn(props);}while(dirty);return tree;}};};
  const load=(file,modules)=>{const output={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports:output.exports,module:output,require:name=>modules[name]??require(name)});return output.exports;};
  const nodes=tree=>{const all=[];const walk=n=>{if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;all.push(n);walk(n.props?.children);};walk(tree);return all;};
  const base={'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'@/app/_lib/utils':{cn:(...v)=>v.filter(Boolean).join(' ')},'@/app/_hooks/use-agent-info':{useAgentInfo:()=>({data:{servers:[]}})},'../ai-elements/tool':{Tool:'tool',ToolHeader:'header',ToolContent:'content'},'./tool-call-details':{ToolCallDetails:'details'},'./attachment-read-result':require('./app/_components/chat/attachment-read-result.tsx'),'./activity-groups':require('./app/_components/chat/activity-groups.ts'),'./tool-activity-state':require('./app/_components/chat/tool-activity-state.ts'),'./tool-presentation':require('./app/_components/chat/tool-presentation.ts'),'./tool-result-preview':{ToolResultPreview:'preview'}};
  const part={type:'dynamic-tool',toolName:'fixture__operation',toolCallId:'call',state:'approval-requested',input:{amount:7},approval:{id:'exact-id'}};
  const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&n.props.children===label);
`;

test("approval locks before rerender, reports rejection and retries only the same approval decision explicitly", () => {
  clientScript(`${harness}
    (async()=>{
      const h=hooks();const {ToolActivity}=load('app/_components/chat/tool-activity.tsx',{...base,react:h.react});
      const calls=[];let reject;const props={part,approve:value=>{calls.push(value);return new Promise((_,r)=>reject=r);},isReadonly:false,isRunning:false,canApprove:true};
      let tree=h.render(ToolActivity,props);const allow=button(tree,'允许执行'),deny=button(tree,'拒绝');
      const pending=allow.props.onClick();deny.props.onClick();allow.props.onClick();assert.equal(calls.length,1,'same-tick duplicate decisions are blocked');
      tree=h.render(ToolActivity,props);assert.ok(nodes(tree).filter(n=>n.type==='button').every(n=>n.props.disabled));assert.match(JSON.stringify(tree),/正在提交/);
      reject(new Error('opaque backend failure'));await pending;tree=h.render(ToolActivity,props);assert.match(JSON.stringify(tree),/确认未能提交/);assert.ok(!button(tree,'允许执行').props.disabled);
      const retry=button(tree,'拒绝').props.onClick();assert.equal(calls.length,2);assert.equal(JSON.stringify(calls[1]),JSON.stringify({approved:false,id:'exact-id',reason:'用户拒绝执行'}));reject(new Error('again'));await retry;
      for(const extra of [{isReadonly:true},{canApprove:false}]){tree=h.render(ToolActivity,{...props,...extra});const actions=nodes(tree).filter(n=>n.type==='button');assert.ok(actions.length===0||actions.every(n=>n.props.disabled));}
      tree=h.render(ToolActivity,{...props,approve:()=>{throw new Error('sync');}});await button(tree,'允许执行').props.onClick();assert.match(JSON.stringify(h.render(ToolActivity,props)),/确认未能提交/);
    })().then(()=>process.stdout.write('ASYNC_DONE')).catch(e=>{console.error(e);process.exitCode=1;});
  `);
});

test("failed tool summary separates raw error evidence and active approval suppresses group spinner", () => {
  clientScript(`${harness}
    const h=hooks();const {ToolActivity}=load('app/_components/chat/tool-activity.tsx',{...base,react:h.react});
    const failed={...part,state:'output-error',errorText:'HTTP 500 opaque trace /private/provider'};
    const tree=h.render(ToolActivity,{part:failed,approve:()=>{},isReadonly:false,isRunning:false});
    assert.match(JSON.stringify(tree),/这一步未能完成/);
    assert.ok(!nodes(tree).some(n=>n.type==='p'&&JSON.stringify(n.props.children).includes('opaque trace')));
    assert.equal(nodes(tree).find(n=>n.type==='details').props.part,failed);
    const {activitySummary}=require('./app/_components/chat/activity-groups.ts');
    assert.equal(activitySummary([part,{...part,toolCallId:'other',state:'input-available'}],true).active,false);
  `);
});

test("failed turns keep canonical previews without a separate continue action or fabricated user request", () => {
  clientScript(`${harness}
    const {Messages}=load('app/_components/chat/messages.tsx',{...base,'@/app/_components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'content',ConversationScrollButton:'scroll'},'@/server/domain/message/message-turn':{prepareRegeneration:()=>false},'./data-stream-provider':{useDataStream:()=>({})},'./greeting':{Greeting:'greeting'},'./message':{PreviewMessage:'message',ThinkingMessage:'thinking'},'./agent-pause-notice':{AgentPauseNotice:'paused'},'@/server/domain/message/agent-interactions':{hasPendingInteraction:()=>false},'./runtime-recovery':{RuntimeRecovery:'recovery'}});
    const messages=[{id:'old',role:'assistant',parts:[part]},{id:'latest',role:'assistant',parts:[{type:'data-run-status',data:{state:'failed'}}]}];
    const props={messages,chatId:'chat',status:'error',isReadonly:false,sendMessage:()=>{throw new Error('No synthetic user messages');}};
    let tree=Messages(props);let previews=nodes(tree).filter(n=>n.type==='message');assert.equal(previews[0].props.canApprove,false);assert.equal(previews[1].props.canApprove,true);assert.equal(previews[0].key,'old');assert.equal(previews[1].props.message,messages[1]);
    assert.equal(nodes(tree).filter(n=>n.type==='recovery').length,0,'No extra recovery panel beneath the assistant');
    tree=Messages({...props,suppressLatestRunFailure:true});previews=nodes(tree).filter(n=>n.type==='message');assert.equal(previews[0].props.hideRunFailure,false);assert.equal(previews[1].props.hideRunFailure,true,'transient error owns only the newest failed turn');
    for(const extra of [{status:'submitted'},{status:'streaming'},{isReadonly:true}]){tree=Messages({...props,...extra});previews=nodes(tree).filter(n=>n.type==='message');assert.ok(previews.every(n=>n.props.canApprove===false));assert.ok(!nodes(tree).some(n=>n.type==='recovery'));}
  `);
});

test("late approval rejection and stale handlers do not overwrite a replacement approval event", () => {
  clientScript(`${harness}
    (async()=>{
      const h=hooks();const {ToolActivity}=load('app/_components/chat/tool-activity.tsx',{...base,react:h.react});
      let reject;const calls=[];let props={part,approve:value=>{calls.push(value);return new Promise((_,r)=>reject=r);},isReadonly:false,isRunning:false,canApprove:true};
      let tree=h.render(ToolActivity,props);const old=button(tree,'允许执行').props.onClick;const pending=old();
      props={...props,part:{...part,approval:{id:'replacement'}}};tree=h.render(ToolActivity,props);old();assert.equal(calls.length,1,'stale handler must not submit the old approval');
      reject(new Error('old rejected'));await pending;tree=h.render(ToolActivity,props);assert.ok(!JSON.stringify(tree).includes('确认未能提交'));assert.ok(!button(tree,'允许执行').props.disabled);
      props={...props,part:{...part,state:'approval-responded',approval:{id:'exact-id',approved:true}},isRunning:true};tree=h.render(ToolActivity,props);assert.equal(nodes(tree).find(n=>n.type==='header').props.statusLabel,'执行中');
    })().then(()=>process.stdout.write('ASYNC_DONE')).catch(e=>{console.error(e);process.exitCode=1;});
  `);
});

test("empty terminal assistant keeps its canonical owner without sender or answer actions, then reveals real content", () => {
  clientScript(`${harness}
    const {PreviewMessage}=load('app/_components/chat/message.tsx',{...base,react:{useCallback:fn=>fn},'@/app/_lib/utils':{cn:()=>'',sanitizeText:t=>t},'../ai-elements/message':{MessageContent:'text',MessageResponse:'response'},'../ai-elements/shimmer':{Shimmer:'shimmer'},'./activity-group':{ActivityGroup:'activity'},'./data-stream-provider':{useDataStream:()=>({})},'./document':{},'./document-preview':{DocumentPreview:'artifact'},'./message-actions':{MessageActions:'actions'},'./message-reasoning':{MessageReasoning:'reasoning'},'./preview-attachment':{PreviewAttachment:'attachment'},'./tool-activity':{ToolActivity:'tool'},'./ask-user':{AskUser:'ask'},'./weather':{}});
    const message={id:'empty-final',role:'assistant',parts:[{type:'step-start'},{type:'text',text:'  '},{type:'reasoning',text:''}]};
    const props={message,isLoading:false,isReadonly:false,onRegenerate:()=>{}};
    let tree=PreviewMessage(props);assert.equal(tree.type,'div');assert.equal(tree.props['data-testid'],'message-assistant');assert.equal(tree.props.hidden,true);
    assert.equal(nodes(tree).filter(n=>n.type==='actions'||n.type?.name==='SenderLabel').length,0);
    const active=PreviewMessage({...props,isLoading:true});assert.ok(!active.props.hidden);assert.ok(nodes(active).some(n=>n.type?.name==='WaitingText'));
    for(const visible of [{type:'text',text:'Actual answer'},{...part,state:'output-error',errorText:'actual failure'},{type:'file',filename:'file.txt',mediaType:'text/plain',url:'/fixture'}]){
      const revealed=PreviewMessage({...props,message:{...message,parts:[visible]}});assert.equal(revealed.type,tree.type);assert.equal(revealed.props['data-testid'],tree.props['data-testid']);assert.ok(!revealed.props.hidden);assert.ok(!nodes(revealed).some(n=>n.type?.name==='SenderLabel'),'workspace title already identifies the Agent');
    }
  `);
});

test("transport failures use one compact notice, retain diagnostics and deduplicate persisted failures", () => {
  clientScript(`${harness}
    const raw='An error occurred. '+ 'opaque diagnostic '.repeat(30);let restored=0,reloaded=0;let state={messages:[],error:new Error(raw),clearError:()=>{},retryLoad:()=>reloaded++};
    const {ConversationNotice}=load('app/_components/chat/conversation-notice.tsx',{...base,react:{useCallback:fn=>fn},'@/app/_hooks/use-active-chat':{useActiveChat:()=>state},'./agent-library':{AgentLibrary:'library'}});
    let tree=ConversationNotice({onRestore:()=>restored++});const paragraphs=nodes(tree).filter(n=>n.type==='p');assert.equal(paragraphs.length,1);assert.equal(paragraphs[0].props.children,'消息未能完成');assert.ok(paragraphs.every(n=>!String(n.props.children).includes('An error occurred.')));
    const details=nodes(tree).find(n=>n.type==='details');assert.ok(details);assert.ok(!details.props.open);assert.equal(nodes(details).find(n=>n.type==='pre').props.children,raw);
    assert.ok(!nodes(tree).some(n=>n.type==='library'),'Model failures do not point to MCP configuration');
    button(tree,'恢复输入').props.onClick();assert.equal(restored,1);
    state={...state,messages:[{role:'assistant',parts:[{type:'data-run-status',data:{state:'failed'}}]}]};assert.ok(ConversationNotice({onRestore:()=>{}}),'a regenerated turn failure must retain its new diagnostics despite an old failed snapshot');
    state={...state,messages:[...state.messages,{role:'user',parts:[{type:'text',text:'My own next request'}]}]};assert.ok(ConversationNotice({onRestore:()=>{}}),'older failure cannot hide a newer send error');
    state={...state,error:undefined,loadError:new Error(raw)};tree=ConversationNotice({onRestore:()=>restored++});assert.equal(nodes(tree).find(n=>n.type==='pre').props.children,raw);const reload=nodes(tree).find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('重新加载'));reload.props.onClick();assert.equal(reloaded,1);
  `);
});

test("persisted interruption is a compact status, not a recovery instruction or button", () => {
  clientScript(`${harness}
    const {PreviewMessage}=load('app/_components/chat/message.tsx',{...base,react:{useCallback:fn=>fn},'@/app/_lib/utils':{cn:()=>'',sanitizeText:t=>t},'../ai-elements/message':{MessageContent:'text',MessageResponse:'response'},'../ai-elements/shimmer':{Shimmer:'shimmer'},'./activity-group':{ActivityGroup:'activity'},'./data-stream-provider':{useDataStream:()=>({})},'./document':{},'./document-preview':{DocumentPreview:'artifact'},'./message-actions':{MessageActions:'actions'},'./message-reasoning':{MessageReasoning:'reasoning'},'./preview-attachment':{PreviewAttachment:'attachment'},'./tool-activity':{ToolActivity:'tool'},'./ask-user':{AskUser:'ask'},'./weather':{}});
    const message={id:'failed-run',role:'assistant',parts:[{type:'data-run-status',data:{state:'failed'}}]};
    const props={message,isLoading:false,isReadonly:false};
    for(const readonly of [false,true]){const tree=PreviewMessage({...props,isReadonly:readonly});const notice=nodes(tree).find(n=>n.props?.['data-testid']==='run-failure');assert.ok(notice);assert.equal(notice.props.children,'响应中断');assert.equal(nodes(notice).filter(n=>n.type==='button').length,0);assert.doesNotMatch(JSON.stringify(tree),/继续处理|原始记录已保留|检查连接/);}
    const suppressed=PreviewMessage({...props,hideRunFailure:true});assert.equal(suppressed.props.hidden,true,'do not leave an empty error bubble');
    const running=PreviewMessage({...props,isLoading:true});assert.equal(nodes(running).filter(n=>n.props?.['data-testid']==='run-failure').length,0,'previous interruption is not shown as a new active failure');
  `);
});

test("stream errors have an inline owner instead of a duplicate toast", () => {
  const source = requireSource();
  const handler = source.slice(
    source.indexOf("onError: (streamError)"),
    source.indexOf("onFinish:")
  );
  assert.doesNotMatch(handler, /toast\(/);
  assert.match(handler, /setShowCreditCardAlert/);
});

function requireSource() {
  return readFileSync(
    new URL("../../_hooks/use-active-chat.tsx", import.meta.url),
    "utf8"
  );
}
