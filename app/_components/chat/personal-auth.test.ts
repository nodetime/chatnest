import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

function run(script: string) {
  return execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
    encoding: "utf8",
    env: { HOME: process.env.HOME, NODE_ENV: "test", PATH: process.env.PATH },
  });
}

test("guest and unauthenticated entries go to login before changing the workspace", () => {
  run(`
    const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    for(const [status,type] of [['authenticated','guest'],['unauthenticated',null],['loading',null],['authenticated','regular']]){
      const pushed=[],mutations=[],keys=[];
      const modules={react:{useCallback:fn=>fn},'next/navigation':{useRouter:()=>({push:p=>pushed.push(p)}),useSearchParams:()=>new URLSearchParams()},'next-auth/react':{useSession:()=>({status,data:type?{user:{id:type,type}}:null})},swr:{__esModule:true,default:(key,fetcher,options)=>{keys.push(key);return {data:options?.fallbackData??'chat',mutate:(...args)=>mutations.push(args)}}}};
      const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/_hooks/use-workbench-navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports:mod.exports,module:mod,URLSearchParams,require:n=>n in modules?modules[n]:require(n.startsWith('@/')?process.cwd()+'/'+n.slice(2):n)});
      const hook=mod.exports.useWorkbenchNavigation();
      for(const section of ['connections','skills']) hook.navigate(section);
      if(type==='regular'){assert.equal(mutations.length,2);assert.equal(pushed.length,0)}
      else {assert.equal(mutations.length,0,'guest must not mount personal panels');assert.equal(pushed.length,status==='loading'?0:2);for(const path of pushed)assert.match(path,/^\\/login\\?next=/)}
    }
  `);
});

test("personal panels do not render the old login placeholders", () => {
  for (const file of ["personal-connections", "personal-skills"]) {
    const source = readFileSync(`app/_components/chat/${file}.tsx`, "utf8");
    assert.doesNotMatch(source, /登录后可以/);
    assert.match(source, /PersonalAccessGate/);
  }
});

test("guest account entry is a direct login instead of a pretend account", () => {
  const source = readFileSync(
    "app/_components/chat/sidebar-user-nav.tsx",
    "utf8"
  );
  assert.doesNotMatch(source, /本地访客/);
  assert.match(source, /data-testid="sidebar-login"/);
});

test("login destinations are allowlisted and cannot navigate outside the app", () => {
  run(`
    const assert=require('node:assert/strict');
    const {authReturnPath,authPageHref,personalLoginHref}=require('./app/_lib/auth-navigation.ts');
    for(const section of ['connections','skills']){
      const next='/?section='+section;
      assert.equal(authReturnPath(next),next);
      assert.equal(new URL(personalLoginHref(section),'https://chat.example').searchParams.get('next'),next);
      assert.equal(new URL(authPageHref('/register',next),'https://chat.example').searchParams.get('next'),next);
    }
    for(const value of [null,'','//attacker.example','https://attacker.example','/\\\\attacker.example','/%2f%2fattacker.example','/chat/private-id','/?section=connections&next=//attacker.example','/?section=skills#fragment','/?section=connections%0a']){
      assert.equal(authReturnPath(value),'/');assert.equal(authPageHref('/login',value),'/login');
    }
  `);
});

test("the access gate never mounts private children for guests or while session is loading", () => {
  run(`
    const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    for(const [status,type] of [['loading','regular'],['authenticated','guest'],['unauthenticated',null],['authenticated','regular']]){
      const effects=[],redirects=[];
      const mod={exports:{}};
      const modules={'next/navigation':{useRouter:()=>({replace:path=>redirects.push(path)})},'next-auth/react':{useSession:()=>({status,data:type?{user:{id:'account',type}}:null})},react:{Fragment:Symbol.for('react.fragment'),useEffect:fn=>effects.push(fn)}};
      vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/_components/chat/personal-access-gate.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:mod.exports,module:mod,require:n=>n in modules?modules[n]:require(n.startsWith('@/')?process.cwd()+'/'+n.slice(2):n)});
      const result=mod.exports.PersonalAccessGate({section:'skills',children:'PRIVATE_COMPONENT'});
      for(const effect of effects)effect();
      const allowed=status==='authenticated'&&type==='regular';
      assert.equal(result?.props?.children??null,allowed?'PRIVATE_COMPONENT':null);if(allowed)assert.equal(result.key,'account');
      assert.equal(redirects.length,!allowed&&status!=='loading'?1:0);
    }
  `);
});

test("workbench caches are keyed by identity and auth success crosses a fresh navigation boundary", () => {
  const hook = readFileSync("app/_hooks/use-workbench-navigation.ts", "utf8");
  assert.match(hook, /\["workbench:section", session\?\.user\?\.id/);
  for (const page of ["login", "register"]) {
    const source = readFileSync(`app/(auth)/${page}/page.tsx`, "utf8");
    assert.match(source, /authReturnPath\(search.get\("next"\)\)/);
    assert.match(source, /window.location.replace/);
  }
});

test("direct personal links require login before guest creation and preserve the destination", () => {
  run(`
    const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    const {NextResponse}=require('next/server');
    (async()=>{for(const token of [null,{email:'guest-1',type:'guest'},{email:'account@example.test',type:'regular'}]){
      const modules={'next/server':{NextResponse},'next-auth/jwt':{getToken:async()=>token},uuid:{v7:()=> 'trace'},'@/server/shared/auth-cookies':{usesSecureAuthCookies:()=>false}};
      const mod={exports:{}};
      vm.runInNewContext(ts.transpileModule(fs.readFileSync('proxy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod,process:{env:{}},URL,Headers,Response,require:n=>n in modules?modules[n]:require(n.startsWith('@/')?process.cwd()+'/'+n.slice(2):n)});
      for(const section of ['connections','skills']){
        const url=new URL('https://chat.example/?section='+section);
        const result=await mod.exports.proxy({nextUrl:url,url:url.href,headers:new Headers()});
        if(token?.type==='regular')assert.equal(result.status,200);
        else {const target=new URL(result.headers.get('location'));assert.equal(target.pathname,'/login');assert.equal(target.searchParams.get('next'),'/?section='+section)}
      }
      for(const page of ['login','register']){
        const url=new URL('https://chat.example/'+page+'?next=%2F%3Fsection%3Dskills');
        const result=await mod.exports.proxy({nextUrl:url,url:url.href,headers:new Headers()});
        if(token?.type==='regular')assert.equal(result.headers.get('location'),'https://chat.example/?section=skills');
        else assert.equal(result.status,200,'public auth page must not create guest or drop next');
      }
    }})().catch(error=>{console.error(error);process.exitCode=1});
  `);
});

test("failed credentials produce an inline form alert without depending on a missing toaster", () => {
  const form = readFileSync("app/_components/chat/auth-form.tsx", "utf8");
  assert.match(form, /role="alert"/);
  for (const page of ["login", "register"]) {
    const source = readFileSync(`app/(auth)/${page}/page.tsx`, "utf8");
    assert.match(source, /error=\{error\}/);
    assert.doesNotMatch(source, /import \{ toast \}/);
  }
});
