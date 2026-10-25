import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

function renderSidebar(open: boolean) {
  return execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {SidebarProvider,Sidebar,SidebarInset}=require('./app/_components/ui/sidebar.tsx');process.stdout.write(renderToStaticMarkup(React.createElement(SidebarProvider,{defaultOpen:${open}},React.createElement(Sidebar),React.createElement(SidebarInset,null,React.createElement('div',{style:{width:1280}},'Wide workspace content')))));`,
    ],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } }
  );
}

for (const open of [true, false]) {
  test(`sidebar inset can shrink below workspace content with sidebar ${open ? "expanded" : "collapsed"}`, () => {
    const html = renderSidebar(open);
    const inset = html.match(/<main\b[^>]*>/)?.[0];
    assert.ok(inset);
    // Flex items default to min-width:auto. A wide workspace must not force
    // the inset to its content width plus the desktop sidebar's reserved gap.
    assert.match(inset, /\bmin-w-0\b/);
    assert.match(inset, /\bflex-1\b/);
    assert.match(inset, /\bw-full\b/);
    assert.match(
      html,
      new RegExp(`data-state="${open ? "expanded" : "collapsed"}"`)
    );
    assert.match(html, /group-data-\[collapsible=offcanvas\]:w-0/);
    // Mobile retains a full-width inset and hides the desktop sidebar gap.
    assert.match(html, /group peer hidden text-sidebar-foreground md:block/);
    assert.doesNotMatch(inset, /\bmin-w-\[|\bw-screen\b/);
  });
}

test("composer file input is hidden from accessibility navigation, not just visually offscreen", () => {
  const composer = readFileSync(
    "app/_components/chat/multimodal-input.tsx",
    "utf8"
  );
  const fileInput = composer.match(/<input\b[^>]*type="file"[^>]*\/>/)?.[0];
  assert.ok(fileInput);
  assert.match(fileInput, /\bhidden\b/);
  assert.match(fileInput, /ref=\{fileInputRef\}/);
  assert.match(fileInput, /onChange=\{handleFileChange\}/);
  assert.match(fileInput, /disabled=\{Boolean\(editingMessage\)\}/);
  assert.match(fileInput, /accept=\{ATTACHMENT_ACCEPT\}/);
  assert.doesNotMatch(fileInput, /pointer-events-none|opacity-0/);
});

test("visible attachment menu continues to activate the composer file input", () => {
  const menu = readFileSync("app/_components/chat/composer-menu.tsx", "utf8");
  assert.match(menu, /aria-label="添加附件和工具"/);
  assert.match(menu, /\(\) => fileInputRef\.current\?\.click\(\)/);
  assert.match(
    menu,
    /<DropdownMenuItem disabled=\{busy \|\| !canUpload\} onSelect=\{addImage\}>/
  );
  const composer = readFileSync(
    "app/_components/chat/multimodal-input.tsx",
    "utf8"
  );
  assert.match(composer, /<ComposerMenu[\s\S]*?fileInputRef=\{fileInputRef\}/);
});
