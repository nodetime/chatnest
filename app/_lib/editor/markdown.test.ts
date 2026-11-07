import assert from "node:assert/strict";
import { test } from "node:test";
import { Fragment, Schema, Slice } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { handleTableEnter, handleTablePaste } from "./config";
import {
  buildContentFromDocument,
  buildDocumentFromContent,
  documentSchema,
  parseMarkdown,
} from "./markdown";

test("report links, emphasis, images and aligned tables survive editing round trips", () => {
  const source = [
    "# 商品比较",
    "",
    "**总体结论**：保留[商品来源](https://detail.1688.com/offer/123.html)。",
    "",
    "| 候选 | 结论 |",
    "| :--- | ---: |",
    "| **甲** | 较相似 |",
    "| [乙](https://example.com/b) | A\\|B 与 `C\\|D` |",
    "",
    '![商品主图](https://cbu01.alicdn.com/example.jpg "主图")',
    "",
    "- 结构比例",
    "- *材质未知*",
    "",
    "```js",
    "const value = 1;",
    "```",
  ].join("\n");
  const document = buildDocumentFromContent(source);
  document.check();
  assert.equal(document.child(1).child(0).marks[0].type.name, "strong");
  const table = document.child(2);
  assert.equal(table.type.name, "table");
  assert.equal(table.childCount, 3);
  assert.equal(table.child(0).child(1).attrs.align, "right");
  assert.equal(table.child(2).child(1).textContent, "A|B 与 C|D");
  const saved = buildContentFromDocument(document);
  assert.match(saved, /\[商品来源\]\(https:\/\/detail\.1688\.com/);
  assert.match(saved, /!\[商品主图\]/);
  assert.match(saved, /```js/);
  assert.ok(document.eq(buildDocumentFromContent(saved)));
});

test("Markdown remains inert and remote product images omit the page referrer", () => {
  const document = buildDocumentFromContent(
    "<script>alert(1)</script>\n\n[link](javascript:alert(1))\n\n![候选](https://example.com/a.jpg)"
  );
  let linkCount = 0;
  document.descendants((node) => {
    linkCount += node.marks.filter((mark) => mark.type.name === "link").length;
  });
  assert.equal(linkCount, 0);
  assert.ok(document.textContent.includes("<script>"));
  const image = document.lastChild?.firstChild;
  assert.ok(image);
  const dom = documentSchema.nodes.image.spec.toDOM?.(image);
  assert.ok(Array.isArray(dom));
  assert.equal(dom[0], "img");
  assert.equal(
    (dom[1] as Record<string, string>).referrerpolicy,
    "no-referrer"
  );
});

test("a line break entered inside a table cell survives save and reopen without splitting rows", () => {
  const document = buildDocumentFromContent(
    "| 候选 | 判断 |\n| --- | --- |\n| 前后 | 相似 |"
  );
  const row = document.firstChild?.child(1);
  assert.ok(row);
  const header = document.firstChild?.firstChild;
  assert.ok(header);
  const cell = documentSchema.nodes.table_cell.create(null, [
    documentSchema.text("前"),
    documentSchema.nodes.hard_break.create(),
    documentSchema.text("后"),
  ]);
  const editedRow = documentSchema.nodes.table_row.create(null, [
    cell,
    row.child(1),
  ]);
  const edited = documentSchema.topNodeType.create(
    null,
    documentSchema.nodes.table.create(null, [header, editedRow])
  );
  edited.check();
  const saved = buildContentFromDocument(edited);
  assert.match(saved, /前<br>后/);
  assert.ok(edited.eq(buildDocumentFromContent(saved)));
  const inert = buildDocumentFromContent('<br onload="alert(1)">');
  assert.equal(inert.firstChild?.firstChild?.type.name, "text");
});

test("literal break tags remain text in paragraphs and table cells after edits", () => {
  const paragraph = documentSchema.nodes.paragraph.create(
    null,
    documentSchema.text("literal <br> tag")
  );
  const cell = documentSchema.nodes.table_cell.create(null, paragraph.content);
  const header = documentSchema.nodes.table_header.create(
    null,
    documentSchema.text("标题")
  );
  const table = documentSchema.nodes.table.create(null, [
    documentSchema.nodes.table_row.create(null, header),
    documentSchema.nodes.table_row.create(null, cell),
  ]);
  const document = documentSchema.topNodeType.create(null, [paragraph, table]);
  assert.ok(
    document.eq(buildDocumentFromContent(buildContentFromDocument(document)))
  );
});

test("pasting paragraphs into a cell preserves marks, line breaks and neighboring cells", () => {
  for (const open of [0, 1]) {
    const document = buildDocumentFromContent(
      "| 候选 | 判断 |\n| --- | --- |\n| 前后 | 邻列 |"
    );
    let position = 0;
    document.descendants((node, offset) => {
      if (node.isText && node.text === "前后") {
        position = offset + 1;
      }
    });
    let state = EditorState.create({
      doc: document,
      selection: TextSelection.create(document, position),
    });
    const pasted = buildDocumentFromContent(
      "**段一**\n\n[段二](https://example.com)"
    );
    const handled = handleTablePaste(
      {
        dispatch: (transaction) => {
          state = state.apply(transaction);
        },
        state,
      },
      {} as ClipboardEvent,
      new Slice(Fragment.from(pasted.content), open, open)
    );
    assert.equal(handled, true);
    assert.equal(state.doc.firstChild?.child(1).childCount, 2);
    assert.equal(state.doc.firstChild?.child(1).child(1).textContent, "邻列");
    assert.equal(
      state.doc.firstChild?.child(1).child(0).child(1).marks[0].type.name,
      "strong"
    );
    assert.ok(
      state.doc.eq(
        buildDocumentFromContent(buildContentFromDocument(state.doc))
      )
    );
  }
});

test("Enter inside a cell keeps the row's columns, and ordinary paragraphs keep default editing", () => {
  const document = buildDocumentFromContent(
    "| 候选 | 判断 |\n| --- | --- |\n| 前后 | 相似 |\n\n正文"
  );
  let cellPosition = 0;
  document.descendants((node, position) => {
    if (node.type.name === "text" && node.text === "前后") {
      cellPosition = position + 1;
    }
  });
  let state = EditorState.create({
    doc: document,
    selection: TextSelection.create(document, cellPosition),
  });
  const handled = handleTableEnter(
    {
      dispatch: (transaction) => {
        state = state.apply(transaction);
      },
      state,
    },
    { isComposing: false, key: "Enter" }
  );
  assert.equal(handled, true);
  assert.equal(state.doc.firstChild?.child(1).childCount, 2);
  assert.equal(
    state.doc.firstChild?.child(1).child(0).child(1).type.name,
    "hard_break"
  );
  assert.ok(
    state.doc.eq(buildDocumentFromContent(buildContentFromDocument(state.doc)))
  );
  assert.equal(
    handleTableEnter(
      { dispatch: () => assert.fail(), state },
      { isComposing: true, key: "Enter" }
    ),
    false
  );
  const paragraphState = EditorState.create({
    doc: buildDocumentFromContent("正文"),
  });
  assert.equal(
    handleTableEnter(
      { dispatch: () => assert.fail(), state: paragraphState },
      { isComposing: false, key: "Enter" }
    ),
    false
  );
});

test("version comparison parses the same report structure with its extended marks", () => {
  const schema = new Schema({
    marks: documentSchema.spec.marks.append({ diffMark: {} }),
    nodes: documentSchema.spec.nodes,
  });
  const document = parseMarkdown(
    "| 候选 | 判断 |\n| --- | --- |\n| [甲](https://example.com) | **相似** |",
    schema
  );
  document.check();
  assert.equal(document.type.schema, schema);
  assert.equal(document.firstChild?.type.name, "table");
  assert.equal(
    document.firstChild?.child(1).child(0).firstChild?.marks[0].type.name,
    "link"
  );
});
