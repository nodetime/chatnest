"""Opt-in style/keyboard review on an isolated Next/Auth/Postgres host.
No model task is started. Model/MCP health endpoints are local test fixtures only.
Run with LESSIE_STYLE_ACCEPTANCE=1 LOCAL_TEST_BASE_URL=http://127.0.0.1:33379.
Screenshots and registration credentials remain private in memory/ignored output.
"""
import json
import os
import secrets
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4
from playwright.sync_api import expect, sync_playwright

assert os.environ.get('LESSIE_STYLE_ACCEPTANCE') == '1'
BASE = os.environ.get('LOCAL_TEST_BASE_URL', '')
assert BASE == 'http://127.0.0.1:33379', 'Dedicated test host only'
OUT = Path('.local-review/lessie-20261028')
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'localFixtureOnly': True, 'checks': [], 'geometry': {}, 'pageErrors': []}


def health():
    with urlopen('http://127.0.0.1:4018/health', timeout=5) as response:
        data = json.load(response)
    assert data['fixtureOnly']
    return data['modelCalls']


def check(label, value=True):
    assert value, label
    REPORT['checks'].append(label)
    print(json.dumps({'check': label, 'passed': True}, ensure_ascii=False), flush=True)


def capture(page, label):
    values = page.evaluate('''() => ({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,
      sidebar:document.querySelector('[data-slot="sidebar-container"]')?.getBoundingClientRect().width,
      dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}}),
      nav:document.querySelector('[data-testid="settings-navigation"]')?.getAttribute('aria-orientation')})''')
    check(label + ' fits viewport', not values['overflow'] and all(d['x'] >= -1 and d['y'] >= -1 and d['right'] <= values['width']+1 and d['bottom'] <= values['height']+1 for d in values['dialogs']))
    REPORT['geometry'][label] = values
    page.screenshot(path=str(OUT/(label+'.png')), full_page=True, animations='disabled')


health()
model_posts = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE'])
    context = browser.new_context(viewport={'width': 1440, 'height': 960})
    page = context.new_page()
    page.on('pageerror', lambda error: REPORT['pageErrors'].append(str(error)))
    page.on('request', lambda request: model_posts.append(request.url) if request.url.endswith('/api/chat') and request.method=='POST' else None)
    try:
        page.goto(BASE+'/register', wait_until='networkidle')
        page.get_by_role('textbox', name='邮箱', exact=True).fill('style-'+uuid4().hex+'@example.test')
        page.get_by_label('密码', exact=True).fill(secrets.token_urlsafe(24))
        page.get_by_role('button', name='注册', exact=True).click()
        page.wait_for_url(BASE+'/', timeout=30000)
        page.goto(BASE+'/chat',wait_until='networkidle')
        expect(page.get_by_test_id('multimodal-input')).to_be_visible()
        page.get_by_role('heading', name='今天想完成什么？', exact=True).click()
        capture(page, 'home-light')
        for section in ['连接', '技能']:
            page.get_by_role('button', name=section, exact=True).first.click()
            expect(page.get_by_test_id('personal-connections' if section=='连接' else 'personal-skills')).to_be_visible(timeout=30000)
            capture(page, 'section-'+('connections' if section=='连接' else 'skills'))
            page.set_viewport_size({'width':390, 'height':844})
            capture(page, 'section-'+('connections' if section=='连接' else 'skills')+'-mobile')
            page.set_viewport_size({'width':1440, 'height':960})
        page.get_by_test_id('user-nav-button').click()
        page.get_by_role('menuitem', name='设置', exact=True).click()
        dialog = page.get_by_role('dialog', name='设置', exact=True)
        nav = page.get_by_test_id('settings-navigation')
        expect(nav).to_have_attribute('aria-orientation', 'vertical')
        general = page.get_by_role('tab', name='常规', exact=True)
        general.focus()
        page.keyboard.press('ArrowDown')
        expect(page.get_by_role('tab', name='连接', exact=True)).to_be_focused()
        expect(page.get_by_role('tab', name='连接', exact=True)).to_have_attribute('aria-selected','true')
        page.keyboard.press('ArrowDown')
        expect(page.get_by_role('tab', name='技能', exact=True)).to_be_focused()
        check('desktop settings keyboard changes selected tab and focus')
        capture(page, 'settings-skills')
        general.click()
        dialog.get_by_role('button',name='深色',exact=True).click()
        expect(page.locator('html')).to_have_class('dark')
        capture(page, 'settings-dark')
        page.keyboard.press('Escape')
        page.get_by_role('button', name='返回对话', exact=True).click()
        capture(page, 'home-dark')
        page.get_by_test_id('user-nav-button').click()
        page.get_by_role('menuitem', name='设置', exact=True).click()
        dialog.get_by_role('button', name='浅色', exact=True).click()
        expect(page.locator('html')).to_have_class('light')
        page.keyboard.press('Escape')
        page.set_viewport_size({'width':390,'height':844})
        page.get_by_role('button',name='打开侧栏',exact=True).click()
        page.get_by_test_id('user-nav-button').click()
        page.get_by_role('menuitem',name='设置',exact=True).click()
        expect(nav).to_have_attribute('aria-orientation','horizontal')
        general.focus()
        page.keyboard.press('ArrowRight')
        expect(page.get_by_role('tab',name='连接',exact=True)).to_be_focused()
        capture(page, 'settings-mobile')
        page.get_by_role('tab',name='技能',exact=True).click()
        content=page.get_by_test_id('settings-content')
        metrics=content.evaluate('(e)=>({height:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY})')
        check('mobile settings content scrolls independently', metrics['overflow']=='auto' and metrics['scroll']>metrics['height'])
        capture(page, 'settings-skills-mobile')
        page.keyboard.press('Escape')
        page.keyboard.press('Escape')
        capture(page, 'home-mobile')
        check('style and settings checks did not start a model task', not model_posts)
        check('no browser runtime errors',not REPORT['pageErrors'])
    except Exception as error:
        REPORT['failure']=type(error).__name__
        page.screenshot(path=str(OUT/'style-failure.png'), full_page=True)
        raise
    finally:
        (OUT/'style-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
        context.close()
        browser.close()
