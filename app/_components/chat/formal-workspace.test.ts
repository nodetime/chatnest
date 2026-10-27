import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (name: string) =>
  readFileSync(`app/_components/chat/${name}.tsx`, "utf8");

test("desktop navigation retains an icon rail instead of disappearing", () => {
  assert.match(source("app-sidebar"), /collapsible="icon"/);
  assert.match(source("app-sidebar"), /aria-label="连接"/);
  assert.match(source("app-sidebar"), /aria-label="技能"/);
  assert.doesNotMatch(source("app-sidebar"), /<TaskDialog/);
});

test("home and running conversation share a real editable composer, not a workflow form", () => {
  assert.match(source("greeting"), /今天想完成什么/);
  assert.match(source("shell"), /data-testid="composer-dock"/);
  assert.match(source("shell"), /shrink-0/);
  assert.doesNotMatch(
    source("shell"),
    /justify-center pb-20|AI 的分析可能有误/
  );
  assert.match(source("multimodal-input"), /home \?/);
});

test("sidebar preferences do not collapse automatically when an artifact opens", () => {
  assert.doesNotMatch(
    source("workbench-sidebar-provider"),
    /temporaryCollapseKey=|useArtifact/
  );
});

test("home reads actual history and artifact library without sample supplier records", () => {
  const home = source("workspace-home");
  assert.match(home, /api\/history/);
  assert.match(home, /api\/library/);
  assert.doesNotMatch(home, /咖啡杯|山野日用|补查生活|已完成.*条/);
});

test("stopping exposes a real continuation without replaying tool approvals", () => {
  assert.match(source("messages"), /AgentPauseNotice/);
  assert.match(source("shell"), /agentPaused=\{agentPaused\}/);
  assert.match(source("shell"), /onContinue=\{continueAgent\}/);
});

test("native progress tool has a readable label without renaming dynamic provider tools", async () => {
  const { projectToolIdentity } = await import("./tool-presentation");
  assert.equal(
    projectToolIdentity({
      input: { items: [] },
      output: { items: [] },
      state: "output-available",
      toolCallId: "plan",
      type: "tool-updateTodo",
    }).title,
    "更新任务进度"
  );
  assert.equal(
    projectToolIdentity({
      input: {},
      output: {},
      state: "output-available",
      toolCallId: "provider",
      toolName: "updateTodo",
      type: "dynamic-tool",
    }).title,
    "updateTodo"
  );
});

test("library reopens the same artifact without clearing it, and blocks unsaved or streaming switches", () => {
  const script = `
    const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    let artifact={documentId:'a',kind:'text',title:'A',content:'Saved body',status:'idle',isVisible:false,boundingBox:{top:0,left:0,width:0,height:0}},metadata={},opened=0,warnings=0;
    const {openArtifactPreview}=require('./server/domain/document/stream-state.ts');
    const {artifactSwitchReason}=require('./app/_components/chat/artifact-catalog.ts');
    const modules={'react/jsx-runtime':{},'lucide-react':{},'next/navigation':{useRouter:()=>({push(){throw Error('unexpected navigation')}})},swr:{},'@/app/_hooks/use-active-chat':{useActiveChat:()=>({chatId:'chat'})},'@/app/_hooks/use-artifact':{useArtifact:()=>({artifact,metadata,setArtifact(fn){artifact=fn(artifact)}})},'@/app/_hooks/use-workspace':{useWorkspace:()=>({show(){opened++}})},'@/app/_hooks/use-workbench-navigation':{useWorkbenchNavigation:()=>({navigate(){}})},'@/app/_lib/utils':{},'@/server/domain/document/stream-state':{openArtifactPreview},'./artifact-catalog':{artifactSwitchReason},'sonner':{toast:{error(){warnings++}}},'../ui/button':{},'./artifact-type-label':{},'./file-symbol':{},'./sidebar-history':{}};
    const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/_components/chat/workspace-home.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:mod.exports,module:mod,require:n=>{assert.ok(n in modules,n);return modules[n]}});
    mod.exports.useOpenSavedArtifact()({id:'a',title:'A',kind:'text',chatId:null});assert.equal(artifact.content,'Saved body');assert.equal(artifact.kind,'text');assert.equal(opened,1);
    for(const state of ['streaming','dirty','notes']){artifact.status=state==='streaming'?'streaming':'idle';metadata={documentPendingChanges:state==='dirty',resultTablePendingChanges:state==='notes'};mod.exports.useOpenSavedArtifact()({id:'b',title:'B',kind:'sheet',chatId:null});assert.equal(artifact.documentId,'a');assert.equal(opened,1);}
    assert.equal(warnings,3);
  `;
  execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
    env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
  });
});

test("platform model billing errors do not send consumers to a developer gateway console", () => {
  assert.doesNotMatch(source("shell"), /vercel\.com\/d\?|Activate AI Gateway/);
  assert.match(source("shell"), /对话服务暂不可用/);
});
