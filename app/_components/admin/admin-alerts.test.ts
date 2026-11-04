import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const fixture = {
  alertHistory: {
    checkedAt: "2026-11-01T00:00:00.000Z",
    data: null,
    reason: "not_configured",
    status: "unavailable",
  },
  checkedAt: "2026-11-01T00:00:00.000Z",
  delivery: {
    history: "not_connected",
    verification: "unknown",
    webhookConfigured: true,
  },
  payment: {
    data: {
      attention: [],
      caseRisk: { dueSoonOrOverdue: 2, total: 3, withGap: 1 },
      completedSamples: 0,
      failed: 0,
      inboxCount: 0,
      processing: 0,
      received: 0,
      refundDue: 0,
      successRate: 100,
      webhookLagSeconds: 0,
    },
    status: "available",
  },
  settlement: {
    data: {
      deadLettered: 0,
      failed: 0,
      oldestPendingAt: null,
      pending: 0,
      processing: 0,
    },
    status: "available",
  },
};
function run(code: string) {
  return execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const fixture=${JSON.stringify(fixture)};${code}`,
    ],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } }
  );
}
test("alerts snapshot distinguishes zero, unknown, no samples and unverified delivery", () => {
  const html = run(
    `const {AlertsSnapshotView}=require('./app/_components/admin/admin-alerts.tsx');console.log(renderToStaticMarkup(React.createElement(AlertsSnapshotView,{data:fixture})));`
  );
  assert.match(html, /暂无已完成样本/);
  assert.doesNotMatch(html, /100%/);
  assert.match(html, /待处理收件箱/);
  assert.match(html, /最早未完成结算/);
  assert.match(html, /正式投递结果尚未验证/);
  const unavailable = run(
    `fixture.payment={status:'unavailable',data:null};fixture.settlement={status:'unavailable',data:null};const {AlertsSnapshotView}=require('./app/_components/admin/admin-alerts.tsx');console.log(renderToStaticMarkup(React.createElement(AlertsSnapshotView,{data:fixture})));`
  );
  assert.match(unavailable, /当前状态未知/);
  assert.match(unavailable, /不代表没有异常/);
  assert.doesNotMatch(unavailable, /当前快照没有需要关注/);
});
test("actual alerts component replaces forbidden data, isolates sessions and only fetches GET", () => {
  const output = run(`
    const assert=require('node:assert/strict');const Module=require('node:module');const original=Module._load;
    let userId='admin-a';let status='authenticated';let fetcher;let currentKey;
    const cache=new Map();
    Module._load=function(id,...args){
      if(id==='next-auth/react')return {useSession:()=>({status,data:{user:{id:userId}}})};
      if(id==='swr')return {__esModule:true,default:(key,fn)=>{currentKey=key;fetcher=fn;return {data:key?cache.get(JSON.stringify(key)):undefined,isLoading:false,isValidating:false,mutate:async()=>{}}}};
      return original.call(this,id,...args);
    };
    const {AdminAlerts}=require('./app/_components/admin/admin-alerts.tsx');const render=()=>renderToStaticMarkup(React.createElement(AdminAlerts));
    render();assert.deepEqual(currentKey,['/api/admin/alerts','admin-a']);cache.set(JSON.stringify(currentKey),{status:'ok',snapshot:fixture,cursors:[null]});assert.match(render(),/结算队列/);
    (async()=>{
      global.fetch=async(url,init)=>{assert.equal(url,'/api/admin/alerts');assert.equal(init.method,'GET');assert.equal(init.cache,'no-store');return new Response('{}',{status:403});};
      cache.set(JSON.stringify(currentKey),await fetcher(currentKey));const denied=render();assert.match(denied,/管理员权限已失效/);assert.doesNotMatch(denied,/结算队列/);
      cache.set(JSON.stringify(currentKey),{status:'ok',snapshot:fixture,cursors:[null]});userId='admin-b';assert.doesNotMatch(render(),/结算队列/);assert.deepEqual(currentKey,['/api/admin/alerts','admin-b']);
      status='unauthenticated';assert.doesNotMatch(render(),/结算队列/);assert.equal(currentKey,null);console.log('ISOLATED_GET_ONLY');
    })().catch(error=>{console.error(error);process.exitCode=1});
  `);
  assert.match(output, /ISOLATED_GET_ONLY/);
});

test("existing history card paginates confirmed pages, retains failures, refreshes first and clears forbidden cache", () => {
  const output = run(`
    const assert=require('node:assert/strict');const Module=require('node:module');const original=Module._load;
    const cache=new Map();let actions={};let nextStatus=200;let requested=[];let userId='admin-a';
    const cursor='2026-11-02T12:00:00.000123Z|11111111-1111-4111-8111-111111111111';
    fixture.alertHistory={status:'available',data:{items:[],retentionDays:30,nextCursor:cursor}};
    Module._load=function(id,...args){
      if(id==='next-auth/react')return {useSession:()=>({status:'authenticated',data:{user:{id:userId}}})};
      if(id==='swr')return {__esModule:true,default:(key,fn)=>({data:cache.get(JSON.stringify(key)),isLoading:false,isValidating:false,mutate:async(value,options)=>{assert.equal(options.revalidate,false);const result=await value;cache.set(JSON.stringify(key),result);return result;}})};
      if(id.includes('/ui/button'))return {Button:(props)=>{const label=React.Children.toArray(props.children).filter(x=>typeof x==='string').join('');actions[label]=props;return React.createElement('button',props)}};
      return original.call(this,id,...args);
    };
    global.fetch=async(url,init)=>{requested.push(String(url));assert.equal(init.method,'GET');assert.equal(init.cache,'no-store');if(nextStatus!==200)return new Response('{}',{status:nextStatus});const data=structuredClone(fixture);if(String(url).includes('historyCursor'))data.alertHistory.data.nextCursor=null;return Response.json(data);};
    const {AdminAlerts}=require('./app/_components/admin/admin-alerts.tsx');
    const render=()=>{actions={};return renderToStaticMarkup(React.createElement(AdminAlerts))};
    cache.set(JSON.stringify(['/api/admin/alerts',userId]),{status:'ok',snapshot:fixture,cursors:[null]});
    (async()=>{
      assert.match(render(),/每页最多30条/);assert.ok(actions['下一页']);assert.equal(actions['上一页'].disabled,true);
      nextStatus=503;await actions['下一页'].onClick();assert.match(render(),/第 1 页/);assert.ok(cache.get(JSON.stringify(['/api/admin/alerts',userId])).snapshot);
      nextStatus=200;await actions['下一页'].onClick();assert.match(render(),/第 2 页/);assert.equal(actions['下一页'].disabled,true);assert.equal(actions['上一页'].disabled,false);
      await actions['刷新状态'].onClick();assert.match(render(),/第 1 页/);assert.equal(requested.at(-1),'/api/admin/alerts');
      nextStatus=403;await actions['下一页'].onClick();const denied=render();assert.match(denied,/管理员权限已失效/);assert.doesNotMatch(denied,/结算队列|第 1 页|第 2 页/);
      assert.deepEqual(cache.get(JSON.stringify(['/api/admin/alerts',userId])),{status:'denied'});
      userId='admin-b';assert.doesNotMatch(render(),/结算队列/);console.log('CONFIRMED_SINGLE_PAGE_GET_ONLY');
    })().catch(error=>{console.error(error);process.exitCode=1});
  `);
  assert.match(output, /CONFIRMED_SINGLE_PAGE_GET_ONLY/);
});
