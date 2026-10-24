import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("recovery uses one normal user message, preserves evidence and blocks busy, readonly, history and unresolved approval", () => {
  clientScript(`${harness}
    (async()=>{
      const h=hooks();const {RuntimeRecovery,hasRecoverableToolFailure}=load('app/_components/chat/runtime-recovery.tsx',{...base,react:h.react});
      const failed={id:'latest',role:'assistant',parts:[{...part,state:'output-error',errorText:'original evidence'}]};
      assert.equal(hasRecoverableToolFailure(failed),true);
      for(const state of ['input-available','input-streaming','approval-responded'])assert.equal(hasRecoverableToolFailure({...failed,parts:[{...part,state,approval:{id:'a',approved:true}}]}),true);
      for(const state of ['output-denied','output-available','approval-requested'])assert.equal(hasRecoverableToolFailure({...failed,parts:[{...part,state,output:{error:'ordinary MCP data'}}]}),false);
      assert.equal(hasRecoverableToolFailure({...failed,parts:[...failed.parts,part]}),false);
      assert.equal(hasRecoverableToolFailure({...failed,parts:[{...part,type:'tool-createResultTable',state:'output-available',output:{error:'actual native failure'}}]}),true);
      const calls=[];let resolve;const original=JSON.stringify(failed);let props={message:failed,status:'ready',isReadonly:false,isLatest:true,sendMessage:value=>{calls.push(value);return new Promise(r=>resolve=r);}};
      let tree=h.render(RuntimeRecovery,props);const recover=button(tree,'让 Agent 继续处理');assert.ok(recover);
      const pending=recover.props.onClick();recover.props.onClick();assert.equal(calls.length,1);
      assert.equal(calls[0].role,'user');assert.equal(calls[0].parts.length,1);assert.equal(calls[0].parts[0].type,'text');assert.match(calls[0].parts[0].text,/执行结果|副作用/);assert.match(calls[0].parts[0].text,/重新.*确认|再次.*确认/);assert.equal(JSON.stringify(failed),original);
      resolve();await pending;
      for(const extra of [{status:'streaming'},{status:'submitted'},{isReadonly:true},{isLatest:false}]){assert.equal(h.render(RuntimeRecovery,{...props,...extra}),null);}
      const retryHooks=hooks();const {RuntimeRecovery:RetryRecovery}=load('app/_components/chat/runtime-recovery.tsx',{...base,react:retryHooks.react});let attempts=0;props={...props,sendMessage:async()=>{attempts++;throw new Error('send failed');}};
      tree=retryHooks.render(RetryRecovery,props);await button(tree,'让 Agent 继续处理').props.onClick();tree=retryHooks.render(RetryRecovery,props);assert.match(JSON.stringify(tree),/请求未能发送/);await button(tree,'让 Agent 继续处理').props.onClick();assert.equal(attempts,2);
    })().then(()=>process.stdout.write('ASYNC_DONE')).catch(e=>{console.error(e);process.exitCode=1;});
  `);
});

test("Messages grants approval only to idle latest message and forwards recovery without replacing canonical previews", () => {
  clientScript(`${harness}
    const {Messages}=load('app/_components/chat/messages.tsx',{...base,'@/app/_components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'content',ConversationScrollButton:'scroll'},'@/server/agent/message-turn':{prepareRegeneration:()=>false},'./data-stream-provider':{useDataStream:()=>({})},'./greeting':{Greeting:'greeting'},'./message':{PreviewMessage:'message',ThinkingMessage:'thinking'},'./runtime-recovery':{RuntimeRecovery:'recovery'}});
    const messages=[{id:'old',role:'assistant',parts:[part]},{id:'latest',role:'assistant',parts:[{...part,state:'output-error'}]}];const sendMessage=()=>{};
    const props={messages,chatId:'chat',status:'ready',isReadonly:false,sendMessage};
    let tree=Messages(props);let previews=nodes(tree).filter(n=>n.type==='message');assert.equal(previews[0].props.canApprove,false);assert.equal(previews[1].props.canApprove,true);assert.equal(previews[0].key,'old');assert.equal(previews[1].props.message,messages[1]);
    const recovery=nodes(tree).find(n=>n.type==='recovery');assert.equal(recovery.props.message,messages[1]);assert.equal(recovery.props.sendMessage,sendMessage);
    for(const extra of [{status:'submitted'},{status:'streaming'},{isReadonly:true}]){tree=Messages({...props,...extra});previews=nodes(tree).filter(n=>n.type==='message');assert.ok(previews.every(n=>n.props.canApprove===false));}
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

test("actual SDK resolved transport failure retains failed evidence and recovery user request for the existing notice", () => {
  clientScript(`${harness}
    (async()=>{
      const {Chat}=require('@ai-sdk/react');
      const failed={id:'latest',role:'assistant',parts:[{...part,state:'output-error',errorText:'original evidence'}]};
      const chat=new Chat({id:'offline',messages:[failed],transport:{sendMessages:async()=>{throw new Error('offline transport fixture');},reconnectToStream:async()=>null}});
      const h=hooks();const {RuntimeRecovery}=load('app/_components/chat/runtime-recovery.tsx',{...base,react:h.react});
      const props={message:failed,status:'ready',isReadonly:false,isLatest:true,sendMessage:chat.sendMessage};
      const tree=h.render(RuntimeRecovery,props);await button(tree,'让 Agent 继续处理').props.onClick();
      assert.equal(chat.status,'error');assert.equal(chat.error.message,'offline transport fixture');assert.equal(JSON.stringify(chat.messages[0]),JSON.stringify(failed));
      const lastUser=chat.messages.findLast(m=>m.role==='user');assert.match(lastUser.parts[0].text,/不要盲目重复操作/);
      const {Messages}=load('app/_components/chat/messages.tsx',{...base,'@/app/_components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'content',ConversationScrollButton:'scroll'},'@/server/agent/message-turn':{prepareRegeneration:()=>false},'./data-stream-provider':{useDataStream:()=>({})},'./greeting':{Greeting:'greeting'},'./message':{PreviewMessage:'message',ThinkingMessage:'thinking'},'./runtime-recovery':{RuntimeRecovery:'recovery'}});
      const next=Messages({messages:chat.messages,status:chat.status,chatId:'offline',isReadonly:false,sendMessage:chat.sendMessage});assert.equal(nodes(next).filter(n=>n.type==='recovery').length,0,'SDK-appended user turn unmounts prior recovery instead of leaving a stuck lock');
      let restored;const {ConversationNotice}=load('app/_components/chat/conversation-notice.tsx',{...base,react:h.react,'@/app/_hooks/use-active-chat':{useActiveChat:()=>({error:chat.error,clearError:()=>{}})},'./agent-library':{AgentLibrary:'library'}});
      const notice=ConversationNotice({onRestore:()=>{restored=lastUser.parts.filter(p=>p.type==='text').map(p=>p.text).join('\\n');}});assert.match(JSON.stringify(notice),/这一轮还没有完成/);button(notice,'恢复刚才的输入').props.onClick();assert.equal(restored,lastUser.parts[0].text);
    })().then(()=>process.stdout.write('ASYNC_DONE')).catch(e=>{console.error(e);process.exitCode=1;});
  `);
});

test("empty terminal assistant keeps its canonical owner without sender or answer actions, then reveals real content", () => {
  clientScript(`${harness}
    const {PreviewMessage}=load('app/_components/chat/message.tsx',{...base,react:{useCallback:fn=>fn},'@/app/_lib/utils':{cn:()=>'',sanitizeText:t=>t},'../ai-elements/message':{MessageContent:'text',MessageResponse:'response'},'../ai-elements/shimmer':{Shimmer:'shimmer'},'./activity-group':{ActivityGroup:'activity'},'./data-stream-provider':{useDataStream:()=>({})},'./document':{},'./document-preview':{DocumentPreview:'artifact'},'./message-actions':{MessageActions:'actions'},'./message-reasoning':{MessageReasoning:'reasoning'},'./preview-attachment':{PreviewAttachment:'attachment'},'./tool-activity':{ToolActivity:'tool'},'./weather':{}});
    const message={id:'empty-final',role:'assistant',parts:[{type:'step-start'},{type:'text',text:'  '},{type:'reasoning',text:''}]};
    const props={message,isLoading:false,isReadonly:false,onRegenerate:()=>{}};
    let tree=PreviewMessage(props);assert.equal(tree.type,'div');assert.equal(tree.props['data-testid'],'message-assistant');assert.equal(tree.props.hidden,true);
    assert.equal(nodes(tree).filter(n=>n.type==='actions'||n.type?.name==='SenderLabel').length,0);
    const active=PreviewMessage({...props,isLoading:true});assert.ok(!active.props.hidden);assert.ok(nodes(active).some(n=>n.type?.name==='WaitingText'));
    for(const visible of [{type:'text',text:'Actual answer'},{...part,state:'output-error',errorText:'actual failure'},{type:'file',filename:'file.txt',mediaType:'text/plain',url:'/fixture'}]){
      const revealed=PreviewMessage({...props,message:{...message,parts:[visible]}});assert.equal(revealed.type,tree.type);assert.equal(revealed.props['data-testid'],tree.props['data-testid']);assert.ok(!revealed.props.hidden);assert.ok(nodes(revealed).some(n=>n.type?.name==='SenderLabel'));
    }
  `);
});

test("conversation transport notice uses a friendly summary and preserves exact optional error details and existing actions", () => {
  clientScript(`${harness}
    const raw='An error occurred. '+ 'opaque diagnostic '.repeat(30);let restored=0,reloaded=0;let state={error:new Error(raw),clearError:()=>{},retryLoad:()=>reloaded++};
    const {ConversationNotice}=load('app/_components/chat/conversation-notice.tsx',{...base,react:{useCallback:fn=>fn},'@/app/_hooks/use-active-chat':{useActiveChat:()=>state},'./agent-library':{AgentLibrary:'library'}});
    let tree=ConversationNotice({onRestore:()=>restored++});const paragraphs=nodes(tree).filter(n=>n.type==='p');assert.ok(paragraphs.some(n=>String(n.props.children).includes('这次请求未能完成')));assert.ok(paragraphs.every(n=>!String(n.props.children).includes('An error occurred.')));
    const details=nodes(tree).find(n=>n.type==='details');assert.ok(details);assert.ok(!details.props.open);assert.equal(nodes(details).find(n=>n.type==='pre').props.children,raw);
    button(tree,'恢复刚才的输入').props.onClick();assert.equal(restored,1);
    state={...state,error:undefined,loadError:new Error(raw)};tree=ConversationNotice({onRestore:()=>restored++});assert.equal(nodes(tree).find(n=>n.type==='pre').props.children,raw);const reload=nodes(tree).find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('重新加载'));reload.props.onClick();assert.equal(reloaded,1);
  `);
});

test("persisted run failures offer guarded Agent recovery without pretending to be a tool", () => {
  clientScript(`${harness}
    const h=hooks();const {RuntimeRecovery,hasRecoverableToolFailure}=load('app/_components/chat/runtime-recovery.tsx',{...base,react:h.react});
    const failed={id:'failed-run',role:'assistant',parts:[{type:'data-run-status',id:'run-status',data:{state:'failed'}}]};
    assert.equal(hasRecoverableToolFailure(failed),true);
    assert.equal(hasRecoverableToolFailure({...failed,role:'user'}),false);
    assert.equal(hasRecoverableToolFailure({...failed,parts:[{...failed.parts[0],data:{state:'resumed'}}]}),false);
    assert.equal(hasRecoverableToolFailure({...failed,parts:[...failed.parts,part]}),false);
    const props={message:failed,status:'ready',isReadonly:false,isLatest:true,sendMessage:()=>{}};
    assert.ok(button(h.render(RuntimeRecovery,props),'让 Agent 继续处理'));
    for(const extra of [{isReadonly:true},{isLatest:false},{status:'streaming'},{status:'submitted'}])assert.equal(h.render(RuntimeRecovery,{...props,...extra}),null);
  `);
});
