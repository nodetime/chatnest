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

test("should_keep_history_in_sidebar_when_rendering_empty_conversation", () => {
  const home = source("workspace-home");
  assert.ok(home.includes('aria-label="最近产物"'), "主区域必须保留最近产物");
  assert.doesNotMatch(home, /home-recent-grid|api\/history/);
  assert.match(source("sidebar-history"), /api\/history/);
  assert.match(home, /api\/library/);
  assert.doesNotMatch(home, /咖啡杯|山野日用|补查生活|已完成.*条/);
});

test("stop is a composer action and does not insert a continuation footer", () => {
  assert.match(source("multimodal-input"), /aria-label="停止生成"/);
  assert.doesNotMatch(
    source("messages"),
    /AgentPauseNotice|agentPaused|onContinue/
  );
  assert.doesNotMatch(source("shell"), /agentPaused|continueAgent/);
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

function runHomeBehavior(assertions: string) {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `
        const assert = require('node:assert/strict');
        const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
        const React = require('react');
        const { renderToStaticMarkup } = require('react-dom/server');
        const { Greeting, TaskExamples } = require('./app/_components/chat/greeting.tsx');
        const components = {};
        const componentModules = {
          './artifact': 'Artifact', './chat-header': 'ChatHeader',
          './conversation-notice': 'ConversationNotice', './data-stream-handler': 'DataStreamHandler',
          './messages': 'Messages', './multimodal-input': 'MultimodalInput',
          './task-progress': 'TaskProgress', './workbench-section': 'WorkbenchSection',
          './workspace': 'Workspace',
        };
        for (const [path, name] of Object.entries(componentModules)) {
          components[path] = { [name]: function Surface() {} };
        }
        const attachment = { url: '/api/files/fixture', name: '已有材料.png', contentType: 'image/png' };
        const state = [], refs = [];
        let stateIndex = 0, refIndex = 0;
        const chat = { chatId: 'chat', messages: [], input: '已有草稿', status: 'ready',
          setInput(value) { chat.input = value; },
          sendMessage() { throw Error('任务示例不能发送消息'); },
        };
        const navigation = [];
        let library = { data: [], isLoading: false };
        const modules = {
          ...components,
          react: { ...React, useCallback: fn => fn, useEffect() {},
            useRef(value) { const index = refIndex++; return refs[index] ??= { current: value }; },
            useState(value) {
              const index = stateIndex++;
              if (!(index in state)) state[index] = Array.isArray(value) ? [attachment] : value;
              return [state[index], next => { state[index] = next; }];
            },
          },
          'react/jsx-runtime': require('react/jsx-runtime'),
          'lucide-react': require('lucide-react'),
          'next/navigation': { useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {} }) },
          '@/app/_hooks/use-active-chat': { useActiveChat: () => chat },
          '@/app/_hooks/use-artifact': { useArtifact: () => ({ artifact: {}, metadata: {}, setArtifact() {} }), useArtifactSelector: () => false },
          '@/app/_hooks/use-workbench-navigation': { useWorkbenchNavigation: () => ({ section: 'chat', navigate: next => navigation.push(next) }) },
          '@/app/_hooks/use-workspace': { useWorkspace: () => ({ show() {} }) },
          '@/app/_lib/utils': { cn: (...values) => values.filter(Boolean).join(' '), fetcher() {} },
          '@/server/domain/document/stream-state': {},
          './artifact-catalog': {},
          './artifact-type-label': { artifactTypeLabels: { text: '文档' } },
          './file-symbol': { FileSymbol: () => React.createElement('span') },
          '../ui/button': { Button: ({ children, ...props }) => React.createElement('button', props, children) },
          '@/app/_components/ui/alert-dialog': Object.fromEntries(['AlertDialog','AlertDialogAction','AlertDialogContent','AlertDialogDescription','AlertDialogFooter','AlertDialogHeader','AlertDialogTitle'].map(name => [name, function Dialog() {}])),
          './greeting': { Greeting, TaskExamples },
          './message-editor': {},
          sonner: { toast: { error() {} } },
          swr: { default: () => library },
        };
        function load(path) {
          const mod = { exports: {} };
          vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
          }).outputText, { module: mod, exports: mod.exports, process, URLSearchParams,
            require(name) { assert.ok(name in modules, name); return modules[name]; },
          });
          return mod.exports;
        }
        const home = load('app/_components/chat/workspace-home.tsx');
        modules['./workspace-home'] = home;
        const { ChatShell } = load('app/_components/chat/shell.tsx');
        function renderShell() { stateIndex = 0; refIndex = 0; return ChatShell(); }
        function elements(node, predicate, path = []) {
          if (!React.isValidElement(node)) return [];
          const own = predicate(node) ? [{ node, path }] : [];
          const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
          return own.concat(children.flatMap((child, index) => elements(child, predicate, [...path, index])));
        }
        function find(node, predicate) { return elements(node, predicate)[0]?.node; }
        ${assertions}
      `,
    ],
    {
      env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
    }
  );
}

test("should_fill_draft_without_sending_or_removing_attachments_when_selecting_task_example", () => {
  runHomeBehavior(`
    const shell = renderShell();
    const composer = find(shell, node => node.type === components['./multimodal-input'].MultimodalInput);
    const examples = find(shell, node => node.type === TaskExamples);
    assert.ok(examples, '空对话应提供任务示例');
    const dock = find(shell, node => node.props['data-testid'] === 'composer-dock');
    let focused = 0;
    dock.props.ref.current = { querySelector: () => ({ focus(options) { assert.equal(options.preventScroll, true); focused++; } }) };
    const buttons = elements(TaskExamples(examples.props), node => node.type === 'button').map(entry => entry.node);
    const prompts = [
      '根据这张产品图片查找相似商品，整理来源链接，并标出需要进一步核对的线索。',
      '比较这两份材料，逐项整理相同点、关键差异和需要补充的依据。',
      '将这些材料整理成线索清单与对比表，保留来源和待核对项。',
    ];
    assert.equal(buttons.length, 3);
    buttons.forEach((button, index) => {
      assert.equal(button.props.type, 'button');
      button.props.onClick();
      assert.equal(chat.input, prompts[index]);
      assert.deepEqual(composer.props.attachments, [attachment]);
      const updated = renderShell();
      const updatedComposer = find(updated, node => node.type === composer.type);
      assert.deepEqual(updatedComposer.props.attachments, [attachment]);
      assert.equal(updatedComposer.props.input, prompts[index]);
    });
    assert.equal(focused, 3);
  `);
});

test("should_keep_composer_position_and_only_show_home_sections_when_conversation_is_empty", () => {
  runHomeBehavior(`
    const empty = renderShell();
    const isComposer = node => node.type === components['./multimodal-input'].MultimodalInput;
    const emptyComposers = elements(empty, isComposer);
    assert.equal(emptyComposers.length, 1);
    assert.ok(find(empty, node => node.type === Greeting));
    assert.ok(find(empty, node => node.type === TaskExamples));
    assert.ok(find(empty, node => node.type === home.WorkspaceHome));
    const cue = find(empty, node => node.props['aria-label'] === '向下查看最近产物');
    assert.ok(cue, '首屏必须提供最近产物的滚动入口');
    const canvas = find(empty, node => node.props.className?.includes('chat-home-canvas'));
    const recent = find(empty, node => node.props['data-testid'] === 'home-recent-artifacts');
    let scroll;
    canvas.props.ref.current = { scrollTo(options) { scroll = options; } };
    recent.props.ref.current = { offsetTop: 900 };
    cue.props.onClick();
    assert.equal(scroll.top, 900);
    chat.messages = [{ id: 'user', role: 'user', parts: [] }];
    const running = renderShell();
    const runningComposers = elements(running, isComposer);
    assert.equal(runningComposers.length, 1);
    assert.deepEqual(runningComposers[0].path, emptyComposers[0].path);
    assert.deepEqual(runningComposers[0].node.props.attachments, [attachment]);
    assert.equal(runningComposers[0].node.props.home, false);
    assert.ok(find(running, node => node.type === components['./messages'].Messages));
    assert.equal(find(running, node => node.type === Greeting), undefined);
    assert.equal(find(running, node => node.type === TaskExamples), undefined);
    assert.equal(find(running, node => node.type === home.WorkspaceHome), undefined);
    assert.equal(find(running, node => node.props['aria-label'] === '向下查看最近产物'), undefined);
  `);
});

test("should_limit_real_recent_artifacts_and_navigate_to_library_when_viewing_all", () => {
  runHomeBehavior(`
    const section = home.WorkspaceHome();
    const all = find(section, node => node.props.children?.includes?.('查看全部'));
    assert.ok(all, '最近产物应提供查看全部入口');
    all.props.onClick();
    assert.deepEqual(navigation, ['files']);
    const cards = find(section, node => node.type === home.SavedArtifactCards);
    library = { data: ['甲','乙','丙','丁'].map((title, index) => ({ id: String(index), title, kind: 'text', chatId: null })) };
    const html = renderToStaticMarkup(home.SavedArtifactCards(cards.props));
    assert.equal((html.match(/aria-label="打开产物：/g) ?? []).length, 3);
    assert.ok(!html.includes('打开产物：丁'));
    library = { data: [] };
    const empty = renderToStaticMarkup(home.SavedArtifactCards(cards.props));
    assert.ok(empty.includes('还没有保存的产物'));
    assert.ok(!empty.includes('打开产物：'));
    library = { isLoading: true };
    assert.ok(renderToStaticMarkup(home.SavedArtifactCards(cards.props)).includes('正在加载产物'));
    library = { error: new Error('offline') };
    assert.ok(renderToStaticMarkup(home.SavedArtifactCards(cards.props)).includes('产物暂未加载'));
  `);
});

test("platform model billing errors do not send consumers to a developer gateway console", () => {
  assert.doesNotMatch(source("shell"), /vercel\.com\/d\?|Activate AI Gateway/);
  assert.match(source("shell"), /对话服务暂不可用/);
});
