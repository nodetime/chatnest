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

test("development admin uses the real password check and production keeps email login", () => {
  run(`
    const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    const {hashSync}=require('bcrypt-ts');
    const account={id:'dev-account',email:'admin@chatnest.local',password:hashSync('123456',10)};
    let config;
    const modules={
      'next-auth':{__esModule:true,default:value=>{config=value;return {handlers:{GET(){},POST(){}},auth(){},signIn(){},signOut(){}}}},
      'next-auth/providers/credentials':{__esModule:true,default:value=>value},
      '@/app/_lib/constants':{DUMMY_PASSWORD:hashSync('dummy-password',10)},
      '@/server/composition':{getUseCases:()=>({users:{findByEmail:async email=>email===account.email?[account]:[]}})},
      './auth.config':{authConfig:{}},
    };
    const mod={exports:{}};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/(auth)/auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports:mod.exports,module:mod,require:n=>n in modules?modules[n]:require(n.startsWith('@/')?process.cwd()+'/'+n.slice(2):n)});
    (async()=>{
      const authorize=config.providers[0].authorize;
      for(const environment of ['development','test','production']){
        process.env.NODE_ENV=environment;
        const result=await authorize({email:'admin',password:'123456'});
        assert.equal(result?.id??null,environment==='development'?account.id:null);
        assert.equal(await authorize({email:'admin',password:'wrong-password'}),null);
        assert.equal((await authorize({email:account.email,password:'123456'})).id,account.id);
      }
    })().catch(error=>{console.error(error);process.exitCode=1});
  `);
});

test("only development login accepts admin while registration remains email based", () => {
  run(`
    const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    const calls=[];
    const modules={
      './auth':{signIn:async(...args)=>calls.push(args)},
      '@/server/composition':{getUseCases:()=>({users:{findByEmail:async()=>[]}})},
    };
    const mod={exports:{}};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/(auth)/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod,require:n=>n in modules?modules[n]:require(n.startsWith('@/')?process.cwd()+'/'+n.slice(2):n)});
    (async()=>{
      for(const environment of ['development','test','production']){
        process.env.NODE_ENV=environment;
        const form=new FormData();form.set('email','admin');form.set('password','123456');
        const result=await mod.exports.login({status:'idle'},form);
        assert.equal(result.status,environment==='development'?'success':'invalid_data');
        assert.equal((await mod.exports.register({status:'idle'},form)).status,'invalid_data');
      }
      assert.equal(calls.length,1);
      assert.equal(calls[0][1].email,'admin@chatnest.local');
    })().catch(error=>{console.error(error);process.exitCode=1});
  `);
});

test("development account follows env configuration and rejects bcrypt truncation", () => {
  run(`
    const assert=require('node:assert/strict');
    const {getDevelopmentAccount,resolveLoginEmail}=require('./server/shared/login-identity.ts');
    process.env.NODE_ENV='development';
    process.env.DEV_ADMIN_USERNAME='demo_admin';
    process.env.DEV_ADMIN_PASSWORD='different-password';
    assert.equal(resolveLoginEmail('demo_admin'),'demo_admin@chatnest.local');
    assert.equal(resolveLoginEmail('admin'),'admin');
    assert.equal(getDevelopmentAccount().password,'different-password');
    process.env.DEV_ADMIN_PASSWORD='密'.repeat(25);
    assert.throws(()=>getDevelopmentAccount(),/DEV_ADMIN_PASSWORD/);
  `);
});

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
    for(const path of ['/billing','/usage','/organizations','/account','/account/billing','/account/usage','/account/organizations']){
      assert.equal(authReturnPath(path),path);
      assert.equal(authPageHref('/login',path),'/login?next='+encodeURIComponent(path));
    }
    for(const path of ['/admin','/admin/billing','/admin/connections','/admin/models','/admin/storage']){
      assert.equal(authReturnPath(path),path);
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

test("account pages and APIs stay out of the guest workspace boundary", () => {
  run(`
    const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    const {NextResponse}=require('next/server');
    (async()=>{for(const token of [null,{email:'guest-1',type:'guest'},{email:'account@example.test',type:'regular'}]){
      const modules={'next/server':{NextResponse},'next-auth/jwt':{getToken:async()=>token},uuid:{v7:()=> 'trace'},'@/server/shared/auth-cookies':{usesSecureAuthCookies:()=>false}};
      const mod={exports:{}};
      vm.runInNewContext(ts.transpileModule(fs.readFileSync('proxy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod,process:{env:{}},URL,Headers,Response,require:n=>n in modules?modules[n]:require(n.startsWith('@/')?process.cwd()+'/'+n.slice(2):n)});
      for(const path of ['/billing','/usage','/organizations','/account','/account/billing','/account/usage','/account/organizations']){
        const url=new URL('https://chat.example'+path);
        const result=await mod.exports.proxy({nextUrl:url,url:url.href,headers:new Headers()});
        if(token?.type==='regular')assert.equal(result.status,200);
        else {const target=new URL(result.headers.get('location'));assert.equal(target.pathname,'/login');assert.equal(target.searchParams.get('next'),path)}
      }
      for(const path of ['/admin','/admin/billing']){
        const url=new URL('https://chat.example'+path);
        const result=await mod.exports.proxy({nextUrl:url,url:url.href,headers:new Headers()});
        if(token?.type==='regular')assert.equal(result.status,200);
        else {const target=new URL(result.headers.get('location'));assert.equal(target.pathname,'/login');assert.equal(target.searchParams.get('next'),path)}
      }
      for(const path of ['/api/billing','/api/billing/plans','/api/organizations','/api/organizations/1/members']){
        const url=new URL('https://chat.example'+path);
        const result=await mod.exports.proxy({nextUrl:url,url:url.href,headers:new Headers()});
        if(token?.type==='regular')assert.equal(result.status,200);
        else {assert.equal(result.status,401);assert.deepEqual(await result.json(),{code:'UNAUTHORIZED'})}
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

test("authentication pages use Chinese labels and a real 数知探AI form, not a template preview", () => {
  const login = readFileSync("app/(auth)/login/page.tsx", "utf8");
  const register = readFileSync("app/(auth)/register/page.tsx", "utf8");
  const form = readFileSync("app/_components/chat/auth-form.tsx", "utf8");
  const layout = readFileSync("app/(auth)/layout.tsx", "utf8");
  const submit = readFileSync("app/_components/chat/submit-button.tsx", "utf8");
  assert.match(login, /登录 数知探AI/);
  assert.match(register, /注册 数知探AI/);
  assert.match(form, /邮箱/);
  assert.match(form, /密码/);
  assert.match(form, /autoComplete=\{passwordAutoComplete\}/);
  assert.doesNotMatch(form, /\sautoFocus\b/);
  assert.match(layout, /数知探AI/);
  assert.doesNotMatch(
    layout,
    /Preview|VercelIcon|Powered by|AI Gateway|w-screen|h-dvh/
  );
  for (const source of [login, register, form, layout, submit]) {
    assert.doesNotMatch(
      source,
      /Welcome back|Create account|Sign in|Sign up|Get started for free|No account\?|Have an account\?|Submit form|Loading/
    );
  }
});

test("message reads return JSON without guest bootstrap and validate chat IDs before storage", () => {
  run(`
    const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    function load(file,mocks){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,process:{env:{}},URL,Headers,Response,require:n=>mocks[n]??require(n.startsWith('@/')?process.cwd()+'/'+n.slice(2):n)});return mod.exports;}
    const path='/api/messages', id='27db2c24-140d-44e0-a16d-7fcc2c3f6b90';
    const req=value=>new Request('http://localhost'+path+(value===undefined?'':'?chatId='+value));
    const {proxy}=load('proxy.ts',{'next-auth/jwt':{getToken:async()=>null},uuid:{v7:()=> 'trace'}});
    let owner='owner',visibility='private',session=null,chatReads=0,messageReads=0;
    const {GET}=load('app/(chat)/api/messages/route.ts',{
      '@/app/_lib/utils':{convertToUIMessages:x=>x},'@/app/(auth)/auth':{auth:async()=>session},
      '@/server/composition':{getUseCases:()=>({chats:{findById:async()=>{chatReads++;return {userId:owner,visibility};}},messages:{listByChatId:async()=>{messageReads++;return ['reply'];}}})},
      '@/server/domain/capability/projection':{redactPersonalSkillOutputs:x=>x},
    });
    (async()=>{
      const url=new URL(req(id).url), forwarded=await proxy({nextUrl:url,url:url.href,headers:new Headers()});
      assert.equal(forwarded.headers.get('location'),null,'messages must reach the visibility guard, not the guest redirect');
      for(const value of [undefined,'','not-a-uuid']){
        const r=await GET(req(value)); assert.equal(r.status,400); assert.equal((await r.json()).code,'INVALID_CHAT_ID');
      }
      assert.equal(chatReads,0);
      let r=await GET(req(id));assert.equal(r.status,401);assert.equal((await r.json()).code,'UNAUTHORIZED');
      session={user:{id:'other'}};r=await GET(req(id));assert.equal(r.status,403);assert.equal((await r.json()).code,'FORBIDDEN');
      assert.equal(messageReads,0,'private messages must not be loaded before authorization');
      session={user:{id:owner}};r=await GET(req(id));assert.equal(r.status,200);assert.equal((await r.json()).messages[0],'reply');assert.equal(r.headers.get('cache-control'),'private, no-store');
      session=null;visibility='public';r=await GET(req(id));assert.equal(r.status,200);assert.equal((await r.json()).isReadonly,true);
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `);
});
