import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer,
} from "prosemirror-markdown";
import { type Node, type NodeSpec, Schema } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";

function tableCell(tag: "th" | "td"): NodeSpec {
  return {
    attrs: { align: { default: null } },
    content: "inline*",
    isolating: true,
    parseDOM: [
      {
        getAttrs: (dom) => ({
          align: /^(left|center|right)$/.test(dom.style.textAlign)
            ? dom.style.textAlign
            : null,
        }),
        tag,
      },
    ],
    toDOM: (node) => [
      tag,
      node.attrs.align ? { style: `text-align: ${node.attrs.align}` } : {},
      0,
    ],
  };
}

const nodes = addListNodes(schema.spec.nodes, "paragraph block*", "block")
  .update("image", {
    ...schema.spec.nodes.get("image"),
    toDOM: (node) => ["img", { ...node.attrs, referrerpolicy: "no-referrer" }],
  })
  .update("code_block", {
    ...schema.spec.nodes.get("code_block"),
    attrs: { params: { default: "" } },
  })
  .append({
    table: {
      content: "table_row+",
      group: "block",
      isolating: true,
      parseDOM: [{ tag: "table" }],
      toDOM: () => ["table", ["tbody", 0]],
    },
    table_cell: tableCell("td"),
    table_header: tableCell("th"),
    table_row: {
      content: "(table_header | table_cell)+",
      parseDOM: [{ tag: "tr" }],
      toDOM: () => ["tr", 0],
    },
  });

export const documentSchema = new Schema({ marks: schema.spec.marks, nodes });

// Use the existing CommonMark tokenizer, with its HTML handling disabled.
const tokenizer = defaultMarkdownParser.tokenizer.enable("table");
// A line break is the only HTML-like token accepted; attributes and other HTML
// remain literal text. Table cells must not serialize breaks as new rows.
tokenizer.inline.ruler.before(
  "html_inline",
  "report_break",
  (state, silent) => {
    const match = /^<br\s*\/?>/i.exec(state.src.slice(state.pos));
    if (!match) {
      return false;
    }
    if (!silent) {
      state.push("hardbreak", "br", 0);
    }
    state.pos += match[0].length;
    return true;
  }
);

export const parseMarkdown = (content: string, targetSchema = documentSchema) =>
  new MarkdownParser(targetSchema, tokenizer, {
    ...defaultMarkdownParser.tokens,
    table: { block: "table" },
    tbody: { ignore: true },
    td: {
      block: "table_cell",
      getAttrs: (token) => ({
        align: token
          .attrGet("style")
          ?.match(/text-align:(left|center|right)/)?.[1],
      }),
    },
    th: {
      block: "table_header",
      getAttrs: (token) => ({
        align: token
          .attrGet("style")
          ?.match(/text-align:(left|center|right)/)?.[1],
      }),
    },
    thead: { ignore: true },
    tr: { block: "table_row" },
  }).parse(content);

const cellSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    hard_break: (state) => state.write("<br>"),
  },
  defaultMarkdownSerializer.marks,
  { escapeExtraCharacters: /</g }
);

const serializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    table(state, table) {
      for (let index = 0; index < table.childCount; index += 1) {
        const row = table.child(index);
        const cells: string[] = [];
        for (let column = 0; column < row.childCount; column += 1) {
          const cell = row.child(column);
          const paragraph = documentSchema.nodes.paragraph.create(
            null,
            cell.content
          );
          const content = documentSchema.topNodeType.create(null, paragraph);
          cells.push(cellSerializer.serialize(content).replace(/\|/g, "\\|"));
        }
        state.write(`| ${cells.join(" | ")} |\n`);
        if (index === 0) {
          const dividers: string[] = [];
          for (let column = 0; column < row.childCount; column += 1) {
            const { align } = row.child(column).attrs;
            dividers.push(
              `${align === "left" || align === "center" ? ":" : ""}---${align === "right" || align === "center" ? ":" : ""}`
            );
          }
          state.write(`| ${dividers.join(" | ")} |\n`);
        }
      }
      state.closeBlock(table);
    },
  },
  defaultMarkdownSerializer.marks,
  { escapeExtraCharacters: /</g }
);

export const buildDocumentFromContent = (content: string) =>
  parseMarkdown(content);
export const buildContentFromDocument = (document: Node) =>
  serializer.serialize(document);
