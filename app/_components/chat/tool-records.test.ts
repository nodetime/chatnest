import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function clientScript(code: string) {
  return execFileSync(process.execPath, ["--import", "tsx", "-e", code], {
    encoding: "utf8",
    env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
  });
}

const read = {
  input: { assetId: "fixture-asset", startSegment: 1 },
  output: {
    characters: 12,
    name: "two-pages.pdf",
    nextSegment: null,
    segments: [{ ref: "page:2", text: "Exact returned excerpt" }],
    startSegment: 1,
    status: "ready",
    totalSegments: 2,
    warnings: [],
  },
  state: "output-available",
  toolCallId: "read-fixture",
  type: "tool-readAttachment",
};

function renderGroup(parts: unknown[]) {
  return clientScript(`
    const React = require('react');
    const {renderToStaticMarkup} = require('react-dom/server');
    const {SWRConfig} = require('swr');
    const {ActivityGroup} = require('./app/_components/chat/activity-group.tsx');
    global.fetch = () => {throw new Error('Unexpected network');};
    process.stdout.write(renderToStaticMarkup(React.createElement(SWRConfig, {value:{provider:()=>new Map(),revalidateOnMount:false}},React.createElement(ActivityGroup,{parts:${JSON.stringify(parts)},approve:()=>{},isReadonly:false},React.createElement('button',null,'Original message action')))));
  `);
}

test("one attachment step is a direct row with real filename and message actions, not a one-call Task", () => {
  const html = renderGroup([read]);
  assert.doesNotMatch(html, /执行过程|次调用|data-testid="activity-group"/);
  assert.match(html, /读取文件/);
  assert.match(html, /flex w-full min-w-0 items-start/);
  assert.match(html, /two-pages\.pdf/);
  assert.match(html, /查看调用详情/);
  assert.match(html, /Original message action/);
  assert.doesNotMatch(html, /技术详情|本次读取|非指令/);
});

test("multiple steps retain one Task, exact order and original children", () => {
  const html = renderGroup([
    read,
    {
      ...read,
      approval: { id: "approval-original" },
      state: "approval-requested",
      toolCallId: "pending",
    },
  ]);
  assert.match(html, /2 个步骤/);
  assert.match(html, /data-testid="activity-timeline"/);
  assert.ok(html.indexOf("two-pages.pdf") < html.indexOf("允许执行"));
  assert.match(html, /Original message action/);
});

// Run actual client component logic with only React scheduling and primitive UI
// boundaries replaced. Browser acceptance owns Radix keyboard/focus behavior.
const hookHarness = `
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const vm = require('node:vm');
  const ts = require('typescript');
  const jsx = (type, props, key) => ({type,props,key});
  const hooks = () => {
    const slots=[]; let cursor=0; let dirty=false;
    return {
      react:{useCallback:fn=>fn,useId:()=> 'source-list',useRef:initial=>{const index=cursor++;return slots[index]??(slots[index]={current:initial});},useState:initial=>{
        const index=cursor++; if (!(index in slots)) slots[index]=typeof initial==='function'?initial():initial;
        return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;dirty=true;}];
      }},
      render(fn,props){let tree;do{dirty=false;cursor=0;tree=fn(props);}while(dirty);return tree;}
    };
  };
  const load = (file,modules) => {
    const output={exports:{}};
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(code,{exports:output.exports,module:output,require:name=>modules[name]??require(name)});
    return output.exports;
  };
  const nodes = tree => {
    const all=[];const walk=node=>{if(Array.isArray(node)){node.forEach(walk);return;}if(!node||typeof node!=='object')return;all.push(node);walk(node.props?.children);};walk(tree);return all;
  };
  const base={
    'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
    '@/app/_lib/utils':{cn:(...args)=>args.filter(Boolean).join(' ')},
    '@/app/_components/ui/button':{Button:'button'},
    '@/app/_hooks/use-agent-info':{useAgentInfo:()=>({data:{skills:[]}})},
    '../ai-elements/tool':{Tool:'tool',ToolHeader:'header',ToolContent:'content',ToolInput:'input',ToolOutput:'output'},
    '@/app/_components/ai-elements/task':{Task:'task',TaskTrigger:'task-trigger',TaskContent:'task-content'},
    './tool-activity':{ToolActivity:'step'},
    './agent-pause-notice':{AgentPauseNotice:'paused'},'@/server/domain/message/agent-interactions':{hasPendingInteraction:()=>false},'./runtime-recovery':{RuntimeRecovery:'recovery'},
    './tool-call-details':{ToolCallDetails:'call-details'},
    './attachment-read-result':require('./app/_components/chat/attachment-read-result.tsx'),
    './activity-groups':require('./app/_components/chat/activity-groups.ts'),
    './tool-activity-state':require('./app/_components/chat/tool-activity-state.ts'),
    './tool-presentation':require('./app/_components/chat/tool-presentation.ts'),
    './tool-result-preview':require('./app/_components/chat/tool-result-preview.tsx'),
    '@/server/domain/message/sources':require('./server/domain/message/sources.ts'),
  };
`;

test("expanded attachment excerpts are direct, exact, bounded and retain real partial-read warnings", () => {
  const html = clientScript(`
    const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
    const {AttachmentReadResult}=require('./app/_components/chat/attachment-read-result.tsx');
    process.stdout.write(renderToStaticMarkup(React.createElement(AttachmentReadResult,{output:${JSON.stringify({ ...read.output, nextSegment: 2, status: "truncated", totalSegments: 3, warnings: ["Exact parser warning"] })}})));
  `);
  assert.match(html, /page:2/);
  assert.match(html, /Exact returned excerpt/);
  assert.match(html, /Exact parser warning/);
  assert.match(html, /仍有后续内容/);
  assert.match(html, /部分文字/);
  assert.match(html, /max-h-80 overflow-auto/);
  assert.doesNotMatch(html, /<details|<summary|字符|共 .* 段|非指令|技术详情/);
});

test("unknown or malformed attachment returns are not rendered as successful source evidence", () => {
  clientScript(`
    const assert=require('node:assert/strict');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
    const {AttachmentReadResult,parseAttachmentReadResult}=require('./app/_components/chat/attachment-read-result.tsx');
    const good=${JSON.stringify(read.output)};
    for(const output of [null, false, 'raw', [], {}, {...good,name:{}}, {...good,segments:{}}, {...good,segments:[{ref:3,text:'bad'}]}, {...good,warnings:{}}, {...good,nextSegment:'unknown'}, {...good,startSegment:-1}, {...good,totalSegments:NaN}, {...good,status:'locked'}]) {
      assert.equal(parseAttachmentReadResult(output),null);
      const html=renderToStaticMarkup(React.createElement(AttachmentReadResult,{output}));
      assert.match(html,/返回内容格式未识别/);
      assert.doesNotMatch(html,/已到结尾|本次读取|Exact returned excerpt/);
    }
  `);
});

test("pure call details preserve original name, input, output including falsey JSON and raw error", () => {
  clientScript(`
    const assert=require('node:assert/strict');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
    const {ToolCallDetailsContent}=require('./app/_components/chat/tool-call-details.tsx');
    for(const output of [false,0,'',null,{error:'MCP evidence',name:'raw name'},{items:[{title:'Reader heading',item_id:'original-id',price:59,seller:'original-seller'}]}]) {
      const part={type:'dynamic-tool',toolName:'provider__exact_tool',toolCallId:'evidence',state:'output-error',input:{query:{nested:'raw input'}},output,errorText:'An error occurred.'};
      const html=renderToStaticMarkup(React.createElement(ToolCallDetailsContent,{part}));
      assert.ok(html.includes('provider__exact_tool'));
      assert.ok(html.includes('raw input'));
      assert.ok(html.includes('An error occurred.'));
      const escaped=JSON.stringify(output,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
      assert.ok(html.includes(escaped),html);
      assert.doesNotMatch(html,/暂无结果|未返回结果/);
    }
  `);
});

test("actual ToolActivity disclosure, canonical approval identity, callbacks and readonly guard remain intact", () => {
  clientScript(
    `${hookHarness}
    const scheduler=hooks();const {ToolActivity}=load('app/_components/chat/tool-activity.tsx',{...base,react:scheduler.react});
    const decisions=[];const part={type:'dynamic-tool',toolName:'billing__perform_operation',toolCallId:'call',state:'approval-requested',input:{opaque:{amount:7}},approval:{id:'exact-id'}};
    let props={part,approve:value=>decisions.push(value),isReadonly:false,isRunning:true};
    let tree=scheduler.render(ToolActivity,props);
    assert.equal(nodes(tree).find(n=>n.type==='tool').props.open,true);
    const text=JSON.stringify(tree);assert.ok(text.includes('billing__perform_operation'));assert.ok(text.includes('查看调用详情'));assert.ok(!text.includes('只读操作'));
    const buttons=nodes(tree).filter(n=>n.type==='button');buttons.find(n=>n.props.children==='允许执行').props.onClick();buttons.find(n=>n.props.children==='拒绝').props.onClick();
    assert.equal(JSON.stringify(decisions),JSON.stringify([{approved:true,id:'exact-id'}]),'same approval accepts only one decision');
    nodes(tree).find(n=>n.type==='tool').props.onOpenChange(false);
    assert.equal(nodes(scheduler.render(ToolActivity,props)).find(n=>n.type==='tool').props.open,false);
    props={...props,part:{...part,approval:{id:'new-id'}}};
    tree=scheduler.render(ToolActivity,props);assert.equal(nodes(tree).find(n=>n.type==='tool').props.open,true);nodes(tree).find(n=>n.type==='button'&&n.props.children==='拒绝').props.onClick();assert.equal(JSON.stringify(decisions[1]),JSON.stringify({approved:false,id:'new-id',reason:'用户拒绝执行'}));
    tree=scheduler.render(ToolActivity,{...props,isReadonly:true});assert.equal(nodes(tree).filter(n=>n.type==='button').length,0);
    tree=scheduler.render(ToolActivity,{...props,part:{...part,state:'output-error',errorText:'raw failure'}});assert.ok(JSON.stringify(tree).includes('raw failure'));
  `
  );
});

test("singleton to multi keeps the same keyed step path, user disclosure state and children reachable", () => {
  clientScript(
    `${hookHarness}
    const scheduler=hooks();const {ActivityGroup}=load('app/_components/chat/activity-group.tsx',{...base,react:scheduler.react});
    const first=${JSON.stringify(read)};let props={parts:[first],approve:()=>{},isReadonly:false,children:jsx('original-actions',{children:'actions'})};
    let tree=scheduler.render(ActivityGroup,props);
    const path=(node,key,p=[])=>{if(Array.isArray(node)){for(let i=0;i<node.length;i++){const found=path(node[i],key,[...p,i]);if(found)return found;}return;}if(!node||typeof node!=='object')return;if(node.type==='step'&&node.key===key)return p;return path(node.props?.children,key,[...p,node.type]);};
    const before=path(tree,first.toolCallId);assert.ok(before);
    props={...props,parts:[first,{...first,toolCallId:'second'}]};tree=scheduler.render(ActivityGroup,props);
    assert.equal(JSON.stringify(path(tree,first.toolCallId)),JSON.stringify(before));
    const task=nodes(tree).find(n=>n.type==='task');assert.equal(task.props.open,true);
    task.props.onOpenChange(false);tree=scheduler.render(ActivityGroup,props);assert.equal(nodes(tree).find(n=>n.type==='task').props.open,false);
    assert.ok(nodes(tree).some(n=>n.type==='original-actions'));
    assert.equal(nodes(tree).filter(n=>n.type==='step').map(n=>n.props.part.toolCallId).join(','),'read-fixture,second');
  `
  );
});

test("actual Messages keeps canonical keyed messages, order and callbacks without content-dependent regrouping", () => {
  clientScript(
    `${hookHarness}
    const {Messages}=load('app/_components/chat/messages.tsx',{
      ...base,
      '@/app/_components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'conversation-content',ConversationScrollButton:'scroll-button'},
      '@/server/domain/message/message-turn':{prepareRegeneration:()=>true},
      './activity-group':{ActivityGroup:'activity'},
      './data-stream-provider':{useDataStream:()=>({})},
      './greeting':{Greeting:'greeting'},
      './message':{PreviewMessage:'preview',ThinkingMessage:'thinking'},
    });
    const first=${JSON.stringify(read)};const approve=()=>{};const edit=()=>{};
    const a={id:'a',role:'assistant',parts:[{type:'text',text:''},first]};
    const b={id:'b',role:'assistant',parts:[{...first,toolCallId:'second'}]};
    const boundary={id:'boundary',role:'assistant',parts:[{type:'text',text:'answer'}]};
    const c={id:'c',role:'assistant',parts:[{...first,toolCallId:'third'}]};
    const props={messages:[a,b,boundary,c],chatId:'chat',status:'streaming',addToolApprovalResponse:approve,onEditMessage:edit,setMessages:()=>{},regenerate:()=>{},isReadonly:false};
    const tree=Messages(props);assert.equal(nodes(tree).filter(n=>n.type==='activity').length,0);
    const previews=nodes(tree).filter(n=>n.type==='preview');assert.equal(previews.map(n=>n.props.message.id).join(','),'a,b,boundary,c');
    assert.equal(previews[0].props.message,a);assert.equal(previews[1].props.message,b);
    for(const node of previews){assert.equal(node.key,node.props.message.id);assert.equal(node.props.onEdit,edit);assert.equal(node.props.addToolApprovalResponse,approve);assert.notEqual(node.props.hideActivities,true);}
    assert.equal(previews[0].props.isLoading,false);assert.equal(previews[3].props.isLoading,true);
    const singleton=Messages({...props,messages:[a]});const firstPreview=nodes(singleton).find(n=>n.type==='preview');
    assert.equal(firstPreview.key,previews[0].key);assert.equal(firstPreview.props.message,previews[0].props.message);
  `
  );
});

test("actual PreviewMessage mixed-part grouping retains timeline boundaries, stable keys and message action callbacks", () => {
  clientScript(`${hookHarness}
    const {PreviewMessage}=load('app/_components/chat/message.tsx',{
      ...base,react:{useCallback:fn=>fn},
      '@/app/_lib/utils':{cn:()=>'',sanitizeText:text=>text},
      '../ai-elements/message':{MessageContent:'text',MessageResponse:'response'},
      '../ai-elements/shimmer':{Shimmer:'shimmer'},
      './activity-group':{ActivityGroup:'activity'},
      './data-stream-provider':{useDataStream:()=>({})},
      './document':{},'./document-preview':{},'./icons':{},
      './message-actions':{MessageActions:'actions'},
      './message-reasoning':{MessageReasoning:'reasoning'},
      './preview-attachment':{},'./tool-activity':{},'./ask-user':{AskUser:'ask'},'./weather':{},
    });
    const first=${JSON.stringify(read)};const approve=()=>{};const edit=()=>{};
    const message={id:'mixed',role:'assistant',parts:[{type:'reasoning',text:'before'},first,{type:'text',text:'answer'}]};
    const props={message,addToolApprovalResponse:approve,isLoading:true,isReadonly:false,onEdit:edit};
    const tree=PreviewMessage(props);const firstGroup=nodes(tree).find(n=>n.type==='activity');
    assert.equal(firstGroup.props.parts[0],first);assert.equal(firstGroup.props.approve,approve);
    const next=PreviewMessage({...props,message:{...message,parts:[message.parts[0],first,{...first,toolCallId:'second'},message.parts[2]]}});
    const group=nodes(next).find(n=>n.type==='activity');assert.equal(group.key,firstGroup.key);
    assert.equal(group.props.parts.map(p=>p.toolCallId).join(','),'read-fixture,second');
    const order=nodes(next).filter(n=>['reasoning','activity','response','actions'].includes(n.type)).map(n=>n.type);
    assert.equal(order.join(','),'reasoning,activity,response,actions');
    const actions=nodes(next).find(n=>n.type==='actions');actions.props.onEdit();assert.equal(actions.props.message.id,'mixed');
    const hidden=PreviewMessage({...props,hideActivities:true});assert.equal(nodes(hidden).filter(n=>n.type==='activity').length,0);assert.equal(nodes(hidden).filter(n=>n.type==='actions').length,1);
  `);
});

test("submitted approval continuation remains active only for the latest group or mixed message, never historical calls", () => {
  clientScript(`${hookHarness}
    const {Messages}=load('app/_components/chat/messages.tsx',{
      ...base,
      '@/app/_components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'conversation-content',ConversationScrollButton:'scroll-button'},
      '@/server/domain/message/message-turn':{prepareRegeneration:()=>true},
      './activity-group':{ActivityGroup:'activity'},
      './data-stream-provider':{useDataStream:()=>({})},
      './greeting':{Greeting:'greeting'},
      './message':{PreviewMessage:'preview',ThinkingMessage:'thinking'},
    });
    const {activitySummary}=base['./activity-groups'];
    const pending={type:'dynamic-tool',toolName:'fixture__operation',toolCallId:'pending',state:'approval-responded',approval:{id:'approval-id',approved:true},input:{}};
    const old={id:'old',role:'assistant',parts:[{...pending,toolCallId:'stopped'}]};
    const boundary={id:'user',role:'user',parts:[{type:'text',text:'continue'}]};
    const latest={id:'latest',role:'assistant',parts:[pending]};
    const props={chatId:'chat',messages:[old,boundary,latest],addToolApprovalResponse:()=>{},setMessages:()=>{},regenerate:()=>{},isReadonly:false};
    for(const status of ['submitted','streaming','ready','error']) {
      const active=status==='submitted'||status==='streaming';
      const tree=Messages({...props,status});const previews=nodes(tree).filter(n=>n.type==='preview'&&n.props.message.role==='assistant');
      assert.equal(previews[0].props.isLoading,false,'historical '+status);
      assert.equal(previews[1].props.isLoading,active,'latest '+status);
      assert.equal(activitySummary(previews[0].props.message.parts,previews[0].props.isLoading).label,'未完成');
      assert.equal(activitySummary(previews[1].props.message.parts,previews[1].props.isLoading).label,active?'执行中':'未完成');
      const mixed={...latest,parts:[{type:'text',text:'operation context'},pending]};
      const mixedTree=Messages({...props,status,messages:[old,boundary,mixed]});
      const latestPreview=nodes(mixedTree).find(n=>n.type==='preview'&&n.props.message.id==='latest');
      assert.equal(latestPreview.props.isLoading,active,'mixed latest '+status);
      const denied={...pending,approval:{id:'approval-id',approved:false}};
      assert.equal(activitySummary([denied],active).state,'output-denied');
      const failed={...pending,state:'output-error',errorText:'Exact failure'};
      assert.equal(activitySummary([failed],active).state,'output-error');
    }
    const sending=Messages({...props,status:'submitted',messages:[old,boundary]});
    assert.equal(nodes(sending).find(n=>n.type==='preview').props.isLoading,false,'new user submission does not revive old tools');
  `);
});

test("an open call-details Sheet pins its exact multi-step trigger through completion and close, not ordinary completion", () => {
  clientScript(`${hookHarness}
    const scheduler=hooks();const {ActivityGroup}=load('app/_components/chat/activity-group.tsx',{...base,react:scheduler.react});
    const active={type:'dynamic-tool',toolName:'fixture__operation',toolCallId:'first',state:'input-available',input:{}};
    const second={...active,toolCallId:'second'};
    const props={parts:[active,second],approve:()=>{},isReadonly:false,isRunning:true};
    let tree=scheduler.render(ActivityGroup,props);
    const firstStep=nodes(tree).find(n=>n.type==='step'&&n.props.part.toolCallId==='first');
    assert.equal(typeof firstStep.props.onDetailsOpenChange,'function','group exposes inspection callback');
    const childScheduler=hooks();
    const {ToolActivity}=load('app/_components/chat/tool-activity.tsx',{...base,react:childScheduler.react});
    const child=childScheduler.render(ToolActivity,firstStep.props);
    const details=nodes(child).find(n=>n.type==='call-details');
    const {ToolCallDetails}=load('app/_components/chat/tool-call-details.tsx',{
      ...base,
      '@/app/_components/ui/sheet':{Sheet:'sheet',SheetTrigger:'sheet-trigger',SheetContent:'sheet-content',SheetClose:'sheet-close',SheetHeader:'sheet-header',SheetTitle:'sheet-title',SheetDescription:'sheet-description'},
    });
    const sheet=ToolCallDetails(details.props);
    assert.equal(typeof sheet.props.onOpenChange,'function','actual Sheet forwards inspection events');
    sheet.props.onOpenChange(true);
    const completed={...props,isRunning:false,parts:props.parts.map(p=>({...p,state:'output-available',output:{result:'done'}}))};
    tree=scheduler.render(ActivityGroup,completed);
    assert.equal(nodes(tree).find(n=>n.type==='task').props.open,true,'completion retains visible exact trigger');
    assert.equal(nodes(tree).find(n=>n.type==='task-content').props.hidden,false);
    sheet.props.onOpenChange(false);
    tree=scheduler.render(ActivityGroup,completed);
    assert.equal(nodes(tree).find(n=>n.type==='task').props.open,true,'close autofocus can still reach original row');
    nodes(tree).find(n=>n.type==='task').props.onOpenChange(false);
    assert.equal(nodes(scheduler.render(ActivityGroup,completed)).find(n=>n.type==='task').props.open,false,'manual collapse still works');
    const ordinary=hooks();ordinary.render(ActivityGroup,props);
    assert.equal(nodes(ordinary.render(ActivityGroup,completed)).find(n=>n.type==='task').props.open,false,'ordinary successful group still auto-collapses');
  `);
});

test("removed inspections and stale Sheet close events cannot pin or dismiss a different current call", () => {
  clientScript(`${hookHarness}
    const scheduler=hooks();const {ActivityGroup}=load('app/_components/chat/activity-group.tsx',{...base,react:scheduler.react});
    const tool=id=>({type:'dynamic-tool',toolName:'fixture__operation',toolCallId:id,state:'input-available',input:{}});
    const props={parts:[tool('first'),tool('second'),tool('third')],approve:()=>{},isReadonly:false,isRunning:true};
    let tree=scheduler.render(ActivityGroup,props);
    const report=nodes(tree).find(n=>n.type==='step').props.onDetailsOpenChange;
    assert.equal(typeof report,'function');
    report('first',true);report('second',true);report('first',false);
    const completed={...props,isRunning:false,parts:props.parts.map(p=>({...p,state:'output-available',output:{}}))};
    tree=scheduler.render(ActivityGroup,completed);
    assert.equal(nodes(tree).find(n=>n.type==='task').props.open,true,'stale close preserves current second inspection');
    const removed=hooks();let other=removed.render(ActivityGroup,props);
    nodes(other).find(n=>n.type==='step').props.onDetailsOpenChange('first',true);
    other=removed.render(ActivityGroup,{...completed,parts:completed.parts.slice(1)});
    assert.equal(nodes(other).find(n=>n.type==='task').props.open,false,'removed trigger cannot pin completion open');
  `);
});

test("actual Messages preserves the inspected tool subtree when the same assistant message gains answer text", () => {
  clientScript(`${hookHarness}
    let currentHooks;
    const react={useCallback:fn=>fn,useId:()=> 'source-list',useRef:initial=>currentHooks.react.useRef(initial),useState:initial=>currentHooks.react.useState(initial)};
    const FixtureSheet=props=>{
      const [open,setOpen]=react.useState(false);
      const part=nodes(props.children).find(n=>n.props?.part)?.props.part;
      return jsx('fixture-sheet',{...props,callId:part?.toolCallId,open,onOpenChange:value=>{setOpen(value);props.onOpenChange?.(value);}});
    };
    const {ToolCallDetails}=load('app/_components/chat/tool-call-details.tsx',{
      ...base,react,
      '@/app/_components/ui/sheet':{Sheet:FixtureSheet,SheetTrigger:'sheet-trigger',SheetContent:'sheet-content',SheetClose:'sheet-close',SheetHeader:'sheet-header',SheetTitle:'sheet-title',SheetDescription:'sheet-description'},
    });
    const {ToolActivity}=load('app/_components/chat/tool-activity.tsx',{...base,react,'./tool-call-details':{ToolCallDetails}});
    const {ActivityGroup}=load('app/_components/chat/activity-group.tsx',{...base,react,'./tool-activity':{ToolActivity}});
    const {PreviewMessage}=load('app/_components/chat/message.tsx',{
      ...base,react,
      '@/app/_lib/utils':{cn:()=>'',sanitizeText:text=>text},
      '../ai-elements/message':{MessageContent:'text',MessageResponse:'response'},
      '../ai-elements/shimmer':{Shimmer:'shimmer'},
      './activity-group':{ActivityGroup},
      './data-stream-provider':{useDataStream:()=>({})},
      './document':{},'./document-preview':{},'./icons':{},
      './message-actions':{MessageActions:'actions'},
      './message-reasoning':{MessageReasoning:'reasoning'},
      './preview-attachment':{},'./tool-activity':{ToolActivity},'./ask-user':{AskUser:'ask'},'./weather':{},
    });
    const {Messages}=load('app/_components/chat/messages.tsx',{
      ...base,react,
      '@/app/_components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'conversation-content',ConversationScrollButton:'scroll-button'},
      '@/server/domain/message/message-turn':{prepareRegeneration:()=>true},
      './activity-group':{ActivityGroup},
      './data-stream-provider':{useDataStream:()=>({})},
      './greeting':{Greeting:'greeting'},
      './message':{PreviewMessage,ThinkingMessage:'thinking'},
    });
    // Preserve hooks only for the same element type and keyed ancestry, matching
    // React's ownership boundary. This catches content-dependent reparenting,
    // unlike a Group-only callback test that never renders its parent switch.
    const componentIds=new Map();const instances=new Map();let sequence=0;
    const expand=(node,path='root')=>{
      if(Array.isArray(node))return node.map((child,index)=>expand(child,path+'/'+(child?.key??index)));
      if(!node||typeof node!=='object')return node;
      if(typeof node.type==='function'){
        if(!componentIds.has(node.type))componentIds.set(node.type,++sequence);
        const identity=path+':component-'+componentIds.get(node.type);
        if(!instances.has(identity))instances.set(identity,hooks());
        currentHooks=instances.get(identity);
        const rendered=currentHooks.render(node.type,node.props);
        return expand(rendered,identity+'/render');
      }
      return {...node,identity:path,props:{...node.props,children:expand(node.props?.children,path+'/'+String(node.type))}};
    };
    const tool=id=>({type:'dynamic-tool',toolName:'fixture__search',toolCallId:id,state:'input-available',input:{query:id}});
    const pending={id:'canonical-assistant',role:'assistant',parts:[tool('first'),tool('second')]};
    const props={chatId:'chat',messages:[pending],status:'streaming',addToolApprovalResponse:()=>{},setMessages:()=>{},regenerate:()=>{},isReadonly:false};
    let tree=expand(jsx(Messages,props));
    let sheet=nodes(tree).find(n=>n.type==='fixture-sheet'&&n.props.callId==='second');
    assert.ok(sheet);sheet.props.onOpenChange(true);
    tree=expand(jsx(Messages,props));sheet=nodes(tree).find(n=>n.type==='fixture-sheet'&&n.props.callId==='second');
    assert.equal(sheet.props.open,true);const identity=sheet.identity;
    const completed={...pending,parts:[...pending.parts.map(p=>({...p,state:'output-available',output:{result:p.toolCallId}})),{type:'text',text:'Final answer'}]};
    tree=expand(jsx(Messages,{...props,status:'ready',messages:[completed]}));
    sheet=nodes(tree).find(n=>n.type==='fixture-sheet'&&n.props.callId==='second');
    assert.equal(sheet.identity,identity,'same canonical message/tool must retain its keyed ownership path');
    assert.equal(sheet.props.open,true,'answer text must not destroy an open call-details dialog');
    assert.equal(nodes(tree).find(n=>n.type==='task').props.open,true);
    assert.ok(nodes(tree).some(n=>n.type==='response'&&n.props.children==='Final answer'));
    sheet.props.onOpenChange(false);
    tree=expand(jsx(Messages,{...props,status:'ready',messages:[completed]}));
    sheet=nodes(tree).find(n=>n.type==='fixture-sheet'&&n.props.callId==='second');
    assert.equal(sheet.identity,identity);assert.equal(sheet.props.open,false);
    assert.equal(nodes(tree).find(n=>n.type==='task').props.open,true,'original trigger remains visible for close autofocus');
  `);
});

test("canonical tool-only messages omit empty answer actions while text, artifacts and final regeneration retain theirs", () => {
  clientScript(`${hookHarness}
    const {PreviewMessage}=load('app/_components/chat/message.tsx',{
      ...base,react:{useCallback:fn=>fn},
      '@/app/_lib/utils':{cn:()=>'',sanitizeText:text=>text},
      '../ai-elements/message':{MessageContent:'text',MessageResponse:'response'},
      '../ai-elements/shimmer':{Shimmer:'shimmer'},
      './activity-group':{ActivityGroup:'activity'},
      './data-stream-provider':{useDataStream:()=>({})},
      './document':{},'./document-preview':{DocumentPreview:'artifact'},'./icons':{},
      './message-actions':{MessageActions:'actions'},
      './message-reasoning':{MessageReasoning:'reasoning'},
      './preview-attachment':{},'./tool-activity':{},'./ask-user':{AskUser:'ask'},'./weather':{},
    });
    const message={id:'tool-only',role:'assistant',parts:[${JSON.stringify(read)}]};
    const props={message,addToolApprovalResponse:()=>{},isLoading:false,isReadonly:false};
    assert.equal(nodes(PreviewMessage(props)).filter(n=>n.type==='actions').length,0,'no copy/vote bar under bare action rows');
    let regenerateCount=0;const regenerate=()=>regenerateCount++;
    let tree=PreviewMessage({...props,onRegenerate:regenerate});
    const actions=nodes(tree).find(n=>n.type==='actions');assert.ok(actions);actions.props.onRegenerate();assert.equal(regenerateCount,1);
    tree=PreviewMessage({...props,message:{...message,parts:[...message.parts,{type:'text',text:'Answer'}]}});
    assert.equal(nodes(tree).filter(n=>n.type==='actions').length,1,'answer actions preserved');
    tree=PreviewMessage({...props,message:{...message,parts:[{type:'tool-createDocument',toolCallId:'artifact',state:'output-available',input:{title:'Artifact'},output:{id:'artifact-id',kind:'text',title:'Artifact'}}]}});
    assert.equal(nodes(tree).filter(n=>n.type==='artifact').length,1);assert.equal(nodes(tree).filter(n=>n.type==='actions').length,1,'artifact message actions preserved');
    assert.equal(nodes(PreviewMessage({...props,isReadonly:true,onRegenerate:regenerate})).filter(n=>n.type==='actions').length,0);
  `);
});

test("only the active native table handoff omits a temporary Sheet trigger; fallback evidence and MCP names keep details", () => {
  clientScript(`${hookHarness}
    const scheduler=hooks();const {ToolActivity}=load('app/_components/chat/tool-activity.tsx',{...base,react:scheduler.react});
    const table={type:'tool-createResultTable',toolCallId:'table-handoff',input:{title:'Table'}};
    for(const state of ['input-streaming','input-available','approval-responded']) {
      const part={...table,state,...(state==='approval-responded'?{approval:{id:'native-approved',approved:true}}:{})};
      const tree=scheduler.render(ToolActivity,{part,approve:()=>{},isReadonly:false,isRunning:true});
      assert.equal(nodes(tree).filter(n=>n.type==='call-details').length,0,'no dialog to unmount during native '+state+' handoff');
    }
    for(const part of [
      {...table,state:'input-available'},
      {...table,state:'output-error',errorText:'Exact native failure'},
      {...table,state:'output-denied'},
      {...table,state:'approval-responded',approval:{id:'denied',approved:false}},
      {...table,state:'output-available',output:{error:'Native returned failure'}},
      {...table,state:'output-available',output:null},
      {...table,state:'approval-requested',approval:{id:'exact-approval'}},
      {type:'dynamic-tool',toolName:'createResultTable',toolCallId:'dynamic-lookalike',state:'input-available',input:{}},
      {type:'dynamic-tool',toolName:'provider__createResultTable',toolCallId:'mcp-lookalike',state:'input-available',input:{}},
    ]) {
      const tree=scheduler.render(ToolActivity,{part,approve:()=>{},isReadonly:false,isRunning:part.toolCallId!=='table-handoff'||part.state!=='input-available'});
      assert.equal(nodes(tree).filter(n=>n.type==='call-details').length,1,'details remain reachable for '+part.type+' '+part.state);
    }
    const {PreviewMessage}=load('app/_components/chat/message.tsx',{
      ...base,react:{useCallback:fn=>fn},
      '@/app/_lib/utils':{cn:()=>'',sanitizeText:text=>text},
      '../ai-elements/message':{MessageContent:'text',MessageResponse:'response'},
      '../ai-elements/shimmer':{Shimmer:'shimmer'},
      './activity-group':{ActivityGroup:'activity'},
      './data-stream-provider':{useDataStream:()=>({})},
      './document':{},'./document-preview':{DocumentPreview:'artifact'},'./icons':{},
      './message-actions':{MessageActions:'actions'},
      './message-reasoning':{MessageReasoning:'reasoning'},
      './preview-attachment':{},'./tool-activity':{ToolActivity},'./ask-user':{AskUser:'ask'},'./weather':{},
    });
    const props={message:{id:'native-message',role:'assistant',parts:[{...table,state:'input-available'}]},addToolApprovalResponse:()=>{},isLoading:true,isReadonly:false};
    const pending=nodes(PreviewMessage(props)).find(n=>n.type===ToolActivity);assert.ok(pending);
    assert.equal(nodes(scheduler.render(ToolActivity,pending.props)).filter(n=>n.type==='call-details').length,0);
    const output={id:'00000000-0000-4000-8000-000000000001',kind:'sheet',title:'Table'};
    const result=nodes(PreviewMessage({...props,isLoading:false,message:{...props.message,parts:[{...table,state:'output-available',output}]}})).find(n=>n.type==='artifact');
    assert.ok(result);assert.equal(result.props.result,output,'successful native artifact renderer remains authoritative');
  `);
});

test("actual expanded tool body uses readable results once and preserves honest pending, denied and error bodies", () => {
  clientScript(`${hookHarness}
    const scheduler=hooks();const {ToolActivity}=load('app/_components/chat/tool-activity.tsx',{...base,react:scheduler.react});
    const {ToolResultPreview}=base['./tool-result-preview'];
    const part={type:'dynamic-tool',toolName:'fixture__search',toolCallId:'readable',state:'input-available',input:{query:'one query'}};
    const props={part,approve:()=>{},isReadonly:false,isRunning:true};
    let tree=scheduler.render(ToolActivity,props);assert.ok(JSON.stringify(tree).includes('正在等待工具返回结果'));
    tree=scheduler.render(ToolActivity,{...props,isRunning:false,part:{...part,state:'output-denied'}});assert.ok(JSON.stringify(tree).includes('这次操作已被拒绝'));
    tree=scheduler.render(ToolActivity,{...props,isRunning:false,part:{...part,state:'output-error'}});assert.ok(JSON.stringify(tree).includes('未返回错误说明'));
    const completed={...props,isRunning:false,part:{...part,state:'output-available',output:{content:[{type:'text',text:'Plain exact result'}]}}};
    tree=scheduler.render(ToolActivity,completed);nodes(tree).find(n=>n.type==='tool').props.onOpenChange(true);
    tree=scheduler.render(ToolActivity,completed);
    const content=nodes(tree).find(n=>n.type==='content');const result=nodes(content).find(n=>n.type===ToolResultPreview);
    assert.ok(result,'actual ToolActivity composes readable result renderer');
    const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
    const html=renderToStaticMarkup(React.createElement(ToolResultPreview,result.props));assert.ok(html.includes('Plain exact result'));assert.ok(!html.includes('one query'));
    assert.equal(nodes(tree).find(n=>n.type==='tool').props.open,true);
  `);
});

test("short trusted actions retain their label while subjects truncate before arbitrary aliases or skill names", () => {
  clientScript(`${hookHarness}
    const scheduler=hooks();const {ToolActivity}=load('app/_components/chat/tool-activity.tsx',{
      ...base,react:scheduler.react,
      '@/app/_hooks/use-agent-info':{useAgentInfo:()=>({data:{servers:[{toolAliases:[
        {alias:'mapped-search',name:'search.web',serverName:'Provider'},
        {alias:'mapped-web',name:'tavily_extract',serverName:'Provider'}
      ]}]}})}
    });
    const basePart={type:'dynamic-tool',toolName:'unmapped-long-alias',toolCallId:'width',state:'output-available',input:{query:'A long subject that should truncate first'},output:{}};
    for(const [patch,expected] of [
      [{toolName:'mapped-search'},true],
      [{toolName:'mapped-web'},true],
      [{type:'tool-readSkillResource'},true],
      [{type:'tool-readAttachment'},true],
      [{},false],
      [{toolName:'readSkillResource'},false],
      [{type:'tool-loadSkill',output:{name:'skill',displayName:'A potentially very long skill title',description:'Purpose',instructions:'Original'}},false],
    ]) {
      const tree=scheduler.render(ToolActivity,{part:{...basePart,...patch},approve:()=>{},isReadonly:false,isRunning:false});
      assert.equal(nodes(tree).find(n=>n.type==='header').props.inlineContext,expected,JSON.stringify(patch));
    }
  `);
});

test("reopened failed-only assistant is visible without answer actions or forged text", () => {
  clientScript(`${hookHarness}
    const {PreviewMessage}=load('app/_components/chat/message.tsx',{
      ...base,react:{useCallback:fn=>fn},
      '@/app/_lib/utils':{cn:()=>'',sanitizeText:text=>text},
      '../ai-elements/message':{MessageContent:'text',MessageResponse:'response'},
      '../ai-elements/shimmer':{Shimmer:'shimmer'},
      './activity-group':{ActivityGroup:'activity'},
      './data-stream-provider':{useDataStream:()=>({})},
      './document':{},'./document-preview':{},
      './message-actions':{MessageActions:'actions'},
      './message-reasoning':{MessageReasoning:'reasoning'},
      './preview-attachment':{},'./tool-activity':{},'./ask-user':{AskUser:'ask'},'./weather':{},
    });
    const message={id:'failed',role:'assistant',parts:[{type:'data-run-status',id:'run-status',data:{state:'failed'}}]};
    const props={message,isLoading:false,isReadonly:false};
    const tree=PreviewMessage(props);assert.equal(tree.props.hidden,false);
    assert.ok(nodes(tree).some(n=>n.props?.['data-testid']==='run-failure'));
    assert.ok(!nodes(tree).some(n=>['actions','response','shimmer'].includes(n.type)));
    assert.equal(PreviewMessage({...props,message:{...message,parts:[]}}).props.hidden,true);
    const tool={type:'dynamic-tool',toolName:'porta__test',toolCallId:'call',state:'output-available',input:{},output:{value:'original'}};
    for(const state of ['failed','resumed']){
      const mixed=PreviewMessage({...props,message:{...message,parts:[tool,{...message.parts[0],data:{state}}]}});
      assert.ok(!nodes(mixed).some(n=>n.type==='actions'),'status must not turn tool-only into an answer');
    }
    const {groupActivityParts}=require('./app/_components/chat/activity-groups.ts');
    const grouped=groupActivityParts([tool,{...message.parts[0],data:{state:'resumed'}},{...tool,toolCallId:'second'}]);
    assert.equal(grouped.length,1);assert.equal(grouped[0].parts.length,2);

    const partial=PreviewMessage({...props,message:{...message,parts:[{type:'text',text:'original partial response'},...message.parts]}});
    assert.ok(nodes(partial).some(n=>n.type==='response'&&n.props.children==='original partial response'));
  `);
});
