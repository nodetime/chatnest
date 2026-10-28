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
  assert.match(html, /required/);
  const readonly = client(
    `${code}process.stdout.write(renderToStaticMarkup(React.createElement(AskUser,{messageId:'a',part,onAnswer:async()=>{},isReadonly:true})));`
  );
  assert.doesNotMatch(readonly, /<form|提交回答/);
});

test("TaskProgress 使用 AI Elements Task 与真实快照计数；空计划不渲染", () => {
  const html = client(
    `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {TaskProgress}=require('./app/_components/chat/task-progress.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(TaskProgress,{plan:{items:[{id:'one',title:'核对资料',status:'completed'},{id:'two',title:'整理结论',status:'in_progress'}]}})));`
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

test("hook 暴露真实回答/继续/停止门控；Ask 发送显式等待网络，transport 仅传精简输出", () => {
  const source = readFileSync(
    new URL("../../_hooks/use-active-chat.tsx", import.meta.url),
    "utf8"
  );
  for (const name of [
    "answerAskUser",
    "continueAgent",
    "agentPaused",
    "taskProgress",
    "compactInteractionResponses",
    "shouldContinueAgent",
    "validateAskUserOutput",
  ]) {
    assert.ok(source.includes(name), name);
  }
  assert.match(source, /await origin\.addToolOutput/);
  assert.match(source, /await origin\.sendMessage/);
  assert.match(source, /gate\.paused = true/);
  assert.match(source, /gate\.revision/);
});

test("Ask 复用shadcn表单控件，稍后回答不提交取消，已答修改用普通用户补充", () => {
  const source = readFileSync(
    new URL("./ask-user.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /@\/app\/_components\/ui\/button/);
  assert.match(source, /@\/app\/_components\/ai-elements\/question/);
  assert.match(source, /稍后回答/);
  assert.match(source, /onRevise/);
  const hook = readFileSync(
    new URL("../../_hooks/use-active-chat.tsx", import.meta.url),
    "utf8"
  );
  assert.match(hook, /reviseAskUser/);
  assert.match(hook, /补充\/修改/);
});

test("真实Ask组件稍后回答保留输入、同一时刻只提交一次，并隔离迟到失败；修改只调用onRevise", () => {
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
      nodes(tree).find(node=>node.props?.asField).props.onValueChange({text:'保留的草稿',selectedValues:[]});
      tree=h.render(AskUser,props);button(tree,'稍后回答').props.onClick();tree=h.render(AskUser,props);assert.equal(calls.length,0);assert.ok(!nodes(tree).some(node=>node.type==='form'));
      button(tree,'继续回答').props.onClick();tree=h.render(AskUser,props);assert.equal(nodes(tree).find(node=>node.props?.asField).props.value.text,'保留的草稿');
      const submit=nodes(tree).find(node=>node.type==='form').props.onSubmit;
      const pending=submit({preventDefault(){}});submit({preventDefault(){}});assert.equal(calls.length,1);assert.equal(calls[0].output.answers.goal,'保留的草稿');
      props={...props,part:{...props.part,toolCallId:'replacement'}};tree=h.render(AskUser,props);reject(new Error('late failure'));await pending;tree=h.render(AskUser,props);assert.ok(!JSON.stringify(tree).includes('尚未确认提交'));
      props={...props,part:{...props.part,state:'output-available',output:{status:'answered',answers:{goal:'原回答'}}}};tree=h.render(AskUser,props);button(tree,'修改回答').props.onClick();tree=h.render(AskUser,props);nodes(tree).find(node=>node.props?.asField).props.onValueChange({text:'用户补充',selectedValues:[]});tree=h.render(AskUser,props);await nodes(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(revisions.length,1);assert.equal(revisions[0].output.answers.goal,'用户补充');assert.equal(calls.length,1);
      process.stdout.write('ASYNC_DONE');
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `);
  assert.match(result, /ASYNC_DONE/);
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
    let pathname='/chat/A',cursor=0,generated=0;const slots=[],pendingEffects=[],requests=[],instances=[];
    const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
    const memo=(fn,deps)=>{const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))slots[index]={deps,value:fn()};return slots[index].value;};
    const react={createContext:()=>({Provider:'provider'}),useContext:()=>null,useRef:initial=>{const index=cursor++;return slots[index]??(slots[index]={current:initial});},useState:initial=>{const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect:(fn,deps)=>{const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps)){const previous=slots[index];slots[index]={deps,cleanup:previous?.cleanup};pendingEffects.push(()=>{previous?.cleanup?.();slots[index].cleanup=fn();});}}};
    class Chat extends SDKChat {constructor(options){super(options);instances.push(this);}}
    class Transport {
      async sendMessages(request){
        const record={id:request.chatId,signal:request.abortSignal,aborted:false};requests.push(record);
        return new ReadableStream({start(controller){request.abortSignal.addEventListener('abort',()=>{record.aborted=true;controller.error(new DOMException('Stopped','AbortError'));},{once:true});controller.enqueue({type:'start',messageId:'answer-'+requests.length});controller.enqueue({type:'text-start',id:'text'});controller.enqueue({type:'text-delta',id:'text',delta:'pending'});}});
      }
      async reconnectToStream(){return null;}
    }
    const models={selectableModelIds:['fixture'],defaultModelId:'fixture'},chats=new Map();
    const swr=url=>{if(url?.includes('/api/models'))return {data:models};if(url?.includes('/api/messages')){if(!chats.has(url))chats.set(url,{messages:[],visibility:'private',isReadonly:false});return {data:chats.get(url),isLoading:false,mutate:()=>Promise.resolve()};}return {data:[]};};
    const stream={setDataStream(){},setWaitingStatus(){}};const router={push(){}};
    const modules={react,'react/jsx-runtime':{jsx,jsxs:jsx},'@ai-sdk/react':{Chat,useChat:({chat})=>({messages:chat.messages,setMessages:value=>{chat.messages=typeof value==='function'?value(chat.messages):value;},sendMessage:chat.sendMessage,status:chat.status,stop:chat.stop,regenerate:chat.regenerate,resumeStream:chat.resumeStream,addToolApprovalResponse:chat.addToolApprovalResponse,error:chat.error,clearError:chat.clearError})},ai:{DefaultChatTransport:Transport},'next/navigation':{usePathname:()=>pathname,useRouter:()=>router},swr:{__esModule:true,default:swr,useSWRConfig:()=>({mutate:()=>Promise.resolve()})},'swr/infinite':{unstable_serialize:()=>''},'@/app/_components/chat/chat-title':{projectChatTitle:()=> 'Fixture'},'@/app/_components/chat/data-stream-provider':{useDataStream:()=>stream},'@/app/_components/chat/sidebar-history':{getChatHistoryPaginationKey:()=>''},'@/app/_components/chat/toast':{toast(){}},'@/app/_hooks/use-auto-resume':{useAutoResume(){}},'@/app/_hooks/use-chat-draft':{useChatDraft:()=>react.useState('')},'@/app/_lib/utils':{generateUUID:()=> 'id-'+(++generated),fetcher(){},fetchWithErrorHandlers(){throw new Error('Unexpected network');}},'@/server/domain/model/models':{DEFAULT_CHAT_MODEL:'fixture'}};
    const output={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/_hooks/use-active-chat.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:output,exports:output.exports,require:name=>modules[name]??require(name),process:{env:{}},window:{addEventListener(){},removeEventListener(){},location:{search:''},history:{replaceState(){}}},document:{cookie:''},URLSearchParams,sessionStorage:{removeItem(){}}});
    const render=path=>{pathname=path;cursor=0;const tree=output.exports.ActiveChatProvider({children:null,ownerId:'fixture'});pendingEffects.splice(0).forEach(effect=>effect());return tree.props.value;};
    const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
    (async()=>{
      const a=render('/chat/A'),oldA=instances[0];const pendingA=a.sendMessage({role:'user',parts:[{type:'text',text:'A'}]});await tick();assert.equal(requests[0].id,'A');
      const b=render('/chat/B');await tick();assert.equal(requests[0].aborted,true,'navigation must abort the captured old A stream');await pendingA;
      const pendingB=b.sendMessage({role:'user',parts:[{type:'text',text:'B'}]});await tick();assert.equal(requests[1].id,'B');assert.equal(requests[1].aborted,false);
      await a.stop();await a.sendMessage({role:'user',parts:[{type:'text',text:'stale'}]});await assert.rejects(a.addToolApprovalResponse({id:'stale',approved:true}));await assert.rejects(a.answerAskUser({messageId:'a',toolCallId:'ask',output:{status:'cancelled',answers:{}}}));assert.equal(requests.length,2);assert.equal(requests[1].aborted,false,'old stop handler cannot abort B');
      const freshA=render('/chat/A');await tick();await pendingB;assert.equal(requests[1].aborted,true);assert.notEqual(instances[2],oldA,'returning to A creates a fresh SDK instance');
      await a.sendMessage({role:'user',parts:[{type:'text',text:'obsolete A'}]});await assert.rejects(a.addToolApprovalResponse({id:'old-A',approved:true}));assert.equal(requests.length,2,'A→B→A does not revive old handles');
      const pendingFreshA=freshA.sendMessage({role:'user',parts:[{type:'text',text:'fresh A'}]});await tick();assert.equal(requests.length,3);assert.equal(requests[2].aborted,false);
      slots.forEach(slot=>slot?.cleanup?.());await pendingFreshA;assert.equal(requests[2].aborted,true,'provider unmount aborts its captured current request');
      const lateUnmountSend=freshA.sendMessage({role:'user',parts:[{type:'text',text:'after unmount'}]});await tick();assert.equal(requests.length,3,'unmounted handles cannot start another request');await lateUnmountSend;await assert.rejects(freshA.addToolApprovalResponse({id:'unmounted',approved:true}));
      process.stdout.write('ASYNC_DONE');
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `);
  assert.match(result, /ASYNC_DONE/);
});
