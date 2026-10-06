import test from "node:test";
import assert from "node:assert/strict";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { bodyHeadingInsertion } from "../src/components/shared/rich-editor/bodyHeading";
import "./docxDom";
import { richTextToDocxParagraphs } from "../src/exporters/docx/richTextToDocx";

const schema = new Schema({ nodes: {
  doc: { content: "block+" }, paragraph: { group: "block", content: "text*" },
  heading: { group: "block", content: "text*", attrs: { level: { default: 3 } } },
  text: { group: "inline" },
} });
const state = (text: string) => EditorState.create({ doc: schema.node("doc", null, [schema.node("paragraph", null, text ? schema.text(text) : undefined)]) });

test("自定义标题保留正文和选中文字，将 HTML 特殊字符视作纯文字", () => {
  let editorState = state("原有正文");
  editorState = editorState.apply(editorState.tr.setSelection(TextSelection.create(editorState.doc, 1, 3)));
  const insertion = bodyHeadingInsertion(editorState, " 自定义 <业务> & 背景 ")!;
  const nodes = insertion.content.map(node => schema.nodeFromJSON(node));
  const tr = editorState.tr.replaceWith(insertion.range.from, insertion.range.to, nodes);
  tr.setSelection(TextSelection.create(tr.doc, insertion.cursor));
  assert.equal(tr.doc.child(0).textContent, "原有正文");
  assert.equal(tr.doc.child(1).type.name, "heading");
  assert.equal(tr.doc.child(1).textContent, "自定义 <业务> & 背景");
  assert.equal(tr.selection.$from.parent.type.name, "paragraph");
});

test("空段落变为标题并提供正文输入位置，空标题不插入", () => {
  const editorState = state("");
  const insertion = bodyHeadingInsertion(editorState, "其他标题")!;
  const tr = editorState.tr.replaceWith(insertion.range.from, insertion.range.to, insertion.content.map(node => schema.nodeFromJSON(node)));
  assert.equal(tr.doc.childCount, 2);
  assert.equal(tr.doc.child(0).textContent, "其他标题");
  assert.equal(bodyHeadingInsertion(editorState, "  "), null);
});

test("Word 导出保留正文小标题的加粗、字号和段前留白", () => {
  const rich = richTextToDocxParagraphs("<h3>自定义标题</h3><p>正文</p>", { fontSize: 17, paragraphSpacing: 10 });
  assert.equal(rich.paragraphs[0].runs[0].bold, true);
  assert.equal(rich.paragraphs[0].runs[0].fontSize, 18);
  assert.ok(rich.paragraphs[0].spacingBefore! > 0);
  assert.equal(rich.paragraphs[1].runs[0].bold, undefined);
  assert.equal(rich.paragraphs[1].runs[0].fontSize, 17);
});

test("Word：「标题与正文同行」合并为同一段，换行时仍是两段", () => {
  const inline = richTextToDocxParagraphs('<h3 data-body-inline="1">项目定位:</h3><p>面向中小型教培机构。</p>', { fontSize: 16 });
  assert.equal(inline.paragraphs.length, 1);
  assert.equal(inline.paragraphs[0].runs.map(run => run.text).join(""), "项目定位:面向中小型教培机构。");
  assert.equal(inline.paragraphs[0].runs[0].bold, true); // 标题仍加粗

  const stacked = richTextToDocxParagraphs('<h3>项目定位:</h3><p>面向中小型教培机构。</p>', { fontSize: 16 });
  assert.equal(stacked.paragraphs.length, 2);

  // 同行标题后面没有正文时不能丢标题
  const lonely = richTextToDocxParagraphs('<h3 data-body-inline="1">孤立标题</h3>', { fontSize: 16 });
  assert.equal(lonely.paragraphs.length, 1);
  assert.equal(lonely.paragraphs[0].runs[0].text, "孤立标题");
});
