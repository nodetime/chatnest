"""Opt-in formal workspace acceptance against isolated local Next + PostgreSQL.

External model and MCP are explicit loopback fixtures, never live supplier/model
acceptance. Start the dedicated fixture services and Next separately. Only chats
created by this fresh guest context are removed; existing user data is untouched.
Run: FORMAL_WORKSPACE_ACCEPTANCE=1 LOCAL_TEST_BASE_URL=http://127.0.0.1:33378 \
  python3 tests/visual/formal_workspace.py
Screenshots, uploaded DOCX, and the report stay in ignored .local-review/formal/.
"""
import json
import os
import re
import secrets
from uuid import uuid4
import time
import zipfile
from pathlib import Path
from urllib.request import urlopen
from xml.sax.saxutils import escape

from playwright.sync_api import expect, sync_playwright

assert os.environ.get("FORMAL_WORKSPACE_ACCEPTANCE") == "1", "Explicit local fixture opt-in required"
BASE = os.environ.get("LOCAL_TEST_BASE_URL", "http://127.0.0.1:33378")
assert BASE.startswith(("http://127.0.0.1:", "http://localhost:")), "Loopback Next only"
OUT = Path(".local-review/formal")
OUT.mkdir(parents=True, exist_ok=True)
EXTENDED=os.environ.get("FORMAL_EXTENDED_INTERACTIONS")=="1"
REPORT = {"fixtureModelAndMcp": True, "realNextAuthPostgresUploadsAndArtifacts": True, "checks": [], "pageErrors": []}


def check(name, value=True):
    assert value, name
    REPORT["checks"].append(name)
    print(json.dumps({"check": name, "passed": True}, ensure_ascii=False), flush=True)


def fixture_health():
    with urlopen("http://127.0.0.1:4018/health", timeout=3) as response:
        value = json.load(response)
    assert value["fixtureOnly"] is True
    return value


def docx():
    path = OUT / "formal-source.docx"
    content = "FORMAL_UPLOAD_EVIDENCE：这是从真实 DOCX 上传并解析的本地验收资料。名称 Alpha，价格18；名称 Beta，价格24。"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        archive.writestr("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        archive.writestr("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' + escape(content) + '</w:t></w:r></w:p></w:body></w:document>')
    return path


def geometry(page, label):
    page.screenshot(path=str(OUT / (label + ".png")), full_page=True, animations="disabled")
    values = page.evaluate("""() => {
      const input = document.querySelector('[data-testid="multimodal-input"]');
      const rect = input?.getBoundingClientRect();
      const sidebar = document.querySelector('[data-slot="sidebar-container"]')?.getBoundingClientRect();
      const ask = document.querySelector('[data-testid="ask-user"]')?.getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,sidebarWidth:sidebar?.width??null,ask:ask?{x:ask.x,width:ask.width}:null,
        input:rect?{x:rect.x,y:rect.y,width:rect.width,bottom:rect.bottom}:null};
    }""")
    assert values["scrollWidth"] <= values["width"] + 1, (label, values)
    if values["input"]:
        assert values["input"]["x"] >= -1 and values["input"]["bottom"] <= values["height"] + 1, (label, values)
    if values["ask"]:
        assert values["ask"]["x"] >= -1 and values["ask"]["x"] + values["ask"]["width"] <= values["width"] + 1, (label, values)
    REPORT.setdefault("geometry", {})[label] = values
    check("geometry: " + label)



def long_title_geometry(page, label):
    # DOM-only text boundary probe, not an edit/save/model acceptance claim.
    title = page.get_by_test_id("artifact").get_by_role("button", name="选择本次对话的产物", exact=True).locator("span").first
    original = title.inner_text()
    try:
        title.evaluate("(element) => { element.textContent = '超长产物标题与来源资料核对报告'.repeat(24) }")
        geometry(page, label)
        values = page.evaluate("""() => {
          const bar=document.querySelector('[data-testid="workspace-titlebar"]');
          const toolbar=document.querySelector('[data-testid="workspace-toolbar"]');
          const title=bar.querySelector('[aria-label="选择本次对话的产物"] span');
          const view=bar.querySelector('[aria-label="切换工作区视图"]');
          const close=bar.querySelector('[aria-label="关闭工作区"]');
          return {barHeight:bar.getBoundingClientRect().height,
            separate:toolbar.getBoundingClientRect().y>=bar.getBoundingClientRect().bottom-1,
            fits:title.getBoundingClientRect().right<=view.getBoundingClientRect().left+1 && close.getBoundingClientRect().right<=innerWidth,
            truncated:title.scrollWidth>title.clientWidth};
        }""")
        check(label + ": long title truncates without moving toolbar or close", abs(values["barHeight"]-52)<1 and values["separate"] and values["fits"] and values["truncated"])
    finally:
        title.evaluate("(element, text) => {element.textContent=text}", original)


def saved_messages(page, chat_id, predicate=lambda _: True):
    deadline = time.monotonic() + 20
    while True:
        response = page.request.get(BASE + "/api/messages?chatId=" + chat_id)
        assert response.ok, response.status
        messages = response.json()["messages"]
        if predicate(messages):
            return messages
        assert time.monotonic() < deadline, "expected persisted state not observed"
        page.wait_for_timeout(200)


def parts_of(messages):
    return [part for message in messages if message["role"] == "assistant" for part in message["parts"]]


start_health = fixture_health()
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, **({"executable_path": os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE"]} if os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE") else {}))
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    page = context.new_page()
    page.on("pageerror", lambda error: REPORT["pageErrors"].append(str(error)))
    owned_chats = []
    chat_posts = []
    page.on("request", lambda request: chat_posts.append(request.post_data_json) if request.url.endswith("/api/chat") and request.method == "POST" else None)
    try:
        page.goto(BASE + "/chat", wait_until="networkidle", timeout=90000)
        models = page.request.get(BASE + "/api/models").json()
        check("dedicated local fixture model selected", models["selectableModelIds"] == ["formal-fixture"])
        expect(page.get_by_test_id("multimodal-input")).to_be_visible(timeout=30000)
        session_user = page.request.get(BASE + "/api/auth/session").json().get("user", {})
        REPORT["fixtureGuestId"] = session_user.get("id")
        check("real fresh guest authentication", session_user.get("type") == "guest")
        if os.environ.get("FORMAL_SKIP_UPLOAD") != "1":
            account = {"email": "formal-" + uuid4().hex + "@example.test", "password": secrets.token_urlsafe(24)}
            credentials_path = OUT / "private-account.json"
            credentials_path.write_text(json.dumps(account))
            credentials_path.chmod(0o600)
            page.goto(BASE + "/register", wait_until="networkidle")
            page.get_by_role("textbox", name="邮箱", exact=True).fill(account["email"])
            page.get_by_label("密码", exact=True).fill(account["password"])
            page.get_by_role("button", name="注册", exact=True).click()
            page.wait_for_url(BASE + "/", timeout=30000)
            page.goto(BASE + "/chat", wait_until="networkidle")
            session_user = page.request.get(BASE + "/api/auth/session").json().get("user", {})
            REPORT["fixtureRegisteredUserId"] = session_user.get("id")
            check("real browser registration for upload-eligible local test account", session_user.get("type") == "regular")
        summary = page.request.get(BASE + "/api/agent")
        REPORT["agentSummary"] = {"status": summary.status, "data": summary.json()}
        check("local uploads configured", summary.ok and summary.json().get("uploadsConfigured") is True)
        geometry(page, "formal-home-desktop")
        page.get_by_role("button", name="切换侧栏", exact=True).click()
        geometry(page, "formal-home-sidebar-collapsed")
        check("collapsed sidebar has 72px geometry", abs(REPORT["geometry"]["formal-home-sidebar-collapsed"]["sidebarWidth"] - 72) < 1)
        page.get_by_role("button", name="切换侧栏", exact=True).click()
        geometry(page, "formal-home-sidebar-expanded")
        check("expanded sidebar has 208px geometry", abs(REPORT["geometry"]["formal-home-sidebar-expanded"]["sidebarWidth"] - 208) < 1)
        if os.environ.get("FORMAL_SKIP_UPLOAD") != "1":
            # Use the actual enabled menu, rather than firing an event on an
            # unhydrated hidden input before client capability/session loading.
            page.get_by_test_id("composer-menu").click()
            add_file = page.get_by_role("menuitem", name="添加附件", exact=True)
            expect(add_file).to_be_enabled(timeout=30000)
            with page.expect_response(lambda response: response.url.endswith("/api/files/upload"), timeout=30000) as upload_info:
                with page.expect_file_chooser() as chooser:
                    add_file.click()
                chooser.value.set_files(str(docx()))
            upload = upload_info.value
            REPORT["upload"] = {"status": upload.status, "data": upload.json()}
            check("real DOCX upload HTTP succeeded", upload.ok)
            expect(page.get_by_test_id("attachments-preview")).to_contain_text("formal-source.docx", timeout=30000)
            expect(page.get_by_test_id("send-button")).to_be_enabled(timeout=30000)
        page.get_by_test_id("multimodal-input").fill(("FORMAL_ARTIFACT_PAIR " if EXTENDED else "")+"FORMAL_ACCEPTANCE：请读取上传的 DOCX，报告任务计划，用表单询问我结果格式与备注，得到回答后经独立审批读取本地 MCP 证据，再用真实 createResultTable 产出表格。这是本地模拟模型/MCP验收，不是真实供应商查询。" + "长消息边界验证。" * 120)
        with page.expect_response(lambda response: response.url.endswith("/api/chat") and response.request.method == "POST", timeout=60000) as chat_info:
            page.get_by_test_id("send-button").click()
        chat_response = chat_info.value
        REPORT["chatResponse"] = {"status": chat_response.status}
        if not chat_response.ok:
            REPORT["chatResponse"]["error"] = chat_response.text()
        check("real chat request accepted", chat_response.ok)
        page.wait_for_url("**/chat/*", timeout=60000)
        chat_id = page.url.rsplit("/", 1)[-1]
        owned_chats.append(chat_id)
        ask = page.get_by_test_id("ask-user")
        expect(ask).to_contain_text("等待你的回答", timeout=90000)
        check("model-driven Todo and Ask generated")
        page.get_by_role("button", name=re.compile("^任务进度")).first.click()
        expect(page.get_by_test_id("task-progress").first).to_contain_text("任务进度 1 / 3")
        page.keyboard.press("Escape")
        saved = saved_messages(page, chat_id, lambda messages: any(part.get("type") == "tool-askUser" and part.get("state") == "input-available" for part in parts_of(messages)))
        check("pending Ask and Todo persisted in real database")
        if os.environ.get("FORMAL_SKIP_UPLOAD") != "1":
            check("real DOCX parsed into model context", fixture_health()["uploadedTextSeen"])
        else:
            REPORT["realUploadSkipped"] = True
        ask.get_by_role("button", name="提交回答", exact=True).scroll_into_view_if_needed()
        geometry(page, "formal-ask-desktop")
        before = len(chat_posts)
        ask.get_by_role("radio", name="结果表", exact=True).check()
        ask.get_by_role("textbox").fill("先写的说明")
        ask.get_by_role("textbox").fill("编辑后的说明：仅采用本地模拟证据")
        ask.get_by_role("checkbox", name="名称", exact=True).check()
        ask.get_by_role("checkbox", name="价格", exact=True).check()
        check("Ask draft remains editable without continuation", len(chat_posts) == before)
        # Responsive boundary while long question and draft are present.
        page.set_viewport_size({"width": 390, "height": 844})
        ask.get_by_role("button", name="提交回答", exact=True).scroll_into_view_if_needed()
        geometry(page, "formal-ask-mobile")
        page.set_viewport_size({"width": 1440, "height": 960})
        model_calls_before_answer = fixture_health()["modelCalls"]
        ask.get_by_role("button", name="提交回答", exact=True).click()
        approval = page.get_by_test_id("tool-activity").filter(has=page.get_by_role("button", name="允许执行", exact=True))
        expect(approval).to_be_visible(timeout=60000)
        expect(ask).to_contain_text("已回答")
        saved_messages(page, chat_id, lambda messages: any(part.get("type") == "tool-askUser" and part.get("state") == "output-available" for part in parts_of(messages)))
        check("partial Ask saves without invoking model while MCP approval pending", fixture_health()["modelCalls"] == model_calls_before_answer)
        page.reload(wait_until="networkidle")
        expect(ask).to_contain_text("编辑后的说明：仅采用本地模拟证据")
        expect(approval).to_be_visible()
        check("refresh preserves answered Ask and pending independent MCP approval")
        check("MCP not executed before approval", fixture_health()["mcpCalls"] == start_health["mcpCalls"])
        approval.get_by_role("button", name="允许执行", exact=True).click()
        expect(page.get_by_text("FORMAL_ACCEPTANCE_DONE", exact=False).last).to_be_visible(timeout=90000)
        expect(page.get_by_test_id("stop-button")).to_have_count(0, timeout=30000)
        final = saved_messages(page, chat_id, lambda messages: any(part.get("type") == "tool-createResultTable" and part.get("state") == "output-available" for part in parts_of(messages)))
        actual_parts = parts_of(final)
        tool_parts = {part.get("toolName", part["type"].removeprefix("tool-")): part for part in actual_parts if part["type"].startswith("tool-") or part["type"] == "dynamic-tool"}
        for name in ["updateTodo", "askUser", "formal__review_rows", "createResultTable"]:
            check("real SDK tool completed: " + name, tool_parts[name]["state"] == "output-available")
        check("edited Ask answer persisted", tool_parts["askUser"]["output"]["answers"]["notes"] == "编辑后的说明：仅采用本地模拟证据")
        result = next(part["output"] for part in actual_parts if part["type"]=="tool-createResultTable" and part.get("output",{}).get("title")=="FORMAL 本地证据结果表")
        assert result.get("id"), result
        document = page.request.get(BASE + "/api/document?id=" + result["id"] + "&chatId=" + chat_id)
        assert document.ok, document.status
        persisted = document.json()[-1]
        table = json.loads(persisted["content"])
        check("artifact created by tool with exact original MCP rows", table["type"] == "result-table" and table["rows"][0]["name"] == "FORMAL synthetic Alpha" and persisted["kind"] == "sheet")
        expect(page.get_by_test_id("artifact").get_by_text("FORMAL synthetic Alpha", exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_role("button", name="任务进度 3 / 3", exact=True)).to_be_visible()
        check("Todo progress updates from actual completed tool snapshot")
        page.get_by_role("button", name="打开产物：FORMAL 本地证据结果表", exact=True).scroll_into_view_if_needed()
        geometry(page, "formal-artifact-desktop")
        long_title_geometry(page, "formal-artifact-long-title-desktop")
        if EXTENDED:
            page.get_by_role("button",name="打开产物：FORMAL 本地证据结果表",exact=True).click()
            artifact=page.get_by_test_id("artifact")
            page.get_by_role("button",name="个人备注",exact=True).click()
            page.get_by_role("textbox",name="备注内容",exact=True).fill("UNIFIED_NOTE：这份备注需要保留。")
            page.get_by_role("button",name="关闭个人备注",exact=True).click()
            page.get_by_role("button",name="打开产物：FORMAL 另一份证据表",exact=True).click()
            expect(artifact.get_by_role("button",name="选择本次对话的产物",exact=True)).to_contain_text("FORMAL 本地证据结果表")
            check("message artifact switch cannot discard unsaved notes")
            page.get_by_role("button",name="个人备注",exact=True).click()
            expect(page.get_by_role("textbox",name="备注内容",exact=True)).to_have_value("UNIFIED_NOTE：这份备注需要保留。")
            page.get_by_role("button",name="关闭个人备注",exact=True).click()
            page.get_by_role("button",name="保存视图与备注",exact=True).click()
            expect(page.get_by_role("button",name="保存视图与备注",exact=True)).to_have_count(0,timeout=20000)
            page.get_by_role("button",name="打开产物：FORMAL 另一份证据表",exact=True).click()
            expect(artifact.get_by_role("button",name="选择本次对话的产物",exact=True)).to_contain_text("FORMAL 另一份证据表")
            check("saved notes release cross-artifact switch")
            page.get_by_role("button",name="打开产物：FORMAL 本地证据结果表",exact=True).click()
            page.get_by_role("button",name="个人备注",exact=True).click()
            expect(page.get_by_role("textbox",name="备注内容",exact=True)).to_have_value("UNIFIED_NOTE：这份备注需要保留。")
            page.get_by_role("button",name="关闭个人备注",exact=True).click()
            check("reopened result table retains actually saved notes")
            summary=page.get_by_test_id("ask-answer-summary").first
            expect(summary).not_to_have_attribute("open", "")
            summary.locator("summary").click()
            expect(summary).to_contain_text("编辑后的说明")
            check("answered dynamic Ask collapses but remains inspectable")

        close = page.get_by_role("button", name="关闭工作区", exact=True)
        if not close.count():
            raise AssertionError("artifact has no close control")
        close.click()
        expect(page.get_by_test_id("artifact")).not_to_be_visible()
        geometry(page, "formal-artifact-closed")
        page.get_by_role("button", name="打开产物：FORMAL 本地证据结果表", exact=True).click()
        expect(page.get_by_test_id("artifact").get_by_text("FORMAL synthetic Alpha", exact=True)).to_be_visible()
        expect(page.get_by_test_id("artifact").get_by_test_id("artifact-type")).to_contain_text("表格")
        check("close and reopen preserve sheet type")
        page.reload(wait_until="networkidle")
        page.get_by_role("button", name="打开产物：FORMAL 本地证据结果表", exact=True).click()
        expect(page.get_by_test_id("artifact").get_by_text("FORMAL synthetic Alpha", exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_test_id("artifact").get_by_test_id("artifact-type")).to_contain_text("表格")
        check("reload and reopen restore real persisted artifact")
        library_response = page.request.get(BASE + "/api/library")
        assert library_response.ok
        entries = library_response.json()
        check("library returns owned artifact metadata only", any(entry["id"] == result["id"] for entry in entries) and all(set(entry) <= {"id", "title", "kind", "createdAt", "chatId"} for entry in entries))
        foreign_context = browser.new_context()
        foreign_page = foreign_context.new_page()
        foreign_page.goto(BASE + "/chat", wait_until="networkidle")
        REPORT["foreignFixtureGuestId"] = foreign_page.request.get(BASE + "/api/auth/session").json().get("user", {}).get("id")
        foreign_entries = foreign_page.request.get(BASE + "/api/library").json()
        check("another fresh account cannot see owned artifact in library", all(entry["id"] != result["id"] for entry in foreign_entries))
        foreign_context.close()
        page.goto(BASE + "/chat", wait_until="networkidle")
        page.get_by_role("button", name="文件", exact=True).click()
        page.get_by_role("button", name="打开成果：FORMAL 本地证据结果表", exact=True).click()
        page.wait_for_url("**/chat/" + chat_id + "?artifact=" + result["id"])
        expect(page.get_by_test_id("artifact").get_by_text("FORMAL synthetic Alpha", exact=True)).to_be_visible(timeout=30000)
        check("file library entry navigates to source chat and reopens persisted sheet")
        page.get_by_role("button", name="文件", exact=True).click()
        expect(page.get_by_test_id("workbench-section")).to_be_visible()
        page.get_by_role("button", name="打开成果：FORMAL 本地证据结果表", exact=True).click()
        expect(page.get_by_test_id("artifact").get_by_text("FORMAL synthetic Alpha", exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_test_id("artifact").get_by_test_id("artifact-type")).to_contain_text("表格")
        check("same-document library reopen preserves existing content and type")
        page.set_viewport_size({"width": 390, "height": 844})
        geometry(page, "formal-artifact-mobile")
        long_title_geometry(page, "formal-artifact-long-title-mobile")
        page.get_by_role("button", name="关闭工作区", exact=True).click()
        page.get_by_role("button", name="打开侧栏", exact=True).click()
        expect(page.get_by_role("dialog")).to_be_visible()
        geometry(page, "formal-mobile-sidebar")
        page.keyboard.press("Escape")
        page.set_viewport_size({"width": 1440, "height": 960})
        # New fresh chat uses the same real server and a deliberately slow fixture stream.
        page.goto(BASE + "/chat", wait_until="networkidle")
        page.get_by_test_id("multimodal-input").fill("FORMAL_STOP：验证停止保留已输出内容且刷新后不自动续跑。")
        page.get_by_test_id("send-button").click()
        expect(page.get_by_text("FORMAL_STOP_PARTIAL", exact=False)).to_be_visible(timeout=30000)
        stop_id = chat_posts[-1]["id"]
        owned_chats.append(stop_id)
        page.get_by_test_id("stop-button").click()
        expect(page.get_by_test_id("stop-button")).to_have_count(0)
        expect(page.get_by_text("FORMAL_STOP_PARTIAL", exact=False)).to_be_visible()
        expect(page.get_by_test_id("agent-paused")).to_contain_text("已有内容已保留")
        geometry(page, "formal-agent-paused")
        count_after_stop = fixture_health()["modelCalls"]
        page.wait_for_timeout(1200)
        check("stop remains paused without automatic model continuation", fixture_health()["modelCalls"] == count_after_stop)
        posts_before_continue = len(chat_posts)
        page.get_by_test_id("agent-paused").get_by_role("button", name="继续任务", exact=True).click()
        expect(page.get_by_text("FORMAL_RESUMED_DONE", exact=False)).to_be_visible(timeout=30000)
        check("explicit continue is a new user turn not tool output replay", len(chat_posts) == posts_before_continue + 1 and chat_posts[-1].get("message", {}).get("role") == "user" and "messages" not in chat_posts[-1])
        count_after_explicit_continue = fixture_health()["modelCalls"]
        page.goto(BASE + "/chat/" + stop_id, wait_until="networkidle")
        page.wait_for_timeout(1800)
        check("stop and explicit continuation do not auto-run again after reload", fixture_health()["modelCalls"] == count_after_explicit_continue)

        if EXTENDED:
            page.goto(BASE + "/chat",wait_until="networkidle")
            page.get_by_test_id("multimodal-input").fill("FORMAL_STOP_ASK：停止尚未生成完整的问题，随后明确续跑。")
            page.get_by_test_id("send-button").click()
            expect(page.get_by_test_id("ask-user").or_(page.get_by_text("正在准备问题…",exact=True))).to_be_visible(timeout=30000)
            partial_id=chat_posts[-1]["id"];owned_chats.append(partial_id)
            page.get_by_test_id("stop-button").click()
            expect(page.get_by_text("提问已中断",exact=True)).to_be_visible(timeout=15000)
            resume=page.get_by_test_id("agent-paused").get_by_role("button",name="继续任务",exact=True)
            expect(resume).to_be_visible()
            check("stopping incomplete Ask removes fake waiting and leaves explicit continuation")
            calls_before=fixture_health()["modelCalls"]
            page.wait_for_timeout(800)
            check("stopped incomplete Ask does not autonomously continue",fixture_health()["modelCalls"]==calls_before)
            resume.click()
            expect(page.get_by_text("FORMAL_RESUMED_DONE",exact=False)).to_be_visible(timeout=30000)
            check("incomplete Ask can continue without invented answer or approval")
        bottoms = [REPORT["geometry"][state]["input"]["bottom"] for state in ["formal-ask-desktop", "formal-artifact-desktop", "formal-artifact-closed", "formal-agent-paused"]]
        check("composer stays at the same bottom during Ask, artifact toggle and pause", max(bottoms)-min(bottoms)<1)
        check("no browser page errors", not REPORT["pageErrors"])

    except Exception as error:
        REPORT["failure"] = str(error)
        page.screenshot(path=str(OUT / "formal-failure.png"), full_page=True)
        (OUT / "formal-failure-dom.txt").write_text(page.locator("body").inner_text())
        raise
    finally:
        REPORT["ownedChats"] = owned_chats
        REPORT["cleanup"] = []
        for owned_id in owned_chats:
            response = page.request.delete(BASE + "/api/chat?id=" + owned_id)
            REPORT["cleanup"].append({"id": owned_id, "status": response.status})
        (OUT / "report.json").write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
        print(json.dumps({"fixtureModelAndMcp": True, "checkCount": len(REPORT["checks"]), "failure": REPORT.get("failure"), "pageErrors": REPORT["pageErrors"], "cleanup": REPORT["cleanup"], "report": str(OUT / "report.json")}, ensure_ascii=False), flush=True)
        browser.close()
