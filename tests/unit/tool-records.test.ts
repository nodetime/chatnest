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
    const {ActivityGroup} = require('./components/chat/activity-group.tsx');
    global.fetch = () => {throw new Error('Unexpected network');};
    process.stdout.write(renderToStaticMarkup(React.createElement(SWRConfig, {value:{provider:()=>new Map(),revalidateOnMount:false}},React.createElement(ActivityGroup,{parts:${JSON.stringify(parts)},approve:()=>{},isReadonly:false},React.createElement('button',null,'Original message action')))));
  `);
}

test("one attachment step is a direct row with real filename and message actions, not a one-call Task", () => {
  const html = renderGroup([read]);
  assert.doesNotMatch(html, /执行过程|次调用|data-testid="activity-group"/);
  assert.match(html, /读取文件/);
  assert.match(html, /flex w-fit max-w-full items-center/);
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
      react:{useCallback:fn=>fn,useId:()=> 'source-list',useState:initial=>{
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
    '@/lib/utils':{cn:(...args)=>args.filter(Boolean).join(' ')},
    '@/components/ui/button':{Button:'button'},
    '@/hooks/use-agent-info':{useAgentInfo:()=>({data:{skills:[]}})},
    '../ai-elements/tool':{Tool:'tool',ToolHeader:'header',ToolContent:'content',ToolInput:'input',ToolOutput:'output'},
    '@/components/ai-elements/task':{Task:'task',TaskTrigger:'task-trigger',TaskContent:'task-content'},
    './tool-activity':{ToolActivity:'step'},
    './tool-call-details':{ToolCallDetails:'call-details'},
    './attachment-read-result':require('./components/chat/attachment-read-result.tsx'),
    './activity-groups':require('./components/chat/activity-groups.ts'),
    './tool-activity-state':require('./components/chat/tool-activity-state.ts'),
    '@/lib/agent/sources':require('./lib/agent/sources.ts'),
  };
`;

test("expanded attachment excerpts are direct, exact, bounded and retain real partial-read warnings", () => {
  const html = clientScript(`
    const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
    const {AttachmentReadResult}=require('./components/chat/attachment-read-result.tsx');
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
    const {AttachmentReadResult,parseAttachmentReadResult}=require('./components/chat/attachment-read-result.tsx');
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
    const {ToolCallDetailsContent}=require('./components/chat/tool-call-details.tsx');
    for(const output of [false,0,'',null,{error:'MCP evidence',name:'raw name'}]) {
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
    const scheduler=hooks();const {ToolActivity}=load('components/chat/tool-activity.tsx',{...base,react:scheduler.react});
    const decisions=[];const part={type:'dynamic-tool',toolName:'billing__perform_operation',toolCallId:'call',state:'approval-requested',input:{opaque:{amount:7}},approval:{id:'exact-id'}};
    let props={part,approve:value=>decisions.push(value),isReadonly:false,isRunning:true};
    let tree=scheduler.render(ToolActivity,props);
    assert.equal(nodes(tree).find(n=>n.type==='tool').props.open,true);
    const text=JSON.stringify(tree);assert.ok(text.includes('billing__perform_operation'));assert.ok(text.includes('查看调用详情'));assert.ok(!text.includes('只读操作'));
    const buttons=nodes(tree).filter(n=>n.type==='button');buttons.find(n=>n.props.children==='允许执行').props.onClick();buttons.find(n=>n.props.children==='拒绝').props.onClick();
    assert.equal(JSON.stringify(decisions),JSON.stringify([{approved:true,id:'exact-id'},{approved:false,id:'exact-id',reason:'用户拒绝执行'}]));
    nodes(tree).find(n=>n.type==='tool').props.onOpenChange(false);
    assert.equal(nodes(scheduler.render(ToolActivity,props)).find(n=>n.type==='tool').props.open,false);
    props={...props,part:{...part,approval:{id:'new-id'}}};
    assert.equal(nodes(scheduler.render(ToolActivity,props)).find(n=>n.type==='tool').props.open,true);
    tree=scheduler.render(ToolActivity,{...props,isReadonly:true});assert.equal(nodes(tree).filter(n=>n.type==='button').length,0);
    tree=scheduler.render(ToolActivity,{...props,part:{...part,state:'output-error',errorText:'raw failure'}});assert.ok(JSON.stringify(tree).includes('raw failure'));
  `
  );
});

test("singleton to multi keeps the same keyed step path, user disclosure state and children reachable", () => {
  clientScript(
    `${hookHarness}
    const scheduler=hooks();const {ActivityGroup}=load('components/chat/activity-group.tsx',{...base,react:scheduler.react});
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

test("actual Messages keeps cross-message order, callbacks and original per-message actions through grouping", () => {
  clientScript(
    `${hookHarness}
    const {Messages}=load('components/chat/messages.tsx',{
      ...base,
      '@/components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'conversation-content',ConversationScrollButton:'scroll-button'},
      '@/lib/agent/message-turn':{prepareRegeneration:()=>true},
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
    const tree=Messages(props);const groups=nodes(tree).filter(n=>n.type==='activity');
    assert.equal(groups.length,2);assert.equal(groups[0].props.parts.map(p=>p.toolCallId).join(','),'read-fixture,second');
    assert.equal(groups[1].props.parts[0].toolCallId,'third');assert.equal(groups[1].props.isRunning,true);
    const previews=nodes(tree).filter(n=>n.type==='preview');assert.equal(previews.map(n=>n.props.message.id).join(','),'a,b,boundary,c');
    assert.equal(previews[0].props.message,a);assert.equal(previews[1].props.message,b);
    for(const node of previews){assert.equal(node.props.onEdit,edit);assert.equal(node.props.addToolApprovalResponse,approve);}
    assert.equal(previews[0].props.hideActivities,true);assert.equal(previews[2].props.hideActivities,false);
    const singleton=Messages({...props,messages:[a]});const firstGroup=nodes(singleton).find(n=>n.type==='activity');
    assert.equal(firstGroup.key,groups[0].key);assert.equal(firstGroup.props.parts[0],groups[0].props.parts[0]);
  `
  );
});

test("actual PreviewMessage mixed-part grouping retains timeline boundaries, stable keys and message action callbacks", () => {
  clientScript(`${hookHarness}
    const {PreviewMessage}=load('components/chat/message.tsx',{
      ...base,react:{useCallback:fn=>fn},
      '@/lib/utils':{cn:()=>'',sanitizeText:text=>text},
      '../ai-elements/message':{MessageContent:'text',MessageResponse:'response'},
      '../ai-elements/shimmer':{Shimmer:'shimmer'},
      './activity-group':{ActivityGroup:'activity'},
      './data-stream-provider':{useDataStream:()=>({})},
      './document':{},'./document-preview':{},'./icons':{},
      './message-actions':{MessageActions:'actions'},
      './message-reasoning':{MessageReasoning:'reasoning'},
      './preview-attachment':{},'./tool-activity':{},'./weather':{},
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
    const {Messages}=load('components/chat/messages.tsx',{
      ...base,
      '@/components/ai-elements/conversation':{Conversation:'conversation',ConversationContent:'conversation-content',ConversationScrollButton:'scroll-button'},
      '@/lib/agent/message-turn':{prepareRegeneration:()=>true},
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
      const tree=Messages({...props,status});const groups=nodes(tree).filter(n=>n.type==='activity');
      assert.equal(groups[0].props.isRunning,false,'historical '+status);
      assert.equal(groups[1].props.isRunning,active,'latest '+status);
      assert.equal(activitySummary(groups[0].props.parts,groups[0].props.isRunning).label,'未完成');
      assert.equal(activitySummary(groups[1].props.parts,groups[1].props.isRunning).label,active?'执行中':'未完成');
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
    assert.equal(nodes(sending).find(n=>n.type==='activity').props.isRunning,false,'new user submission does not revive old tools');
  `);
});
