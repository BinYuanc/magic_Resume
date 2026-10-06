import test from "node:test";
import assert from "node:assert/strict";
import "./docxDom";
import { richTextToDocxParagraphs } from "../src/exporters/docx/richTextToDocx";
import { buildDocxBytes } from "../src/exporters/docx/docxBuilder";
import { unzip } from "../src/lib/templateZip";

test("缩进：普通段落与列表条目保留缩进及原有编号", async () => {
  const rich = richTextToDocxParagraphs('<p data-indent="2" style="margin-left:2em">正文</p><ul><li data-indent="3"><p>列表</p></li></ul>', { fontSize: 16 });
  assert.equal(rich.paragraphs[0].indentCharacters, 2);
  assert.equal(rich.paragraphs[1].indentCharacters, 3);
  assert.equal(rich.paragraphs[1].numId, 1);
  const bytes = await buildDocxBytes({ paragraphs: rich.paragraphs, orderedListCount: 0, baseFontSize: 16, fontFamily: "Arial", textColor: "#000000", pagePadding: 32 });
  const files = await unzip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const xml = await files.find((file) => file.name === "word/document.xml")!.text();
  assert.match(xml, /<w:ind w:left="480"\/>/);
  assert.match(xml, /<w:ind w:left="1080" w:hanging="180"\/>/);
});

test("缩进：非法值归零，超大值限制为8，旧内容不变", () => {
  const rich = richTextToDocxParagraphs('<p data-indent="999">大</p><p data-indent="-1">负</p><p data-indent="NaN">错</p><p>旧</p>');
  assert.deepEqual(rich.paragraphs.map((paragraph) => paragraph.indentCharacters), [8, 0, 0, 0]);
});
