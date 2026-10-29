import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createLandingDraft,
  LANDING_DRAFT_KEY,
  readLandingDraft,
  takeLandingDraft,
} from "./landing-draft";

const now = 1_800_000_000_000;
const owner = { id: "account-a", type: "regular" };
const saved = (id: string | null = owner.id) =>
  JSON.stringify(createLandingDraft("核对上传材料，并整理来源", id, now));

test("landing handoff keeps exact text and the same signed-in owner only", () => {
  assert.equal(
    readLandingDraft(saved(), owner, now + 1000),
    "核对上传材料，并整理来源"
  );
  assert.equal(
    readLandingDraft(saved(), { id: "account-b", type: "regular" }, now),
    null
  );
  assert.equal(readLandingDraft(saved(null), owner, now), null);
  assert.equal(
    readLandingDraft(saved(null), { id: "new-guest", type: "guest" }, now),
    "核对上传材料，并整理来源"
  );
});

test("draft parser rejects expired, future, oversized and malformed handoffs", () => {
  for (const value of [null, "not json", "{}", saved()]) {
    assert.equal(readLandingDraft(value, owner, now + 600_001), null);
  }
  assert.equal(readLandingDraft(saved(), owner, now - 1), null);
  assert.equal(createLandingDraft(" ", owner.id, now), null);
  assert.equal(createLandingDraft("x".repeat(8001), owner.id, now), null);
  assert.equal(
    readLandingDraft(
      JSON.stringify({
        createdAt: now,
        ownerId: owner.id,
        text: "x".repeat(8001),
        version: 1,
      }),
      owner,
      now
    ),
    null
  );
});

test("draft is consumed once and removed even when identity does not match", () => {
  let value: string | null = saved();
  const storage = {
    getItem(key: string) {
      assert.equal(key, LANDING_DRAFT_KEY);
      return value;
    },
    removeItem(key: string) {
      assert.equal(key, LANDING_DRAFT_KEY);
      value = null;
    },
  };
  assert.equal(
    takeLandingDraft(storage, owner, now),
    "核对上传材料，并整理来源"
  );
  assert.equal(takeLandingDraft(storage, owner, now), null);
  value = saved();
  assert.equal(
    takeLandingDraft(storage, { id: "other", type: "regular" }, now),
    null
  );
  assert.equal(value, null);
});

test("storage removal failure never projects text or permits a hidden replay", () => {
  assert.throws(() =>
    takeLandingDraft(
      {
        getItem: () => saved(),
        removeItem() {
          throw new Error("storage blocked");
        },
      },
      owner,
      now
    )
  );
});

test("public homepage is isolated from Agent initialization and new chat stays in the workbench", () => {
  const entry = readFileSync("app/_components/landing/home-entry.tsx", "utf8");
  assert.match(entry, /usePathname/);
  assert.match(entry, /isPersonalSection/);
  assert.match(entry, /LandingPage/);
  const layout = readFileSync("app/(chat)/layout.tsx", "utf8");
  assert.match(layout, /<HomeEntry>/);
  const chat = readFileSync("app/_hooks/use-active-chat.tsx", "utf8");
  assert.match(chat, /router.push\("\/chat"\)/);
  assert.doesNotMatch(chat, /router.push\("\/"\)/);
  const receiver = readFileSync(
    "app/_components/landing/draft-receiver.tsx",
    "utf8"
  );
  assert.match(receiver, /status === "loading"/);
  assert.match(receiver, /setInput/);
  assert.doesNotMatch(receiver, /sendMessage|startTask|fetch\(/);
});

test("public first-fold has real navigation and clearly labeled non-live examples", () => {
  const home = readFileSync("app/_components/landing/landing-page.tsx", "utf8");
  assert.match(home, /让[\s\S]*?线索/);
  assert.match(home, /成为答案/);
  assert.match(home, /开始使用/);
  assert.match(home, /描述你的任务/);
  assert.match(
    readFileSync("app/_components/landing/landing-preview.tsx", "utf8"),
    /结果示例/
  );
  assert.doesNotMatch(home, /Lessie|免费积分|无限查询/);
  for (const id of ["product", "scenarios", "developers", "faq"]) {
    assert.match(
      home +
        readFileSync("app/_components/landing/landing-preview.tsx", "utf8"),
      new RegExp(`id="${id}"`)
    );
  }
});

test("actual public proxy never creates guests or widens personal and API access", () => {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `
 const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
 const {NextResponse}=require('next/server');let reads=0;
 const modules={'next/server':{NextResponse},'next-auth/jwt':{getToken:async()=>{reads++;return null}},uuid:{v7:()=> 'trace'},'@/server/shared/auth-cookies':{usesSecureAuthCookies:()=>false}};
 const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('proxy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod,process:{env:{}},URL,Headers,Response,require:n=>n in modules?modules[n]:require(n.startsWith('@/')?process.cwd()+'/'+n.slice(2):n)});
 (async()=>{
 for(const path of ['/','/?anything=ignored']){const url=new URL(path,'https://app.example');const r=await mod.exports.proxy({nextUrl:url,url:url.href,headers:new Headers()});assert.equal(r.status,200)}
 assert.equal(reads,0,'public home must not create/read a guest');
 for(const section of ['connections','skills']){const url=new URL('/?section='+section,'https://app.example');const r=await mod.exports.proxy({nextUrl:url,url:url.href,headers:new Headers()});assert.equal(new URL(r.headers.get('location')).pathname,'/login')}
 for(const path of ['/chat','/api/library']){const url=new URL(path,'https://app.example');const r=await mod.exports.proxy({nextUrl:url,url:url.href,headers:new Headers()});assert.equal(new URL(r.headers.get('location')).pathname,'/api/auth/guest')}
 })().catch(e=>{console.error(e);process.exitCode=1});
 `,
    ],
    {
      env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
    }
  );
});

test("actual landing renders an independent branded homepage without Agent chrome or fetch", () => {
  const html = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `
 require.extensions['.css']=()=>{};
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{SessionContext}=require('next-auth/react');
 global.fetch=()=>{throw Error('Homepage must not fetch models or tools during render')};
 const {LandingPage}=require('./app/_components/landing/landing-page.tsx');
 process.stdout.write(renderToStaticMarkup(React.createElement(SessionContext.Provider,{value:{data:null,status:'unauthenticated'}},React.createElement(LandingPage))));
 `,
    ],
    {
      encoding: "utf8",
      env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
    }
  );
  assert.match(html, /data-testid="landing-page"/);
  assert.match(html, /描述你的任务/);
  assert.match(html.replace(/<[^>]+>/g, ""), /让线索，成为答案/);
  assert.match(html, /结果示例/);
  assert.match(html, /href="\/chat"/);
  assert.doesNotMatch(
    html,
    /data-testid="(multimodal-input|task-progress|personal-connections)"/
  );
});

test("consumer preview is a compact result, not a file-type explanation matrix", () => {
  const preview = readFileSync(
    "app/_components/landing/landing-preview.tsx",
    "utf8"
  );
  assert.match(preview, /预览结果/);
  assert.doesNotMatch(preview, /关键信息|PDF 文档|landing-file--/);
  assert.match(preview, /SheetContent/);
});

test("landing styles remain valid CSS after formatter and cleanup", () => {
  execFileSync(
    process.execPath,
    [
      "-e",
      `
    const fs=require('node:fs'),assert=require('node:assert/strict');
    const {createRequire}=require('node:module');const req=createRequire(require.resolve('next/package.json'));const postcss=req('postcss');
    assert.throws(()=>postcss.parse('.preview,\\n  display:flex;\\n}'));
    assert.doesNotThrow(()=>postcss.parse(fs.readFileSync('app/_components/landing/landing.css','utf8')));
  `,
    ],
    {
      env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
    }
  );
});

test("consumer login can return to the empty workbench but never another user's chat", () => {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `
   const assert=require('node:assert/strict');const {authReturnPath,authPageHref}=require('./app/_lib/auth-navigation.ts');
   assert.equal(authReturnPath('/chat'),'/chat');assert.equal(authPageHref('/login','/chat'),'/login?next=%2Fchat');assert.equal(authReturnPath('/chat/private-id'),'/');
  `,
    ],
    {
      env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
    }
  );
  const layout = readFileSync("app/(chat)/layout.tsx", "utf8");
  assert.ok(
    layout.indexOf("<HomeEntry>") <
      layout.indexOf('src="https://cdn.jsdelivr.net/pyodide')
  );
});

test("cached login and register forms never duplicate input-label identities", () => {
  const html = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `
    const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
    const {AuthForm}=require('./app/_components/chat/auth-form.tsx');
    process.stdout.write(renderToStaticMarkup(React.createElement(React.Fragment,null,React.createElement(AuthForm,{action:'/login'}),React.createElement('div',{hidden:true},React.createElement(AuthForm,{action:'/register'})))));
  `,
    ],
    {
      encoding: "utf8",
      env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
    }
  );
  const ids = [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].map(
    (match) => match[1]
  );
  assert.equal(ids.length, 4);
  assert.equal(
    new Set(ids).size,
    4,
    "cached forms need independent accessible identities"
  );
  for (const id of ids) {
    assert.ok(html.includes(`for="${id}"`));
  }
});
