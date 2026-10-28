"""Opt-in real Next/Auth/Postgres UI acceptance. Model/MCP are local fixtures only.
PERSONAL_CAPABILITIES_ACCEPTANCE=1 LOCAL_TEST_BASE_URL=http://localhost:33379 python ...
Never point this at the normal preview or a hosted service. Private files stay ignored.
"""
import json
import os
import secrets
import time
from pathlib import Path
from uuid import uuid4
from urllib.request import urlopen
from playwright.sync_api import expect, sync_playwright

assert os.environ.get("PERSONAL_CAPABILITIES_ACCEPTANCE") == "1"
BASE=os.environ.get("LOCAL_TEST_BASE_URL","http://localhost:33379")
assert BASE in ["http://localhost:33379","http://127.0.0.1:33379"], "Dedicated local acceptance port only"
OUT=Path('.local-review/personal');OUT.mkdir(parents=True,exist_ok=True)
REPORT={"localFixtureModelAndMcp":True,"realApplicationAuthPostgres":True,"checks":[],"pageErrors":[]}
CHROME=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE')

def check(name,value=True):
 assert value,name
 REPORT['checks'].append(name)
 print(json.dumps({"check":name,"passed":True},ensure_ascii=False),flush=True)

def api(page,path,action=None):
 r=page.request.get(BASE+path) if action is None else page.request.post(BASE+path,data=action,headers={'Origin':BASE})
 return r

def register(browser,label):
 context=browser.new_context(viewport={'width':1440,'height':960})
 page=context.new_page();page.on('pageerror',lambda e:REPORT['pageErrors'].append(str(e)))
 page.goto(BASE+'/register',wait_until='networkidle')
 page.get_by_role('textbox',name='Email',exact=True).fill('personal-'+uuid4().hex+'@example.test')
 page.get_by_label('Password',exact=True).fill(secrets.token_urlsafe(24))
 page.get_by_role('button',name='Sign up',exact=True).click();page.wait_for_url(BASE+'/',timeout=30000)
 check('real registration '+label,api(page,'/api/auth/session').json()['user']['type']=='regular')
 return context,page

def go(page,label):
 page.get_by_role('button',name=label,exact=True).first.click()

def geometry(page,label):
 v=page.evaluate('''() => ({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>{let r=e.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom}})})''')
 check('layout '+label,not v['overflow'] and all(d['left']>=-1 and d['right']<=v['width']+1 for d in v['dialogs']))
 page.screenshot(path=str(OUT/(label+'.png')),full_page=True,animations='disabled')

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,**({'executable_path':CHROME} if CHROME else {}))
 context,page=register(browser,'A');other,second=register(browser,'B')
 try:
  go(page,'连接');expect(page.get_by_test_id('personal-connections')).to_be_visible()
  page.get_by_role('button',name='添加连接',exact=True).click()
  dialog=page.get_by_role('dialog');dialog.get_by_label('连接名称',exact=True).fill('我的测试资料服务')
  dialog.get_by_label('服务地址',exact=True).fill('http://127.0.0.1:4019/mcp')
  dialog.get_by_label('认证方式',exact=False).select_option('bearer')
  key='PERSONAL_DUMMY_KEY_'+uuid4().hex
  dialog.get_by_label('访问密钥',exact=True).fill(key)
  dialog.get_by_role('button',name='测试连接',exact=True).click()
  expect(dialog.get_by_text('测试成功 · 发现 1 个工具',exact=True)).to_be_visible(timeout=20000)
  dialog.get_by_role('checkbox',name='review_rows',exact=False).check()
  geometry(page,'personal-connection-editor')
  dialog.get_by_role('button',name='保存连接',exact=True).click()
  expect(page.get_by_role('dialog')).to_have_count(0,timeout=20000)
  expect(page.get_by_role('heading',name='我的测试资料服务',exact=True)).to_be_visible()
  own=api(page,'/api/personal/mcp').json();server=own['servers'][0]
  check('save personal native MCP through UI',server['allowedTools']==['review_rows'])
  check('read projections never return key or path',key not in json.dumps(own) and 'url' not in server and 'headers' not in server)
  check('other account cannot list personal connection',not api(second,'/api/personal/mcp').json()['servers'])
  foreign_test=api(second,'/api/personal/mcp',{'action':'test','id':server['id'],'connection':{'mode':'keep'}})
  check('other account cannot test saved credentials',foreign_test.status==400)
  page.reload(wait_until='networkidle');go(page,'连接');expect(page.get_by_role('heading',name='我的测试资料服务',exact=True)).to_be_visible()
  check('personal connection survives reload')
  geometry(page,'personal-connections-desktop')
  page.get_by_role('button',name='我的测试资料服务的操作',exact=True).click();page.get_by_role('menuitem',name='管理连接',exact=True).click()
  dialog=page.get_by_role('dialog');dialog.get_by_role('checkbox',name='更换地址或凭据',exact=False).check()
  dialog.get_by_label('服务地址',exact=True).fill('http://127.0.0.1:4019/mcp');dialog.get_by_label('认证方式',exact=False).select_option('bearer');dialog.get_by_label('访问密钥',exact=True).fill('REPLACED_DUMMY_'+uuid4().hex)
  dialog.get_by_role('button',name='测试连接',exact=True).click();expect(dialog.get_by_text('测试成功 · 发现 1 个工具',exact=True)).to_be_visible(timeout=20000)
  dialog.get_by_role('button',name='保存连接',exact=True).click();expect(page.get_by_role('dialog')).to_have_count(0,timeout=20000)
  check('replace private connection credentials without reading old key',api(page,'/api/personal/mcp').json()['revision']>own['revision'])

  go(page,'技能');expect(page.get_by_test_id('personal-skills')).to_be_visible()
  page.get_by_role('button',name='导入技能',exact=True).click();dialog=page.get_by_role('dialog')
  markdown='---\nname: evidence-notes\ndescription: 整理材料，保留来源与缺口\nmetadata:\n  display-name: 我的资料整理方法\n---\n\n# 方法\n\nPERSONAL_SKILL_EVIDENCE：按用户任务需要读取材料与调用已授权工具，不预设调用顺序。\n'
  dialog.locator('input[type=file]').set_input_files({'name':'SKILL.md','mimeType':'text/markdown','buffer':markdown.encode()})
  expect(dialog.get_by_label('技能指令',exact=True)).to_have_value(markdown)
  check('import requires preview',dialog.get_by_role('button',name='保存技能',exact=True).is_disabled())
  dialog.get_by_role('button',name='预览技能',exact=True).click();expect(dialog.get_by_role('heading',name='我的资料整理方法',exact=True)).to_be_visible()
  geometry(page,'personal-skill-preview')
  dialog.get_by_role('button',name='保存技能',exact=True).click();expect(page.get_by_role('dialog')).to_have_count(0,timeout=20000)
  expect(page.get_by_role('heading',name='我的资料整理方法',exact=True)).to_be_visible()
  all_skills=api(page,'/api/personal/skills').json();skill=next(x for x in all_skills['skills'] if x['source']=='personal')
  check('skill metadata contains no instruction body','PERSONAL_SKILL_EVIDENCE' not in json.dumps(all_skills))
  check('other account cannot read personal skill',api(second,'/api/personal/skills',{'action':'read','id':skill['id']}).status==404)
  page.get_by_role('button',name='编辑技能',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_label('技能指令',exact=True).fill(markdown+'\n修订：优先保留可核对的出处。\n');check('editing invalidates previous preview',dialog.get_by_role('button',name='保存技能',exact=True).is_disabled())
  dialog.get_by_role('button',name='预览技能',exact=True).click();expect(dialog.get_by_role('heading',name='我的资料整理方法',exact=True)).to_be_visible();dialog.get_by_role('button',name='保存技能',exact=True).click();expect(page.get_by_role('dialog')).to_have_count(0,timeout=20000)
  check('edited private skill persists', '修订' in api(page,'/api/personal/skills',{'action':'read','id':skill['id']}).json()['markdown'])
  built=next(x for x in all_skills['skills'] if x['name']=='porta');built_name=built.get('displayName',built['name'])
  page.get_by_role('button',name=built_name+'的操作',exact=True).click();page.get_by_role('menuitem',name='创建个人副本',exact=True).click()
  for _ in range(30):
   if len([x for x in api(page,'/api/personal/skills').json()['skills'] if x['source']=='personal'])>=2:break
   page.wait_for_timeout(100)
  check('copy real built-in Porta skill without granting a connection',len([x for x in api(page,'/api/personal/skills').json()['skills'] if x['source']=='personal'])==2)

  page.get_by_role('button',name='我的资料整理方法的操作',exact=True).click();page.get_by_role('menuitem',name='停用技能',exact=True).click()
  expect(page.get_by_role('heading',name='我的资料整理方法',exact=True)).to_be_visible()
  for _ in range(30):
   if next(x for x in api(page,'/api/personal/skills').json()['skills'] if x['id']==skill['id'])['enabled'] is False:break
   page.wait_for_timeout(100)
  check('disable personal skill removes it from Agent',not any(x.get('id')==skill['id'] for x in api(page,'/api/agent').json()['skills']))
  page.get_by_role('button',name='我的资料整理方法的操作',exact=True).click();page.get_by_role('menuitem',name='启用技能',exact=True).click()
  for _ in range(30):
   if any(x.get('id')==skill['id'] for x in api(page,'/api/agent').json()['skills']):break
   page.wait_for_timeout(100)
  check('enable personal skill restores capability',any(x.get('id')==skill['id'] for x in api(page,'/api/agent').json()['skills']))
  geometry(page,'personal-skills-desktop')
  page.set_viewport_size({'width':390,'height':844});geometry(page,'personal-skills-mobile');page.set_viewport_size({'width':1440,'height':960})
  go(page,'返回对话')
  page.get_by_role('button',name='本次使用',exact=True).click();dialog=page.get_by_role('dialog');expect(dialog.get_by_role('button',name='完成',exact=True)).to_be_visible(timeout=20000)
  for checkbox in dialog.get_by_role('checkbox').all():
   if checkbox.is_enabled():checkbox.uncheck()
  dialog.get_by_role('checkbox',name='我的测试资料服务',exact=False).check();dialog.get_by_role('checkbox',name='我的资料整理方法',exact=False).check()
  geometry(page,'task-scope-personal')
  dialog.get_by_role('button',name='完成',exact=True).click()
  # Actual document upload UI is tested by the existing formal workspace suite.
  box=page.get_by_test_id('multimodal-input');box.fill('PERSONAL_ACCEPTANCE：按需使用我的资料整理方法，查询本地模拟资料并生成可重开的结果表。所有记录仅为测试数据。')
  box.press('Enter');expect(page.get_by_test_id('ask-user')).to_be_visible(timeout=60000)
  ask=page.get_by_test_id('ask-user');ask.get_by_role('radio',name='结果表',exact=True).click()
  ask.get_by_role('textbox').fill('保留原始出处，说明资料缺口。')
  ask.get_by_role('checkbox',name='名称',exact=True).click()
  geometry(page,'dynamic-ask-desktop')
  bounds=ask.get_by_test_id('ask-questions').evaluate('(e)=>({height:e.clientHeight,scroll:e.scrollHeight})')
  check('Ask uses a bounded dynamic question area',bounds['height']<=361)
  # Parallel model calls may ask and request external approval in the same turn.
  page.get_by_test_id('multimodal-input').fill('草稿不应因 Ask 展开而移动')
  box_bounds=page.get_by_test_id('multimodal-input').bounding_box();check('composer remains in viewport during Ask',box_bounds['y']+box_bounds['height']<=961)
  page.get_by_test_id('multimodal-input').fill('')
  pending_chat_id=page.url.split('/chat/')[1].split('?')[0]
  page.get_by_role('button',name='本次使用',exact=True).click();scope_dialog=page.get_by_role('dialog');expect(scope_dialog.get_by_role('button',name='完成',exact=True)).to_be_enabled(timeout=20000)
  for item in scope_dialog.get_by_role('checkbox').all():
   if item.is_enabled():item.uncheck()
  scope_dialog.get_by_role('button',name='完成',exact=True).click()
  check('staged next-turn selection does not change pending scope',api(page,'/api/personal/scope?chatId='+pending_chat_id).json()['selection']['serverIds']==['personal:'+server['id']])
  ask.get_by_role('button',name='提交回答',exact=True).click()
  page.get_by_role('button',name='允许执行',exact=True).click()
  expect(page.get_by_text('FORMAL_ACCEPTANCE_DONE',exact=False)).to_be_visible(timeout=60000)
  chat_id=page.url.split('/chat/')[1].split('?')[0]
  saved_scope=api(page,'/api/personal/scope?chatId='+chat_id).json()
  check('server persisted exact task capability scope',saved_scope['selection']=={'serverIds':['personal:'+server['id']],'skillIds':[skill['id']]})
  check('other account cannot access task scope',api(second,'/api/personal/scope?chatId='+chat_id).status==403)
  library=api(page,'/api/library').json();check('Agent produced a persisted generic artifact',bool(library))
  with urlopen('http://127.0.0.1:4018/health') as response: health=json.load(response)
  check('actual advertised personal skill loader was called',any(r['chosen']=='loadSkill' for r in health['requests']))
  check('only selected private MCP alias reached model',all(not any(t.startswith('formal__') for t in r['tools']) for r in health['requests'] if any('personal' in t for t in r['tools'])))
  page.reload(wait_until='networkidle');go(page,'文件');expect(page.get_by_role('button',name='打开成果：FORMAL 本地证据结果表',exact=True)).to_be_visible(timeout=20000);page.get_by_role('button',name='打开成果：FORMAL 本地证据结果表',exact=True).click()
  expect(page.get_by_text('FORMAL 本地证据结果表',exact=True).first).to_be_visible(timeout=20000);geometry(page,'personal-agent-artifact-reopen')
  check('saved artifact reopened after reload')
  go(page,'连接');page.get_by_role('button',name='我的测试资料服务的操作',exact=True).click();page.get_by_role('menuitem',name='停用连接',exact=True).click()
  for _ in range(30):
   if not any(x['id']=='personal:'+server['id'] for x in api(page,'/api/agent').json()['servers']):break
   page.wait_for_timeout(100)
  check('disable connection removes it from Agent',not any(x['id']=='personal:'+server['id'] for x in api(page,'/api/agent').json()['servers']))
  page.get_by_role('button',name='我的测试资料服务的操作',exact=True).click();page.get_by_role('menuitem',name='删除连接',exact=True).click();page.get_by_role('alertdialog').get_by_role('button',name='确认删除',exact=True).click()
  expect(page.get_by_role('heading',name='我的测试资料服务',exact=True)).to_have_count(0)
  check('delete connection through explicit confirmation',not api(page,'/api/personal/mcp').json()['servers'])
  go(page,'技能');page.get_by_role('button',name='我的资料整理方法的操作',exact=True).click();page.get_by_role('menuitem',name='删除技能',exact=True).click();page.get_by_role('alertdialog').get_by_role('button',name='确认删除',exact=True).click()
  expect(page.get_by_role('heading',name='我的资料整理方法',exact=True)).to_have_count(0)
  check('delete personal skill through explicit confirmation',not any(x['id']==skill['id'] for x in api(page,'/api/personal/skills').json()['skills']))

  page.get_by_role('button',name='新对话',exact=True).click();page.get_by_role('button',name='本次使用',exact=True).click();dialog=page.get_by_role('dialog');expect(dialog.get_by_role('button',name='完成',exact=True)).to_be_visible()
  for item in dialog.get_by_role('checkbox').all():
   if item.is_enabled(): item.uncheck()
  dialog.get_by_role('button',name='完成',exact=True).click()
  with urlopen('http://127.0.0.1:4018/health') as response:before=len(json.load(response)['requests'])
  page.get_by_test_id('multimodal-input').fill('EMPTY_CAPABILITY_SCOPE：只整理已有文字，不使用外部连接或技能。');page.get_by_test_id('multimodal-input').press('Enter')
  expect(page.get_by_test_id('ask-user')).to_be_visible(timeout=60000);page.get_by_test_id('ask-user').get_by_role('button',name='跳过',exact=True).click();expect(page.get_by_text('FORMAL_ACCEPTANCE_DONE',exact=False)).to_be_visible(timeout=60000)
  with urlopen('http://127.0.0.1:4018/health') as response:latest=json.load(response)['requests'][before:]
  check('explicit empty scope never offers MCP operations',all(not any('review_rows' in tool or tool.startswith('formal__') for tool in r['tools']) for r in latest))
  current_id=page.url.split('/chat/')[1].split('?')[0];check('explicit empty scope persisted without fallback to all',api(page,'/api/personal/scope?chatId='+current_id).json()['selection']=={'serverIds':[],'skillIds':[]})
  check('no browser runtime errors',not REPORT['pageErrors'])
 except Exception:
  page.screenshot(path=str(OUT/"failure.png"),full_page=True)
  raise
 finally:
  (OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
  context.close();other.close();browser.close()
