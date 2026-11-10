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
  const load=(file,modules)=>{const output={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports:output.exports,module:output,URL,process,require:name=>modules[name]??require(name)});return output.exports;};
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
    assert.match(JSON.stringify(tree),/本次操作未返回有效结果，完成情况尚未确认/);
    assert.ok(!nodes(tree).some(n=>n.type==='p'&&JSON.stringify(n.props.children).includes('opaque trace')));
    assert.equal(nodes(tree).find(n=>n.type==='details').props.part,failed);
    const {activitySummary}=require('./app/_components/chat/activity-groups.ts');
    assert.equal(activitySummary([part,{...part,toolCallId:'other',state:'input-available'}],true).active,false);
  `);
});

test("failed turns keep canonical previews without a separate continue action or fabricated user request", () => {
  clientScript(`${harness}
    const {Messages}=load('app/_components/chat/messages.tsx',{...base,'@/app/_components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'content',ConversationScrollButton:'scroll'},'@/server/domain/message/message-turn':{prepareRegeneration:()=>false},'./data-stream-provider':{useDataStream:()=>({})},'./greeting':{Greeting:'greeting'},'./message':{PreviewMessage:'message',ThinkingMessage:'thinking'},'@/server/domain/message/agent-interactions':{hasPendingInteraction:()=>false},'./runtime-recovery':{RuntimeRecovery:'recovery'}});
    const messages=[{id:'old',role:'assistant',parts:[part]},{id:'latest',role:'assistant',parts:[{type:'data-run-status',data:{state:'failed'}}]}];
    const props={messages,chatId:'chat',status:'error',isReadonly:false,sendMessage:()=>{throw new Error('No synthetic user messages');}};
    let tree=Messages(props);let previews=nodes(tree).filter(n=>n.type==='message');assert.equal(previews[0].props.canApprove,false);assert.equal(previews[1].props.canApprove,true);assert.equal(previews[0].key,'old');assert.equal(previews[1].props.message,messages[1]);
    assert.equal(nodes(tree).filter(n=>n.type==='recovery').length,0,'No extra recovery panel beneath the assistant');
    tree=Messages({...props,suppressLatestRunFailure:true});previews=nodes(tree).filter(n=>n.type==='message');assert.equal(previews[0].props.hideRunFailure,false);assert.equal(previews[1].props.hideRunFailure,true,'transient error owns only the newest failed turn');
    for(const extra of [{status:'submitted'},{status:'streaming'},{isReadonly:true}]){tree=Messages({...props,...extra});previews=nodes(tree).filter(n=>n.type==='message');assert.ok(previews.every(n=>n.props.canApprove===false));assert.ok(!nodes(tree).some(n=>n.type==='recovery'));}
  `);
});

test("history load failure owns the empty main area while new chat and cached history keep their usual surfaces", () => {
  clientScript(`${harness}
    const h=hooks();let state;const noop=()=>{};
    const {ChatShell}=load('app/_components/chat/shell.tsx',{
      ...base,react:{...h.react,useEffect:noop},'next/navigation':{useSearchParams:()=>new URLSearchParams()},sonner:{},
      '@/app/_components/ui/alert-dialog':{AlertDialog:'dialog',AlertDialogAction:'action',AlertDialogContent:'dialog-content',AlertDialogDescription:'description',AlertDialogFooter:'footer',AlertDialogHeader:'header',AlertDialogTitle:'title'},
      '@/app/_hooks/use-active-chat':{useActiveChat:()=>state},'@/app/_hooks/use-artifact':{useArtifact:()=>({setArtifact:noop}),useArtifactSelector:()=>false},
      '@/app/_hooks/use-workbench-navigation':{useWorkbenchNavigation:()=>({section:'chat',navigate:noop})},'@/app/_hooks/use-workspace':{useWorkspace:()=>({show:noop})},
      './artifact':{Artifact:'artifact'},'./chat-header':{ChatHeader:'chat-header'},'./conversation-notice':{ConversationNotice:'notice'},'./data-stream-handler':{DataStreamHandler:'stream'},
      './greeting':{Greeting:'greeting'},'./message-editor':{},'./messages':{Messages:'messages'},'./multimodal-input':{MultimodalInput:'composer'},
      './task-progress':{TaskProgress:'progress'},'./workbench-section':{WorkbenchSection:'section'},'./workspace':{Workspace:'workspace'},'./workspace-home':{SavedArtifactCards:'saved-artifacts'},
    });
    const initial={chatId:'history',messages:[],isLoading:false,isReadonly:false};
    const render=extra=>{state={...initial,...extra};return nodes(h.render(ChatShell));};
    const failure={loadError:new Error('history unavailable'),isReadonly:true};
    const failed=render(failure);
    const panel=failed.find(n=>n.props['data-testid']==='history-load-failure');
    assert.ok(panel,'missing history should have its own main-area recovery state');
    assert.equal(nodes(panel).filter(n=>n.type==='notice').length,1);
    assert.equal(nodes(panel).find(n=>n.type==='notice').props.standalone,true);
    assert.ok(!failed.some(n=>['messages','greeting','composer'].includes(n.type)));
    assert.ok(!failed.some(n=>n.props['data-testid']==='composer-dock'));
    const cached=render({...failure,messages:[{id:'cached'}]});
    assert.ok(cached.some(n=>n.type==='messages'));
    assert.ok(nodes(cached.find(n=>n.props['data-testid']==='composer-dock')).some(n=>n.type==='notice'));
    const fresh=render({});
    assert.ok(fresh.some(n=>n.type==='greeting')&&fresh.some(n=>n.type==='composer'));
    const recent=fresh.find(n=>n.type==='saved-artifacts');
    assert.equal(recent?.props.recent,true,'only recent files belong below the new-chat composer');
    assert.ok(fresh.findIndex(n=>n.type==='composer')<fresh.indexOf(recent));
    assert.ok(!cached.some(n=>n.type==='saved-artifacts')&&!failed.some(n=>n.type==='saved-artifacts'));
  `);
});

test("new chat shows up to three real saved files and no placeholder when none are available", () => {
  clientScript(`${harness}
    let library;const paths=[];const noop=()=>{};
    const {SavedArtifactCards}=load('app/_components/chat/workspace-home.tsx',{
      ...base,swr:{default:path=>{paths.push(path);return library;}},'next/navigation':{useRouter:()=>({push:noop})},sonner:{toast:{}},
      '@/app/_hooks/use-active-chat':{useActiveChat:()=>({chatId:'chat'})},'@/app/_hooks/use-artifact':{useArtifact:()=>({artifact:{},setArtifact:noop})},
      '@/app/_hooks/use-workbench-navigation':{useWorkbenchNavigation:()=>({navigate:noop})},'@/app/_hooks/use-workspace':{useWorkspace:()=>({show:noop})},
      '../ui/button':{Button:'ui-button'},'./artifact-catalog':{},'./artifact-type-label':{artifactTypeLabels:{sheet:'表格'}},'./file-symbol':{FileSymbol:'file-symbol'},
    });
    for(library of [{isLoading:true},{data:[]},{error:new Error('offline')}])assert.equal(SavedArtifactCards({recent:true}),null);
    assert.match(JSON.stringify(SavedArtifactCards({})),/成果暂未加载/,'the full Files view keeps its recovery action');
    library={data:Array.from({length:4},(_,i)=>({id:String(i),title:'成果 '+i,kind:'sheet'}))};
    const tree=SavedArtifactCards({recent:true});
    assert.equal(tree.props['aria-label'],'最近成果');
    assert.deepEqual(nodes(tree).filter(n=>n.type==='button').map(n=>n.props['aria-label']),['打开成果：成果 0','打开成果：成果 1','打开成果：成果 2']);
    assert.equal(nodes(SavedArtifactCards({})).filter(n=>n.type==='button').length,4);
    assert.ok(paths.every(path=>path.endsWith('/api/library')));
  `);
});

test("after a stop, partial output and the original approval remain without a second action", () => {
  clientScript(`${harness}
    const {Messages}=load('app/_components/chat/messages.tsx',{...base,'@/app/_components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'content',ConversationScrollButton:'scroll'},'@/server/domain/message/message-turn':{prepareRegeneration:()=>false},'./data-stream-provider':{useDataStream:()=>({})},'./greeting':{Greeting:'greeting'},'./message':{PreviewMessage:'message',ThinkingMessage:'thinking'},'./agent-pause-notice':{AgentPauseNotice:'paused'}});
    const partial={id:'assistant',role:'assistant',parts:[{type:'text',text:'Partial reply'},part]};
    const tree=Messages({messages:[partial],chatId:'chat',status:'ready',isReadonly:false,agentPaused:true,onContinue:()=>{throw new Error('No synthetic continuation');}});
    const rendered=nodes(tree);
    const message=rendered.find(n=>n.type==='message');
    assert.equal(message.props.message,partial);
    assert.equal(message.props.canApprove,true);
    assert.ok(!rendered.some(n=>n.type==='paused'));
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
    const finishedTool={...part,state:'output-available',output:{items:[]}};
    const between=PreviewMessage({...props,isLoading:true,message:{...message,parts:[finishedTool]}});
    assert.ok(nodes(between).some(n=>n.type?.name==='WaitingText'&&n.props.message==='正在继续处理…'));
    for(const parts of [[finishedTool,{type:'text',text:'Actual answer',state:'streaming'}],[finishedTool,{...part,state:'input-available'}],[finishedTool,part],[finishedTool,{type:'tool-askUser',toolCallId:'ask',state:'input-available',input:{title:'目标',questions:[{id:'goal',label:'目标',type:'text',required:true}]}}]]){
      const active=PreviewMessage({...props,isLoading:true,message:{...message,parts}});
      assert.ok(!nodes(active).some(n=>n.type?.name==='WaitingText'),'text, running tools and pending user decisions own their presentation');
    }
    for(const isLoading of [false]){
      const history=PreviewMessage({...props,isLoading,message:{...message,parts:[finishedTool]}});
      assert.ok(!nodes(history).some(n=>n.type?.name==='WaitingText'),'reopened history never spins');
    }
    for(const visible of [{type:'text',text:'Actual answer'},{...part,state:'output-error',errorText:'actual failure'},{type:'file',filename:'file.txt',mediaType:'text/plain',url:'/fixture'}]){
      const revealed=PreviewMessage({...props,message:{...message,parts:[visible]}});assert.equal(revealed.type,tree.type);assert.equal(revealed.props['data-testid'],tree.props['data-testid']);assert.ok(!revealed.props.hidden);assert.ok(!nodes(revealed).some(n=>n.type?.name==='SenderLabel'),'workspace title already identifies the Agent');
    }
  `);
});

test("transport failures use one compact notice, retain diagnostics and deduplicate persisted failures", () => {
  clientScript(`${harness}
    const raw='An error occurred. '+ 'opaque diagnostic '.repeat(30);let restored=0,reloaded=0;let state={messages:[],error:new Error(raw),clearError:()=>{},retryLoad:()=>reloaded++};
    const {ConversationNotice}=load('app/_components/chat/conversation-notice.tsx',{...base,react:{useCallback:fn=>fn},'@/app/_hooks/use-active-chat':{useActiveChat:()=>state},'./agent-library':{AgentLibrary:'library'}});
    let tree=ConversationNotice({attachments:[],onRestore:()=>restored++});const paragraphs=nodes(tree).filter(n=>n.type==='p');assert.equal(paragraphs.length,1);assert.equal(paragraphs[0].props.children,'消息未能完成');assert.ok(paragraphs.every(n=>!String(n.props.children).includes('An error occurred.')));
    const details=nodes(tree).find(n=>n.type==='details');assert.ok(details);assert.ok(!details.props.open);assert.equal(nodes(details).find(n=>n.type==='pre').props.children,raw);
    assert.ok(!nodes(tree).some(n=>n.type==='library'),'Model failures do not point to MCP configuration');
    button(tree,'恢复输入').props.onClick();assert.equal(restored,1);
    state={...state,messages:[{role:'user',parts:[{type:'text',text:'Keep this draft'}]}],input:'Keep this draft',attachments:[]};
    tree=ConversationNotice({attachments:[],onRestore:()=>restored++});
    assert.equal(nodes(tree).find(n=>n.type==='p').props.children,'消息未完成，已恢复到输入框');
    assert.ok(!nodes(tree).some(n=>n.type==='button'&&n.props.children==='恢复输入'),'already restored drafts have no redundant restore action');
    state={...state,input:'A new draft'};
    tree=ConversationNotice({attachments:[],onRestore:()=>restored++});
    assert.ok(button(tree,'恢复输入'),'a different draft must not be mistaken for restored content');

    state={...state,messages:[{role:'assistant',parts:[{type:'data-run-status',data:{state:'failed'}}]}]};assert.ok(ConversationNotice({attachments:[],onRestore:()=>{}}),'a regenerated turn failure must retain its new diagnostics despite an old failed snapshot');
    state={...state,messages:[...state.messages,{role:'user',parts:[{type:'text',text:'My own next request'}]}]};assert.ok(ConversationNotice({attachments:[],onRestore:()=>{}}),'older failure cannot hide a newer send error');
    state={...state,error:undefined,loadError:new Error(raw)};tree=ConversationNotice({attachments:[],onRestore:()=>restored++});assert.equal(nodes(tree).find(n=>n.type==='pre').props.children,raw);const reload=nodes(tree).find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('重新加载'));reload.props.onClick();assert.equal(reloaded,1);
  `);
});

test("private history access failures preserve HTTP status and do not ask users to retry", () => {
  clientScript(`${harness}
    (async()=>{
      let state;
      const {fetcher}=require('./app/_lib/utils.ts');
      const {ConversationNotice}=load('app/_components/chat/conversation-notice.tsx',{...base,react:{useCallback:fn=>fn},'@/app/_hooks/use-active-chat':{useActiveChat:()=>state}});
      for(const [status,code,title] of [[401,'UNAUTHORIZED','登录后可查看这段对话'],[401,null,'登录后可查看这段对话'],[403,'FORBIDDEN','当前账号无权查看这段对话'],[403,null,'当前账号无权查看这段对话'],[503,'TEMPORARILY_UNAVAILABLE','对话加载失败']]){
        globalThis.fetch=async()=>code?Response.json({code},{status}):status===401?Response.json({}, {status}):new Response('<h1>Proxy denied</h1>',{status});
        const error=await fetcher('/api/messages').then(()=>null,e=>e);
        assert.equal(error.statusCode,status);
        state={messages:[],loadError:error,retryLoad:()=>{},clearError:()=>{}};
        const tree=ConversationNotice({attachments:[],onRestore:()=>{},standalone:true});
        const all=nodes(tree);
        assert.equal(all.find(n=>n.type==='h2').props.children,title);
        assert.equal(all.some(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('重新加载')),status===503);
        assert.ok(!all.find(n=>n.type==='details').props.open);
      }
    })().then(()=>process.stdout.write('ASYNC_DONE')).catch(e=>{console.error(e);process.exitCode=1;});
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

test("malformed assistant tool text stays out of live and reopened replies without hiding confirmed files", () => {
  clientScript(`${harness}
    const {PreviewMessage}=load('app/_components/chat/message.tsx',{...base,react:{useCallback:fn=>fn},'@/app/_lib/utils':{cn:()=>'',sanitizeText:t=>t},'../ai-elements/message':{MessageContent:'text',MessageResponse:'response'},'../ai-elements/shimmer':{Shimmer:'shimmer'},'./activity-group':{ActivityGroup:'activity'},'./data-stream-provider':{useDataStream:()=>({})},'./document-preview':{DocumentPreview:'artifact'},'./message-actions':{MessageActions:'actions'},'./message-reasoning':{MessageReasoning:'reasoning'},'./preview-attachment':{PreviewAttachment:'attachment'},'./tool-activity':{ToolActivity:'tool'},'./ask-user':{AskUser:'ask'},'./weather':{}});
    const marker='<｜｜DSML｜｜ calls>';
    const file={id:'00000000-0000-4000-8000-000000000001',title:'已保存.csv',kind:'sheet',path:'outputs/saved.csv'};
    const saved={type:'tool-bash',state:'output-available',toolCallId:'file',output:{artifacts:[file]}};
    const failed={type:'tool-createDocument',state:'output-error',toolCallId:'failed',errorText:'failed'};
    const render=(parts,isLoading=false,role='assistant',turnArtifacts=[])=>nodes(PreviewMessage({message:{id:'a',role,parts},isLoading,isReadonly:false,turnArtifacts}));
    for(let i=1;i<=marker.length;i++){
      const tree=render([{type:'text',state:'streaming',text:'正常正文\\n'+marker.slice(0,i)}],true);
      assert.equal(tree.find(n=>n.type==='response').props.children,'正常正文');
      assert.ok(!tree.some(n=>n.props['data-testid']==='malformed-reply'));
    }
    const raw='正常正文\\n'+marker+'<｜｜DSML｜｜ invoke name="createDocument">RAW_PAYLOAD';
    const parts=[failed,saved,{type:'text',text:raw},{type:'data-run-status',data:{state:'failed'}}];
    const tree=render(parts,false,'assistant',[file]);
    assert.deepEqual(tree.filter(n=>n.type==='response').map(n=>n.props.children),['正常正文']);
    assert.deepEqual(tree.filter(n=>n.type==='artifact').map(n=>n.props.result.id),[file.id]);
    const footer=tree.find(n=>n.props['data-testid']==='turn-artifacts');
    assert.ok(footer);
    assert.equal(nodes(footer).filter(n=>n.type==='artifact').length,1);
    assert.ok(tree.indexOf(footer)>tree.findIndex(n=>n.type==='response'));
    assert.equal(tree.filter(n=>n.props['data-testid']==='malformed-reply').length,1);
    assert.ok(!tree.some(n=>n.props['data-testid']==='run-failure'));
    const details=tree.find(n=>n.type==='details');assert.ok(details&&!details.props.open);
    assert.equal(parts[2].text,raw);
    const reasoning=render([{type:'reasoning',text:'核对字段\\n'+marker+'INTERNAL'},{type:'text',text:'已核对'}]);
    assert.equal(reasoning.find(n=>n.type==='reasoning').props.reasoning,'核对字段');
    assert.ok(!reasoning.some(n=>n.props['data-testid']==='malformed-reply'));
    assert.equal(render([{type:'text',text:raw}],false,'user').find(n=>n.type==='response').props.children,raw);
    const cut=render([{type:'text',text:'正常正文\\n<||DSML'}]);
    assert.equal(cut.find(n=>n.type==='response').props.children,'正常正文');
    assert.ok(cut.some(n=>n.props['data-testid']==='malformed-reply'));
    const fragmented=[{type:'text',state:'done',text:'正常正文\\n<||DS'},{type:'text',state:'streaming',text:'ML|| calls>RAW_PAYLOAD'},{type:'text',text:'PARAMETER_TAIL'}];
    assert.deepEqual(render(fragmented.slice(0,1),true).filter(n=>n.type==='response').map(n=>n.props.children),['正常正文']);
    for(const live of [true,false]){
      const split=render(fragmented,live);
      assert.deepEqual(split.filter(n=>n.type==='response').map(n=>n.props.children),['正常正文']);
      assert.equal(split.some(n=>n.props['data-testid']==='malformed-reply'),!live);
    }
    const recovered=render([...fragmented,{type:'step-start'},{type:'text',text:'后续正常回复'}]);
    assert.deepEqual(recovered.filter(n=>n.type==='response').map(n=>n.props.children),['正常正文','后续正常回复']);
    assert.ok(!recovered.some(n=>n.props['data-testid']==='malformed-reply'));
    assert.equal(render([{type:'text',text:'DSML 名词，1 < 2，正常。'}]).find(n=>n.type==='response').props.children,'DSML 名词，1 < 2，正常。');
  `);
});

test("confirmed artifacts are deduplicated under the final assistant message of each user turn", () => {
  clientScript(`${harness}
    const {Messages}=load('app/_components/chat/messages.tsx',{...base,'@/app/_components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'content',ConversationScrollButton:'scroll'},'@/server/domain/message/message-turn':{prepareRegeneration:()=>false},'./data-stream-provider':{useDataStream:()=>({})},'./message':{PreviewMessage:'message',ThinkingMessage:'thinking'}});
    const file={id:'00000000-0000-4000-8000-000000000001',title:'结果.csv',kind:'sheet',path:'outputs/first.csv'};
    const savedPart=(id,title)=>({type:'tool-bash',toolCallId:id,state:'output-available',output:{artifacts:[{...file,title}]}});
    const messages=[
      {id:'u1',role:'user',parts:[]},
      {id:'a1',role:'assistant',parts:[savedPart('first','旧标题.csv')]},
      {id:'a2',role:'assistant',parts:[savedPart('update','新标题.csv'),{type:'text',text:'完成'}]},
      {id:'u2',role:'user',parts:[]},
      {id:'a3',role:'assistant',parts:[{type:'tool-createDocument',toolCallId:'failed',state:'output-error',errorText:'not saved'},{type:'text',text:'未完成'}]},
      {id:'u3',role:'user',parts:[]},
      {id:'a4',role:'assistant',parts:[{type:'tool-requestSuggestions',toolCallId:'existing-document',state:'output-available',output:{...file,title:'本轮引用.csv'}}]},
    ];
    const previews=nodes(Messages({messages,status:'ready',isReadonly:true})).filter(n=>n.type==='message');
    assert.deepEqual(previews.map(n=>n.key),messages.map(m=>m.id));
    const files=Object.fromEntries(previews.map(n=>[n.key,Array.from(n.props.turnArtifacts??[],a=>a.title)]));
    assert.deepEqual(files,{u1:[],a1:[],a2:['新标题.csv'],u2:[],a3:[],u3:[],a4:['本轮引用.csv']});
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

test("CSV editor renders source links and images, wraps judgments and preserves original values on edit", () => {
  clientScript(`${harness}
    const papa=require('papaparse');
    const content=papa.unparse([['商品名称','商品链接','商品主图','相似点'],['候选 A','https://example.com/item?id=1','https://example.com/item.jpg','造型相似，底座更高'],['候选 B','javascript:alert(1)','data:image/png;base64,not-source','信息不足']]);
    const saves=[];const {SpreadsheetEditor}=load('app/_components/chat/sheet-editor.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},react:{memo:fn=>fn,useCallback:fn=>fn,useMemo:fn=>fn(),useState:initial=>[initial,()=>{}],useEffect:()=>{}},'next-themes':{useTheme:()=>({resolvedTheme:'light'})},'react-data-grid':{__esModule:true,default:'grid',textEditor:'editor'},'react-data-grid/lib/styles.css':{}});
    const props={content,saveContent:(...args)=>saves.push(args),isCurrentVersion:true,status:'idle'};
    const tree=SpreadsheetEditor(props);const grid=tree.props;
    assert.equal(grid.rows.length,2);assert.equal(grid.columns[1].name,'商品名称');
    const source=grid.columns[2].renderCell({row:grid.rows[0]});
    const link=nodes(source).find(n=>n.type==='a');assert.equal(link.props.href,'https://example.com/item?id=1');assert.equal(link.props.rel,'noopener noreferrer');
    const image=grid.columns[3].renderCell({row:grid.rows[0]});assert.equal(nodes(image).find(n=>n.type==='img').props.referrerPolicy,'no-referrer');
    assert.ok(!nodes(grid.columns[2].renderCell({row:grid.rows[1]})).some(n=>n.type==='a'));
    assert.ok(!nodes(grid.columns[3].renderCell({row:grid.rows[1]})).some(n=>n.type==='img'));
    const markdown=grid.columns[3].renderCell({row:{2:'![主图](https://example.com/product.jpg?x=1&y=2)'}});
    assert.equal(nodes(markdown).find(n=>n.type==='img').props.src,'https://example.com/product.jpg?x=1&y=2');
    for(const value of ['![主图](javascript:alert(1))','![主图](data:image/png;base64,bad)','前缀 ![主图](https://example.com/image.jpg)']){
      assert.ok(!nodes(grid.columns[3].renderCell({row:{2:value}})).some(n=>n.type==='img'));
    }
    assert.ok(!nodes(grid.columns[2].renderCell({row:{1:'![主图](https://example.com/image.jpg)'}})).some(n=>n.type==='a'));
    const changed=grid.rows.map((r,i)=>i===0?{...r,3:'逗号, 引号"与\\n换行'}:r);
    grid.onRowsChange(changed);
    const saved=papa.parse(saves[0][0],{skipEmptyLines:true}).data;
    assert.deepEqual(saved[0],['商品名称','商品链接','商品主图','相似点']);assert.equal(saved[1][3],'逗号, 引号"与\\n换行');assert.equal(saved[1][1],'https://example.com/item?id=1');
    SpreadsheetEditor({...props,isCurrentVersion:false}).props.onRowsChange(changed);assert.equal(saves.length,1,'history remains read-only');
    SpreadsheetEditor({...props,status:'streaming'}).props.onRowsChange(changed);assert.equal(saves.length,1);
  `);
});

test("accepted new-chat send restores late failures through the current draft key and preserves a whole new draft", () => {
  clientScript(`${harness}
    (async()=>{
      for(const next of ['empty','text','attachment','navigate','immediate-error','pre-accept-draft']){
        const slots=[],effects=[];let cursor=0,dirty=false,key='new',chatId='chat',draftHook,files=[{url:'/file/sent',name:'sent.txt',contentType:'text/plain'}],accept,reject,posts=0;
        const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
        const react={memo:fn=>fn,useCallback:fn=>fn,useRef:initial=>{const i=cursor++;return slots[i]??(slots[i]={current:initial});},useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;dirty=true;}];},useEffect:(fn,deps)=>{const i=cursor++;if(!same(slots[i],deps)){slots[i]=deps;effects.push(fn);}}};
        const storage=new Map([['new','sent text']]);
        const globals={URL,process:{env:{}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{history:{pushState(){key='saved';}}},setTimeout,clearTimeout};
        const imported=(file,modules)=>{const out={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{...globals,module:out,exports:out.exports,require:name=>modules[name]??require(name)});return out.exports;};
        const {useChatDraft}=imported('app/_hooks/use-chat-draft.ts',{react});
        const generic=new Proxy({},{get:(_,name)=>name});
        const modules={react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':generic,sonner:{toast:{error(){}}},swr:{__esModule:true,default:()=>({data:{capabilities:{fixture:{vision:true}}}})},'usehooks-ts':{useWindowSize:()=>({})},'@/app/_hooks/use-agent-info':{useAgentInfo:()=>({data:{uploadsConfigured:true}})},'@/app/_hooks/use-active-chat':{useActiveChat:()=>({searchMode:'auto',setSearchMode(){},getSendError:()=>undefined})},'@/app/_lib/utils':{cn:()=>'',fetcher(){}},'@/server/domain/model/models':{chatModels:[],DEFAULT_CHAT_MODEL:'fixture'},'@/app/_components/ai-elements/model-selector':generic,'../ai-elements/prompt-input':generic,'../ui/button':generic,'../ui/tooltip':generic,'./composer-menu':generic,'./icons':generic,'./preview-attachment':generic,'./task-capabilities':generic};
        const {MultimodalInput}=imported('app/_components/chat/multimodal-input.tsx',modules);
        const render=()=>{let tree;do{dirty=false;cursor=0;draftHook=useChatDraft(key,chatId);tree=MultimodalInput({chatId,input:draftHook[0],setInput:draftHook[1],attachments:files,setAttachments:action=>{files=typeof action==='function'?action(files):action;dirty=true;},status:'ready',messages:[],selectedModelId:'fixture',sendMessage:(_,options)=>{posts++;accept=options.metadata.onAccepted;return new Promise((_,r)=>{reject=r;});}});effects.splice(0).forEach(fn=>fn());}while(dirty);return tree;};
        let tree=render();nodes(tree).find(n=>n.type==='PromptInput').props.onSubmit();
        if(next==='pre-accept-draft'){draftHook[1]('next before acceptance');render();}
        accept();
        if(next==='immediate-error'){reject(new Error('immediate failure'));await new Promise(resolve=>setTimeout(resolve,0));render();assert.equal(draftHook[0],'sent text');assert.equal(storage.get('saved'),'sent text');assert.equal(storage.get('new'),undefined);continue;}
        tree=render();assert.equal(key,'saved');assert.equal(draftHook[0],next==='pre-accept-draft'?'next before acceptance':'');assert.equal(files.length,0);
        if(next==='text'){draftHook[1]('new draft');render();}
        if(next==='attachment'){files=[{url:'/file/new',name:'new.txt',contentType:'text/plain'}];render();}
        if(next==='navigate'){chatId='other';key='other';draftHook[1]('');render();}
        reject(new Error('late stream failure'));await new Promise(resolve=>setTimeout(resolve,0));render();
        assert.equal(posts,1);
        if(next==='empty'){assert.equal(draftHook[0],'sent text');assert.equal(files[0].url,'/file/sent');assert.equal(storage.get('new'),undefined);assert.equal(storage.get('saved'),'sent text');}
        if(next==='text'){assert.equal(draftHook[0],'new draft');assert.equal(files.length,0);}
        if(next==='attachment'){assert.equal(draftHook[0],'');assert.equal(files[0].url,'/file/new');}
        if(next==='navigate'){assert.equal(draftHook[0],'');assert.equal(files.length,0);}
        if(next==='pre-accept-draft'){assert.equal(draftHook[0],'next before acceptance');assert.equal(storage.get('saved'),'next before acceptance');assert.equal(files.length,0);}
      }
      process.stdout.write('ASYNC_DONE');
    })().catch(e=>{console.error(e);process.exitCode=1;});
  `);
});
