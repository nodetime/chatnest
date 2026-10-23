import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { isActivityPart } from "../../components/chat/activity-groups";

function client(code: string) {
  return execFileSync(process.execPath, ["--import", "tsx", "-e", code], {
    encoding: "utf8",
    env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
  });
}

test("dynamic names matching special native tools remain ordinary inspectable activities", () => {
  for (const name of [
    "createResultTable",
    "createDocument",
    "updateDocument",
    "getWeather",
    "requestSuggestions",
  ]) {
    assert.equal(
      isActivityPart({
        input: {},
        output: false,
        state: "output-available",
        toolCallId: name,
        toolName: name,
        type: "dynamic-tool",
      }),
      true,
      name
    );
  }
});

test("presentation uses exact native contracts and conservative dynamic identity", () => {
  client(`
    const assert=require('node:assert/strict');
    const {projectToolIdentity,projectToolResult}=require('./components/chat/tool-presentation.ts');
    const part={type:'dynamic-tool',toolName:'research_delete',state:'output-available',input:{query:'topic'},output:{error:'a data field'},toolCallId:'call'};
    assert.equal(projectToolIdentity(part).title,'research_delete');
    for(const name of ['readAttachment','loadSkill','readSkillResource','createResultTable','unknown__search','unknown__fetch']) assert.equal(projectToolIdentity({...part,toolName:name}).title,name);
    assert.equal(projectToolIdentity({...part,toolName:'browser__browser_navigate'}).title,'打开网页');
    const skill={...part,type:'tool-loadSkill',input:{name:'method'},output:{name:'method',displayName:'Evidence method',description:'Short purpose',instructions:'NEVER SPILL FULL INSTRUCTIONS'}};
    assert.equal(projectToolIdentity(skill).title,'Evidence method');
    const preview=projectToolResult(skill);assert.ok(JSON.stringify(preview).includes('Short purpose'));assert.ok(!JSON.stringify(preview).includes('NEVER SPILL'));
    assert.equal(projectToolIdentity({...skill,output:{displayName:'Malformed'}}).title,'加载技能');
    const resource=projectToolResult({...part,type:'tool-readSkillResource',output:{name:'method',resource:'references/guide.md',content:'Exact source text'}});
    assert.ok(JSON.stringify(resource).includes('references/guide.md'));assert.ok(JSON.stringify(resource).includes('Exact source text'));
  `);
});

test("bounded projection retains falsey, mixed records and MCP text without fetching media or interpreting errors", () => {
  client(`
    const assert=require('node:assert/strict');const {projectResult}=require('./components/chat/tool-presentation.ts');
    for(const [value,expected] of [[false,'false'],[0,'0'],['','""'],[null,'null'],[[],'返回列表为空'],[{},'{}']]) assert.ok(JSON.stringify(projectResult(value)).includes(expected));
    assert.match(projectResult(undefined).notice,/没有返回内容/);
    const original={content:[{type:'text',text:JSON.stringify({results:[{title:'One source',url:'https://example.com/a',summary:'Actual useful summary',count:0,available:false},{title:'Second',url:'javascript:alert(1)',nullable:null}]})},{type:'text',text:'Plain provider passage'},{type:'image',data:'PRIVATE_IMAGE_DATA',mimeType:'image/png'}]};
    const before=JSON.stringify(original);const preview=projectResult(original);const text=JSON.stringify(preview);
    assert.equal(JSON.stringify(original),before);assert.ok(text.includes('Actual useful summary'));assert.ok(text.includes('Plain provider passage'));assert.ok(text.includes('false'));assert.ok(text.includes('null'));assert.ok(!text.includes('PRIVATE_IMAGE_DATA'));
    assert.equal(preview.sources.length,1);assert.equal(preview.sources[0].title,'One source');assert.equal(preview.sources[0].domain,'example.com');
    assert.ok(preview.notice.includes('非文本'));
    assert.ok(JSON.stringify(projectResult({error:'ordinary evidence'})).includes('ordinary evidence'));
    const huge=projectResult({rows:Array.from({length:1000},(_,i)=>({name:'row'+i,body:'x'.repeat(10000)}))});
    assert.equal(huge.truncated,true);assert.ok(JSON.stringify(huge).length<12000);
    for(const value of [{content:null},{content:[null,2,{type:'text',text:3}]},{nested:{deep:{more:{last:{value:'end'}}}}},'not JSON {']) assert.ok(JSON.stringify(projectResult(value)).length>0);
  `);
});

test("result renderer presents actual records and safe title/domain links as text, not a JSON wall", () => {
  const html = client(`
    const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
    const {ToolResultPreview}=require('./components/chat/tool-result-preview.tsx');
    const {projectResult}=require('./components/chat/tool-presentation.ts');
    const preview=projectResult({results:[{title:'Useful record',url:'https://example.com/doc',description:'<script>bad()</script>',count:0}]});
    process.stdout.write(renderToStaticMarkup(React.createElement(ToolResultPreview,{preview})));
  `);
  assert.match(html, /Useful record/);
  assert.match(html, /example\.com/);
  assert.doesNotMatch(html, /<dl/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img|<pre/);
});

test("exact catalog aliases provide friendly actions without hiding unknown or destructive tool names", () => {
  client(`
    const assert=require('node:assert/strict');const {projectToolIdentity,projectResult}=require('./components/chat/tool-presentation.ts');
    const part={type:'dynamic-tool',toolName:'opaque_hash',toolCallId:'exact',state:'output-available',input:{q:'one query'},output:{}};
    const catalog=[{alias:'opaque_hash',name:'search.web',serverName:'Provider'}];
    assert.equal(projectToolIdentity(part,catalog).title,'搜索资料');
    assert.equal(projectToolIdentity({...part,toolName:'other_hash'},catalog).title,'other_hash');
    assert.equal(projectToolIdentity(part,[{...catalog[0],name:'research_delete'}]).title,'Provider · research_delete');
    assert.equal(projectToolIdentity({...part,type:'tool-loadSkill',input:{name:'slug'},output:{name:'slug',displayName:'Human skill',description:'Purpose',instructions:'private'}}).context,undefined);
    const resource={...part,type:'tool-readSkillResource',input:{name:'slug',resource:'guide.md'}};
    assert.equal(projectToolIdentity(resource).context,'guide.md');
    const parameters=JSON.stringify(projectResult({content:[{command:'actual argument',amount:0}]},'parameters'));
    assert.ok(parameters.includes('actual argument'));assert.ok(parameters.includes('amount'));
    const links=projectResult({items:[{title:'Item',item_url:'https://example.com/item',price:0}]});assert.equal(links.sources[0].url,'https://example.com/item');
  `);
});

test("empty MCP content remains visible, inherited lookup names are literal and sources are not repeated as raw fields", () => {
  client(`
    const assert=require('node:assert/strict');const {projectResult,projectToolIdentity}=require('./components/chat/tool-presentation.ts');
    assert.ok(projectResult({content:[]}).notice.includes('返回列表为空'));
    assert.equal(projectToolIdentity({type:'dynamic-tool',toolName:'toString',state:'output-available',toolCallId:'x'}).title,'toString');
    const result=projectResult({title:'Source title',url:'https://example.com/source',excerpt:'Meaningful excerpt'});
    assert.equal(result.sources.length,1);assert.ok(JSON.stringify(result.records).includes('Meaningful excerpt'));
    assert.ok(!JSON.stringify(result.blocks).includes('https://example.com/source'));assert.ok(!JSON.stringify(result.blocks).includes('Source title'));
  `);
});

test("generic content lists remain records rather than being mistaken for MCP media", () => {
  client(`
    const assert=require('node:assert/strict');const {projectResult}=require('./components/chat/tool-presentation.ts');
    assert.ok(JSON.stringify(projectResult({content:[{name:'ordinary record',count:0}]})).includes('ordinary record'));
    assert.ok(projectResult({content:[]}).notice.includes('返回列表为空'));
    assert.match(projectResult(undefined,'parameters').notice,/参数未记录/);
  `);
});

test("structured MCP lists become compact named records with associated sources, not transport metadata or mirrored JSON", () => {
  client(`
    const assert=require('node:assert/strict');const {projectResult,projectToolResult}=require('./components/chat/tool-presentation.ts');
    const payload={fixture:true,request_id:'debug-id',total:2,items:[{item_id:'123',title:'Actual useful item',item_url:'https://example.com/item',price:59,platform:'Shop',available:false},{name:'Second',count:0}]};
    const preview=projectResult({isError:false,content:[{type:'text',text:JSON.stringify(payload)}],structuredContent:payload});
    assert.equal(preview.records.length,2);assert.equal(preview.records[0].title,'Actual useful item');assert.equal(preview.records[0].source.domain,'example.com');assert.ok(preview.records[0].fields.some(f=>f.text==='59'));assert.equal(preview.blocks.length,0);
    assert.ok(!JSON.stringify(preview).includes('debug-id'));assert.ok(!JSON.stringify(preview).includes('isError'));
    assert.match(projectResult({items:[]}).notice,/返回列表为空/);
    const skill=projectToolResult({type:'tool-loadSkill',state:'output-available',output:{name:'x',displayName:'Skill',description:'Short prose',instructions:'Full instructions'}});
    assert.equal(skill.blocks[0].fields[0].label,'');
    const resource=projectToolResult({type:'tool-readSkillResource',state:'output-available',output:{name:'x',resource:'guide.md',content:'Raw reference'}});
    assert.equal(resource.blocks[0].label,'guide.md');assert.equal(resource.blocks[0].fields[0].label,'');
  `);
});

test("structured preview keeps a nontext warning and has only one truncation/details caption", () => {
  client(`
    const assert=require('node:assert/strict');const {projectResult}=require('./components/chat/tool-presentation.ts');
    const structuredContent={items:Array.from({length:8},(_,i)=>({title:'Result '+i,price:i}))};
    const plain=projectResult({content:[],structuredContent});assert.equal(plain.truncated,true);assert.equal(plain.notice,undefined);
    const mixed=projectResult({content:[{type:'image',data:'binary-original'}],structuredContent});assert.equal(mixed.truncated,true);assert.match(mixed.notice,/非文本/);assert.ok(!JSON.stringify(mixed).includes('binary-original'));
  `);
});

test("compact collection and record selection explicitly marks omitted original fields", () => {
  client(`
    const assert=require('node:assert/strict');const {projectResult}=require('./components/chat/tool-presentation.ts');
    for(const output of [
      {items:[{title:'A',price:1}],warning:'Partial supplier response',cursor:'next'},
      {title:'A',summary:'Short',content:'Additional exact text'},
      {title:'A',name:'Other identity',snippet:'Short'},
      {title:'A',description:'',summary:'Short'},
    ]) {
      const before=JSON.stringify(output);const preview=projectResult(output);
      assert.equal(preview.truncated,true,JSON.stringify(output));assert.equal(JSON.stringify(output),before);
    }
    assert.equal(projectResult({items:[{title:'A',price:1}]}).truncated,false);
    assert.equal(projectResult({title:'A',summary:'Short'}).truncated,false);
  `);
});

test("nested empty arrays are scoped to their field rather than declaring useful results empty", () => {
  client(`
    const assert=require('node:assert/strict');const {projectResult}=require('./components/chat/tool-presentation.ts');
    for(const output of [{text:'Useful result',sources:[]},{answer:'Useful result',items:[]},{content:[{type:'text',text:'Useful result'}],sources:[]}]) {
      const preview=projectResult(output);assert.notEqual(preview.notice,'返回列表为空。');assert.ok(JSON.stringify(preview).includes('Useful result'));
      const empty=preview.blocks.find(block=>block.fields.some(field=>field.text==='返回列表为空。'));
      assert.ok(empty);assert.ok(empty.label==='sources'||empty.label==='items');
    }
    for(const output of [[],{items:[]},{content:[]}]) assert.equal(projectResult(output).notice,'返回列表为空。');
  `);
});

test("reader results show only actual headings, prose and sources while original fields remain in approval", () => {
  client(`
    const assert=require('node:assert/strict');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
    const {ToolResultPreview}=require('./components/chat/tool-result-preview.tsx');const {projectResult,projectToolResult}=require('./components/chat/tool-presentation.ts');
    const render=(value,parameters=false)=>renderToStaticMarkup(React.createElement(ToolResultPreview,{preview:projectResult(value,parameters?'parameters':'result'),parameters}));
    const data={items:[{title:'Actual item',snippet:'Actual returned summary',item_url:'https://example.com/deep/item?q=1',item_id:'original-id',price:59,seller:'original-seller'},{title:'Title without prose',price:42}]};
    const before=JSON.stringify(data);const html=render(data);
    for(const text of ['Actual item','Actual returned summary','example.com','Title without prose']) assert.ok(html.includes(text),text);
    for(const text of ['item_id','original-id','price','seller','original-seller','暂无摘要','无摘要','<dl']) assert.ok(!html.includes(text),text);
    assert.equal(JSON.stringify(data),before);
    const parameters=render(data,true);for(const text of ['item_id','original-id','price','seller','original-seller']) assert.ok(parameters.includes(text),text);
    const generic=render({status:'raw-status',payload:{debug_id:'debug-value',count:0}});
    assert.match(generic,/调用详情/);assert.doesNotMatch(generic,/raw-status|payload|debug_id|debug-value|<dl/);
    assert.match(render('Exact plain provider prose'),/Exact plain provider prose/);
    assert.match(render({text:'Actual text body',count:0}),/Actual text body/);
    const resource=projectToolResult({type:'tool-readSkillResource',state:'output-available',output:{name:'skill',resource:'references/guide.md',content:'Actual reference excerpt'}});
    const resourceHtml=renderToStaticMarkup(React.createElement(ToolResultPreview,{preview:resource}));assert.ok(resourceHtml.includes('references/guide.md'));assert.match(resourceHtml,/Actual reference excerpt/);
  `);
});
