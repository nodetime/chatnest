import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function client(code: string) {
  return execFileSync(process.execPath, ["--import", "tsx", "-e", code], {
    encoding: "utf8",
    env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
  });
}

test("Ask 渲染通用表单、明确必填、支持文本和单/多选；只读记录没有提交控制", () => {
  const code = `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {AskUser}=require('./app/_components/chat/ask-user.tsx');const part={type:'tool-askUser',state:'input-available',toolCallId:'ask',input:{title:'选择目标',questions:[{id:'goal',label:'研究目标',type:'text',required:true},{id:'format',label:'输出格式',type:'single',required:true,options:[{value:'doc',label:'文档'}]},{id:'extras',label:'附加内容',type:'multi',required:false,options:[{value:'sources',label:'来源'}]}]}};`;
  const html = client(
    `${code}process.stdout.write(renderToStaticMarkup(React.createElement(AskUser,{messageId:'a',part,onAnswer:async()=>{},canAnswer:true})));`
  );
  assert.match(html, /研究目标/);
  assert.match(html, /textarea/);
  assert.match(html, /role="radio"/);
  assert.match(html, /role="checkbox"/);
  assert.match(html, /提交回答/);
  assert.match(html, /跳过/);
  assert.doesNotMatch(html, /稍后回答|继续回答/);
  assert.match(html, /type="submit"[^>]*disabled|disabled[^>]*type="submit"/);
  assert.match(html, /required/);
  const readonly = client(
    `${code}process.stdout.write(renderToStaticMarkup(React.createElement(AskUser,{messageId:'a',part,onAnswer:async()=>{},isReadonly:true})));`
  );
  assert.doesNotMatch(readonly, /<form|提交回答/);
});

test("TaskProgress 使用 AI Elements Task 与真实快照计数；空计划不渲染", () => {
  const html = client(
    `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {TaskProgress}=require('./app/_components/chat/task-progress.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(TaskProgress,{isRunning:true,plan:{items:[{id:'one',title:'核对资料',status:'completed'},{id:'two',title:'整理结论',status:'in_progress'}]}})));`
  );
  assert.match(html, /1\s*\/\s*2/);
  assert.match(html, /核对资料/);
  assert.match(html, /整理结论/);
  assert.match(html, /进行中/);
  const empty = client(
    `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {TaskProgress}=require('./app/_components/chat/task-progress.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(TaskProgress,{plan:null})));`
  );
  assert.equal(empty, "");
});

test("hook 暴露真实回答和停止门控；Ask 发送显式等待网络，transport 仅传精简输出", () => {
  const source = readFileSync(
    new URL("../../_hooks/use-active-chat.tsx", import.meta.url),
    "utf8"
  );
  for (const name of [
    "answerAskUser",
    "taskProgress",
    "compactInteractionResponses",
    "shouldContinueAgent",
    "validateAskUserOutput",
  ]) {
    assert.ok(source.includes(name), name);
  }
  assert.doesNotMatch(source, /continueAgent|请继续刚才未完成的任务/);
  assert.match(source, /await origin\.addToolOutput/);
  assert.match(source, /await origin\.sendMessage/);
  assert.match(source, /gate\.paused = true/);
  assert.match(source, /gate\.revision/);
});

test("Ask 复用Question与shadcn控件，只保留跳过和提交，已答修改用普通用户补充", () => {
  const source = readFileSync(
    new URL("./ask-user.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /@\/app\/_components\/ui\/button/);
  assert.match(source, /@\/app\/_components\/ai-elements\/question/);
  assert.doesNotMatch(source, /稍后回答|草稿已保留|handleDefer/);
  assert.match(source, /onRevise/);
  const hook = readFileSync(
    new URL("../../_hooks/use-active-chat.tsx", import.meta.url),
    "utf8"
  );
  assert.match(hook, /reviseAskUser/);
  assert.match(hook, /补充\/修改/);
});

test("真实Ask组件空答案禁用提交、单次提交且隔离迟到失败；修改与跳过分开处理", () => {
  const result = client(`
    const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    const jsx=(type,props,key)=>({type,props,key});
    const harness=()=>{const slots=[];let cursor=0,dirty=false;return {react:{useId:()=> 'ask-form',useCallback:fn=>fn,useRef:initial=>{const i=cursor++;return slots[i]??(slots[i]={current:initial});},useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;dirty=true;}];}},render(fn,props){let tree;do{cursor=0;dirty=false;tree=fn(props);}while(dirty);return tree;}};};
    const h=harness(),out={exports:{}};
    const modules={react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/app/_components/ui/button':{Button:'button'},'@/app/_components/ui/textarea':{Textarea:'textarea'}};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/_components/chat/ask-user.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:out,exports:out.exports,require:name=>modules[name]??require(name)});
    const {AskUser}=out.exports;
    const nodes=tree=>{const result=[];const walk=node=>{if(Array.isArray(node))return node.forEach(walk);if(!node||typeof node!=='object')return;result.push(node);walk(node.props?.children);};walk(tree);return result;};
    const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&node.props.children===label);
    const input={title:'目标',questions:[{id:'goal',label:'目标',type:'text',required:true}]};
    let reject;const calls=[],revisions=[];
    let props={messageId:'a',part:{type:'tool-askUser',toolCallId:'ask',state:'input-available',input},onAnswer:value=>{calls.push(value);return new Promise((_,r)=>reject=r);},onRevise:async value=>{revisions.push(value);}};
    (async()=>{
      let tree=h.render(AskUser,props);
      assert.equal(nodes(tree).find(node=>node.type==='button'&&node.props.type==='submit').props.disabled,true);
      nodes(tree).find(node=>node.props?.asField).props.onValueChange({text:'保留的草稿',selectedValues:[]});
      tree=h.render(AskUser,props);assert.equal(calls.length,0);assert.equal(nodes(tree).find(node=>node.type==='button'&&node.props.type==='submit').props.disabled,false);
      const submit=nodes(tree).find(node=>node.type==='form').props.onSubmit;
      const pending=submit({preventDefault(){}});submit({preventDefault(){}});assert.equal(calls.length,1);assert.equal(calls[0].output.answers.goal,'保留的草稿');
      props={...props,part:{...props.part,toolCallId:'replacement'}};tree=h.render(AskUser,props);reject(new Error('late failure'));await pending;tree=h.render(AskUser,props);assert.ok(!JSON.stringify(tree).includes('尚未确认提交'));
      props={...props,part:{...props.part,state:'output-available',output:{status:'answered',answers:{goal:'原回答'}}}};tree=h.render(AskUser,props);button(tree,'修改回答').props.onClick();tree=h.render(AskUser,props);nodes(tree).find(node=>node.props?.asField).props.onValueChange({text:'用户补充',selectedValues:[]});tree=h.render(AskUser,props);await nodes(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(revisions.length,1);assert.equal(revisions[0].output.answers.goal,'用户补充');assert.equal(calls.length,1);
      let failRevision=true;props={...props,onRevise:async value=>{revisions.push(value);if(failRevision)throw new Error('save failed');}};
      tree=h.render(AskUser,props);button(tree,'修改回答').props.onClick();tree=h.render(AskUser,props);nodes(tree).find(node=>node.props?.asField).props.onValueChange({text:'新的修改',selectedValues:[]});tree=h.render(AskUser,props);await nodes(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
      tree=h.render(AskUser,props);assert.ok(JSON.stringify(tree).includes('修改未提交'));failRevision=false;await button(tree,'重试提交').props.onClick();assert.equal(revisions.at(-1).output.answers.goal,'新的修改');
      tree=h.render(AskUser,props);button(tree,'修改回答').props.onClick();tree=h.render(AskUser,props);failRevision=true;await nodes(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});tree=h.render(AskUser,props);button(tree,'取消修改').props.onClick();tree=h.render(AskUser,props);assert.ok(!button(tree,'重试提交'));assert.ok(!JSON.stringify(tree).includes('修改未提交'));
      props={...props,onAnswer:async value=>{calls.push(value);},part:{type:'tool-askUser',toolCallId:'skip',state:'input-available',input}};tree=h.render(AskUser,props);await button(tree,'跳过').props.onClick();assert.equal(calls.length,2);assert.deepEqual(calls[1].output,{answers:{},status:'cancelled'});
      process.stdout.write('ASYNC_DONE');
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `);
  assert.match(result, /ASYNC_DONE/);
});

test("Todo 未运行时保留未完成状态且不转圈，已完成默认收起；输入区是唯一展示入口", () => {
  const paused = client(
    `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {TaskProgress}=require('./app/_components/chat/task-progress.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(TaskProgress,{plan:{items:[{id:'one',title:'核对结果',status:'in_progress'}]}})));`
  );
  assert.match(paused, /待继续/);
  assert.doesNotMatch(paused, /animate-spin|任务已完成/);
  const done = client(
    `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {TaskProgress}=require('./app/_components/chat/task-progress.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(TaskProgress,{plan:{items:[{id:'one',title:'已交付',status:'completed'}]}})));`
  );
  assert.match(done, /任务已完成/);
  assert.match(done, /aria-expanded="false"/);
  const finalizing = client(
    `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {TaskProgress}=require('./app/_components/chat/task-progress.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(TaskProgress,{isRunning:true,plan:{items:[{id:'one',title:'已交付',status:'completed'}]}})));`
  );
  assert.match(finalizing, /正在整理结果/);
  assert.doesNotMatch(finalizing, /任务已完成/);
  const shell = readFileSync(new URL("./shell.tsx", import.meta.url), "utf8");
  const header = readFileSync(
    new URL("./chat-header.tsx", import.meta.url),
    "utf8"
  );
  assert.match(shell, /<TaskProgress/);
  assert.doesNotMatch(header, /TaskProgress/);
});

test("暂停后新的明确工具审批恢复交互门控，不让混合 Ask/审批永久锁住", () => {
  const source = readFileSync(
    new URL("../../_hooks/use-active-chat.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /addToolApprovalResponse: sdkAddToolApprovalResponse/);
  assert.match(source, /await sdkAddToolApprovalResponse\(response\)/);
});

test("Provider导航和卸载中止捕获的旧SDK请求，旧交互句柄既不停止新会话也不因A→B→A复活", () => {
  const result = client(`
    const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    const {Chat:SDKChat}=require('@ai-sdk/react');
    const jsx=(type,props,key)=>({type,props,key});
    let pathname='/chat/A',cursor=0,generated=0,holdSuccessfulStream=false;const slots=[],pendingEffects=[],requests=[],instances=[],finishHandlers=[];
    const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
    const memo=(fn,deps)=>{const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))slots[index]={deps,value:fn()};return slots[index].value;};
    const react={createContext:()=>({Provider:'provider'}),useContext:()=>null,useRef:initial=>{const index=cursor++;return slots[index]??(slots[index]={current:initial});},useState:initial=>{const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect:(fn,deps)=>{const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps)){const previous=slots[index];slots[index]={deps,cleanup:previous?.cleanup};pendingEffects.push(()=>{previous?.cleanup?.();slots[index].cleanup=fn();});}}};
    class Chat extends SDKChat {constructor(options){super(options);instances.push(this);finishHandlers.push(options.onFinish);}}
    class Transport {
      constructor(options){this.options=options;}
      async sendMessages(request){
        const record={id:request.chatId,signal:request.abortSignal,aborted:false,body:this.options.prepareSendMessagesRequest({...request,id:request.chatId}).body};requests.push(record);
        return new ReadableStream({start(controller){record.controller=controller;request.abortSignal.addEventListener('abort',()=>{record.aborted=true;controller.error(new DOMException('Stopped','AbortError'));},{once:true});if(request.chatId==='G'){controller.enqueue({type:'data-run-status',id:'run-status',data:{state:'failed'}});controller.enqueue({type:'error',errorText:'model rejected'});controller.close();return;}controller.enqueue({type:'start',messageId:'answer-'+requests.length});controller.enqueue({type:'text-start',id:'text'});if(request.chatId==='D')return;controller.enqueue({type:'text-delta',id:'text',delta:'pending'});if(request.chatId==='H'){controller.enqueue({type:'text-end',id:'text'});if(holdSuccessfulStream)return;controller.enqueue({type:'finish',finishReason:'stop'});controller.close();}}});
      }
      async reconnectToStream(){return null;}
    }
    const models={selectableModelIds:['fixture'],defaultModelId:'fixture'},chats=new Map(),serverChats=new Map(),historyRefreshes=[];
    const reads=[],historyErrors=new Map();let heldHistoryRead;
    const reloaders=new Map();
    const swr=url=>{if(url?.includes('/api/models'))return {data:models};if(url?.includes('/api/messages')){if(!chats.has(url))chats.set(url,{messages:[],visibility:'private',isReadonly:false});if(!reloaders.has(url))reloaders.set(url,async()=>{reads.push(url);if(heldHistoryRead)await heldHistoryRead;const value=serverChats.get(url);chats.set(url,value);return value;});return {data:chats.get(url),isLoading:delayRevalidation&&!chats.get(url),error:historyErrors.get(url),mutate:reloaders.get(url)};}return {data:[]};};
    const stream={setDataStream(){},setWaitingStatus(){}};const router={push(){}};
    const inFlightGets=new Set();let delayRevalidation=false;
    const mutateSWR=(...args)=>{
      const [key,update,options]=args;
      if(args.length===1&&chats.has(key)){
        if(!delayRevalidation)chats.set(key,serverChats.get(key));
        return Promise.resolve();
      }
      if(typeof update==='function'&&chats.has(key))chats.set(key,update(chats.get(key)));
      if(chats.has(key)&&typeof options?.revalidate==='boolean'){
        assert.equal(update,undefined,'invalidate the old approval before fetching');
        const subscribed=key==='/api/messages?chatId='+pathname.split('/').at(-1);
        historyRefreshes.push({key,revalidate:options.revalidate,subscribed});
        if(options.revalidate)inFlightGets.delete(key);
        chats.set(key,options.revalidate&&subscribed&&!delayRevalidation?serverChats.get(key):undefined);
      }
      return Promise.resolve();
    };
    const modules={react,'react/jsx-runtime':{jsx,jsxs:jsx},'@ai-sdk/react':{Chat,useChat:({chat})=>({messages:chat.messages,setMessages:value=>{chat.messages=typeof value==='function'?value(chat.messages):value;},sendMessage:chat.sendMessage,status:chat.status,stop:chat.stop,regenerate:chat.regenerate,resumeStream:chat.resumeStream,addToolApprovalResponse:chat.addToolApprovalResponse,error:chat.error,clearError:chat.clearError})},ai:{DefaultChatTransport:Transport},'next/navigation':{usePathname:()=>pathname,useRouter:()=>router},swr:{__esModule:true,default:swr,useSWRConfig:()=>({mutate:mutateSWR})},'swr/infinite':{unstable_serialize:()=>''},'@/app/_components/chat/chat-title':{projectChatTitle:()=> 'Fixture'},'@/app/_components/chat/data-stream-provider':{useDataStream:()=>stream},'@/app/_components/chat/sidebar-history':{getChatHistoryPaginationKey:()=>''},'@/app/_components/chat/toast':{toast(){}},'@/app/_hooks/use-auto-resume':{useAutoResume(){}},'@/app/_hooks/use-chat-draft':{useChatDraft:()=>react.useState('')},'@/app/_lib/utils':{generateUUID:()=> 'id-'+(++generated),fetcher(){},fetchWithErrorHandlers(){throw new Error('Unexpected network');}},'@/server/domain/model/models':{DEFAULT_CHAT_MODEL:'fixture'}};
    const output={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/_hooks/use-active-chat.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:output,exports:output.exports,require:name=>modules[name]??require(name),process:{env:{}},setTimeout,clearTimeout,window:{addEventListener(){},removeEventListener(){},location:{search:''},history:{replaceState(){}}},document:{cookie:''},URLSearchParams,sessionStorage:{removeItem(){}}});
    const render=path=>{pathname=path;cursor=0;const tree=output.exports.ActiveChatProvider({children:null,ownerId:'fixture'});pendingEffects.splice(0).forEach(effect=>effect());return tree.props.value;};
    const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
    (async()=>{
      const a=render('/chat/A'),oldA=instances[0];
      const key='/api/messages?chatId=A', cached=chats.get(key);
      const stale=[{id:'approval',role:'assistant',parts:[{type:'dynamic-tool',toolCallId:'tool',state:'approval-requested'}]}];
      const completed=[{id:'approval',role:'assistant',parts:[{type:'dynamic-tool',toolCallId:'tool',state:'output-available'},{type:'text',text:'result saved'}]}];
      chats.set(key,{...cached,messages:stale});
      finishHandlers[0]({messages:completed,finishReason:'stop',isAbort:true});
      assert.equal(chats.get(key).messages,stale,'an aborted stream must not replace persisted cache');
      serverChats.set(key,{...cached,messages:completed});
      finishHandlers[0]({messages:completed,finishReason:'stop'});
      assert.equal(chats.get(key).messages,completed,'ordinary stream completion must replace an old approval snapshot before sidebar reopen');
      finishHandlers[0]({messages:stale,finishReason:'tool-calls'});
      assert.equal(chats.get(key).messages,completed,'a replay acknowledgement must never overwrite the saved tool result');
      assert.equal(chats.get(key).visibility,'private');
      delayRevalidation=true;
      finishHandlers[0]({messages:completed,finishReason:'stop'});
      assert.equal(render('/chat/A').isReadonly,false,'the post-send history GET must not unmount the composer before it clears the submitted draft');
      assert.equal(chats.get(key).messages,completed,'keep the active chat snapshot while the success revalidation is pending');
      delayRevalidation=false;
      chats.set(key,cached);
      const pendingA=a.sendMessage({role:'user',parts:[{type:'text',text:'A'}]});await tick();assert.equal(requests[0].id,'A');
      const b=render('/chat/B');await tick();assert.equal(requests[0].aborted,true,'navigation must abort the captured old A stream');await pendingA;
      assert.equal(chats.get(key),undefined,'leaving clears the old snapshot and pending GET before sidebar reopening');
      chats.set(key,cached);
      const pendingB=b.sendMessage({role:'user',parts:[{type:'text',text:'B'}]});await tick();assert.equal(requests[1].id,'B');assert.equal(requests[1].aborted,false);
      await a.stop();await a.sendMessage({role:'user',parts:[{type:'text',text:'stale'}]});await assert.rejects(a.addToolApprovalResponse({id:'stale',approved:true}));await assert.rejects(a.answerAskUser({messageId:'a',toolCallId:'ask',output:{status:'cancelled',answers:{}}}));assert.equal(requests.length,2);assert.equal(requests[1].aborted,false,'old stop handler cannot abort B');
      const freshA=render('/chat/A');await tick();await pendingB;assert.equal(requests[1].aborted,true);assert.notEqual(instances[2],oldA,'returning to A creates a fresh SDK instance');
      await a.sendMessage({role:'user',parts:[{type:'text',text:'obsolete A'}]});await assert.rejects(a.addToolApprovalResponse({id:'old-A',approved:true}));assert.equal(requests.length,2,'A→B→A does not revive old handles');
      const pendingFreshA=freshA.sendMessage({role:'user',parts:[{type:'text',text:'fresh A'}]});await tick();assert.equal(requests.length,3);assert.equal(requests[2].aborted,false);
      slots.forEach(slot=>slot?.cleanup?.());await pendingFreshA;assert.equal(requests[2].aborted,true,'provider unmount aborts its captured current request');
      const lateUnmountSend=freshA.sendMessage({role:'user',parts:[{type:'text',text:'after unmount'}]});await tick();assert.equal(requests.length,3,'unmounted handles cannot start another request');await lateUnmountSend;await assert.rejects(freshA.addToolApprovalResponse({id:'unmounted',approved:true}));
      const stoppedKey='/api/messages?chatId=C';
      const priorHistory={...cached,messages:stale};
      chats.set(stoppedKey,priorHistory);
      serverChats.set(stoppedKey,priorHistory);
      const stopped=render('/chat/C');
      const pendingStop=stopped.sendMessage({role:'user',parts:[{type:'text',text:'before explicit stop'}]});await tick();
      assert.equal(requests.length,4);await stopped.stop();await pendingStop;
      assert.equal(requests[3].aborted,true,'the explicit stop still aborts the stream');
      assert.equal(stopped.getSendError(),undefined,'a deliberate stop after a partial reply does not restore the already sent draft');
      assert.equal(requests.length,4,'stop must not send a synthetic message');
      assert.equal(typeof stopped.continueAgent,'undefined');
      const next=stopped.sendMessage({role:'user',parts:[{type:'text',text:'my next instruction'}]});await tick();
      assert.equal(requests.length,5);assert.equal(requests[4].aborted,false,'the composer can start a new explicit turn');
      chats.set(stoppedKey,priorHistory);
      inFlightGets.add(stoppedKey);
      const stopping=stopped.stop();
      const stoppedMessages=instances.at(-1).messages;
      assert.equal(stoppedMessages.at(-1).parts[0].text,'pending','stop leaves the partial response visible');
      stopped.startNewChat();render('/chat');
      assert.equal(chats.get(stoppedKey),undefined,'leaving after Stop must invalidate even before the old SDK finishes');
      assert.equal(inFlightGets.has(stoppedKey),false,'the reopened GET must not dedupe against a stale request');
      assert.deepEqual(historyRefreshes.at(-1),{key:stoppedKey,revalidate:true,subscribed:false},'clear old requests after the old history subscription leaves');
      await stopping;await next;
      assert.equal(render('/chat/C').messages.length,0,'the reopened SDK must not hydrate a stale approval before the history response');
      // The first GET was authoritative but began before the stopped reply was saved.
      chats.set(stoppedKey,priorHistory);
      const waiting=render('/chat/C');
      assert.equal(waiting.isReadonly,true,'while the stopped reply is still saving, old approvals must not be actionable');
      assert.equal(instances.at(-1).messages.length,0,'do not hydrate the pre-save snapshot');
      await new Promise(resolve=>setTimeout(resolve,300));
      assert.equal(instances.at(-1).messages.length,0,'a retry that still precedes the save cannot hydrate stale history');
      let releaseHistoryRead;
      heldHistoryRead=new Promise(resolve=>{releaseHistoryRead=resolve;});
      await new Promise(resolve=>setTimeout(resolve,2800));
      assert.equal(instances.at(-1).messages.length,0,'deadline must not lock in old history while the final GET is still pending');
      serverChats.set(stoppedKey,{...priorHistory,messages:stoppedMessages});
      releaseHistoryRead();
      heldHistoryRead=undefined;
      await tick();
      render('/chat/C');
      assert.ok(reads.filter(key=>key===stoppedKey).length>=2,'reopen should retry the same read-only history endpoint while the reply is saving');
      assert.deepEqual(instances.at(-1).messages,stoppedMessages,'the reopened conversation adopts authoritative history');
      assert.equal(requests.length,5,'navigation and reopening cannot send another request');
      const notStarted=render('/chat/D');const unsent=notStarted.sendMessage({role:'user',parts:[{type:'text',text:'draft without response'}]});await tick();
      assert.equal(requests.length,6);await notStarted.stop();await unsent;
      assert.ok(notStarted.getSendError(),'before receiving a reply, preserve the draft');
      const {submitEditedMessage}=require('./app/_components/chat/message-editor.tsx');
      const editing=render('/chat/E');
      const oldPrompt={id:'old-prompt',role:'user',parts:[{type:'text',text:'original prompt'}]};
      const snapshot=[oldPrompt,{id:'old-answer',role:'assistant',parts:[{type:'text',text:'original answer'}]}];
      editing.setMessages(snapshot);
      let editDraft='edited text';
      const edit=submitEditedMessage({message:oldPrompt,text:editDraft,snapshot,setMessages:editing.setMessages,regenerate:editing.regenerate,getSendError:editing.getSendError,isCurrent:()=>true,setInput:update=>{editDraft=update(editDraft);}});
      await tick();
      assert.equal(requests.length,7);
      assert.equal(instances.at(-1).messages.at(-1).parts[0].text,'pending','editing already streamed a partial reply');
      await editing.stop();
      await assert.rejects(edit,/草稿已保留/);
      assert.deepEqual(instances.at(-1).messages,snapshot,'stopping an edit restores the original saved turn');
      assert.equal(editDraft,'edited text','stopping an edit preserves its unsaved draft');
      const deniedKey='/api/messages?chatId=F';
      chats.set(deniedKey,priorHistory);
      serverChats.set(deniedKey,priorHistory);
      const toBeDenied=render('/chat/F');
      const deniedRun=toBeDenied.sendMessage({role:'user',parts:[{type:'text',text:'access revoked during save'}]});
      await tick();
      await toBeDenied.stop();await deniedRun;
      render('/chat');
      render('/chat/F');
      chats.set(deniedKey,priorHistory);
      render('/chat/F');
      let releaseDeniedRead;
      heldHistoryRead=new Promise(resolve=>{releaseDeniedRead=resolve;});
      await new Promise(resolve=>setTimeout(resolve,3100));
      const forbidden=new Error('HTTP 403');
      historyErrors.set(deniedKey,forbidden);
      releaseDeniedRead();
      heldHistoryRead=undefined;
      await tick();
      const denied=render('/chat/F');
      assert.equal(denied.loadError,forbidden);
      assert.equal(denied.isReadonly,true);
      assert.equal(instances.at(-1).messages.length,0,'a denied final GET must not restore cached history or approvals');
      const failureKey='/api/messages?chatId=G';
      chats.set(failureKey,priorHistory);
      serverChats.set(failureKey,priorHistory);
      const failure=render('/chat/G');
      const requestsBeforeFailure=requests.length;
      await failure.sendMessage({role:'user',parts:[{type:'text',text:'one failed send'}]});
      assert.ok(failure.getSendError());
      const failedMessages=instances.at(-1).messages;
      const failedUser=failedMessages.findLast(message=>message.role==='user');
      assert.ok(failedUser?.id);
      assert.equal(failedMessages.at(-1).parts.at(-1).type,'data-run-status');
      render('/chat');
      assert.equal(chats.get(failureKey),undefined,'leaving a reported failed turn must clear stale sidebar history');
      render('/chat/G');
      const beforeSave={...priorHistory,messages:[...stale,failedUser]};
      chats.set(failureKey,beforeSave);
      serverChats.set(failureKey,beforeSave);
      assert.equal(render('/chat/G').isReadonly,true,'the first GET must not restore an old approval before the failed assistant saves');
      const persistedFailure={...beforeSave,messages:[...beforeSave.messages,{...failedMessages.at(-1),id:'server-assistant-id'}]};
      serverChats.set(failureKey,persistedFailure);
      await new Promise(resolve=>setTimeout(resolve,300));
      render('/chat/G');
      assert.deepEqual(instances.at(-1).messages,persistedFailure.messages,'GET accepts the persisted failed turn even when the assistant ID differs from the SDK ID');
      assert.equal(requests.length,requestsBeforeFailure+1,'reopening a failed turn must not replay the message');

      const successKey='/api/messages?chatId=H';
      chats.set(successKey,{...cached,messages:[]});
      const successful=render('/chat/H');
      const beforeSuccess=requests.length;
      const {completeDraftSubmission}=require('./server/domain/attachment/client-admission.ts');
      let draft='one successful send';
      delayRevalidation=true;holdSuccessfulStream=true;
      let streamCompleted=false;
      const submitting=completeDraftSubmission(
        onAccepted=>successful.sendMessage({role:'user',parts:[{type:'text',text:draft}]},{metadata:{onAccepted}}),
        successful.getSendError,
        ()=>!render('/chat/H').isReadonly,
        ()=>{draft='';},
        ()=>{draft ||= 'one successful send';}
      ).then(()=>{streamCompleted=true;});
      await tick();
      assert.equal(draft,'','accepted request clears draft before model completes');
      assert.equal(streamCompleted,false,'SDK promise still represents full stream completion');
      assert.ok(!('metadata' in requests.at(-1).body),'client callback never enters HTTP body');
      requests.at(-1).controller.enqueue({type:'finish',finishReason:'stop'});
      requests.at(-1).controller.close();await submitting;holdSuccessfulStream=false;
      assert.equal(draft,'','successful send clears its draft even during delayed history revalidation');
      const saved=instances.at(-1).messages;
      assert.equal(saved.at(-1).parts[0].text,'pending');
      serverChats.set(successKey,{...cached,messages:saved});
      render('/chat');
      assert.equal(chats.get(successKey),undefined,'leaving invalidates the old snapshot');
      chats.set(successKey,serverChats.get(successKey));
      delayRevalidation=false;
      render('/chat/H');
      assert.deepEqual(instances.at(-1).messages,saved);
      assert.equal(requests.length,beforeSuccess+1,'completed send and sidebar reopen must result in exactly one chat POST');
      holdSuccessfulStream=true;draft='interrupted tool loop';
      const interrupted=render('/chat/H');
      const interruptedSend=completeDraftSubmission(
        onAccepted=>interrupted.sendMessage({role:'user',parts:[{type:'text',text:draft}]},{metadata:{onAccepted}}),
        interrupted.getSendError,()=>true,()=>{draft='';},()=>{draft ||= 'interrupted tool loop';}
      );
      await tick();assert.equal(draft,'');
      requests.at(-1).controller.enqueue({type:'data-run-status',id:'run-status',data:{state:'failed'}});
      requests.at(-1).controller.enqueue({type:'finish',finishReason:'tool-calls'});
      requests.at(-1).controller.close();await assert.rejects(interruptedSend,/本轮未完成/);holdSuccessfulStream=false;
      assert.ok(interrupted.getSendError(),'a persisted failure is failure even when SDK transport finishes normally');
      assert.equal(draft,'interrupted tool loop','tool-loop cutoff restores the accepted draft');
      const planHistory={...cached,messages:[{id:'old-plan',role:'assistant',parts:[{type:'tool-updateTodo',toolCallId:'old-todo',state:'output-available',input:{items:[{id:'one',title:'未完成的旧任务',status:'in_progress'}]},output:{items:[{id:'one',title:'未完成的旧任务',status:'in_progress'}]}}]}]};
      chats.set('/api/messages?chatId=P',planHistory);
      const planned=render('/chat/P');
      assert.equal(planned.taskProgress.items[0].title,'未完成的旧任务');
      assert.equal(planned.isTaskProgressRunning,false);
      const unrelated=planned.sendMessage({role:'user',parts:[{type:'text',text:'另一条简单问题'}]});await tick();
      assert.equal(render('/chat/P').isTaskProgressRunning,false,'a later ordinary request cannot restart the old plan indicator');
      const live=instances.at(-1);live.messages=[...live.messages.slice(0,-1),{...live.messages.at(-1),parts:[...live.messages.at(-1).parts,{...planHistory.messages[0].parts[0],toolCallId:'current-todo'}]}];
      assert.equal(render('/chat/P').isTaskProgressRunning,true,'a current assistant plan update owns its running indicator');
      await planned.stop();await unrelated;
      assert.equal(render('/chat/P').isTaskProgressRunning,false,'stopping keeps unfinished steps without a running indicator');
      process.stdout.write('ASYNC_DONE');
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `);
  assert.match(result, /ASYNC_DONE/);
});
