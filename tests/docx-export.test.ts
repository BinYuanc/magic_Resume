/**
 * DOCX 导出结构测试（node:test + tsx，无需真实 Word）：
 * - 富文本 HTML → runs 的格式保真（bold/color/fontSize/link/list）
 * - OOXML XML 的关键结构（sectPr A4、numbering、hyperlink rels、字号半磅值）
 * - ZIP 包结构完整性（[Content_Types].xml / word/document.xml 等 6 个部件）
 * - 复杂内容冒烟：中英文混排、列表、链接、百分号、XML 转义
 */
import test from "node:test";
import assert from "node:assert/strict";
import { richTextToDocxParagraphs } from "../src/exporters/docx/richTextToDocx";
import { buildDocxBytes } from "../src/exporters/docx/docxBuilder";
import { mapFontToWord, isCjkFont } from "../src/exporters/docx/fontMap";
import { unzip, zipFiles } from "../src/lib/templateZip";

/**
 * 测试专用迷你 DOM：用 cheerio（依赖树里现成）的 parseHTML 建 W3C 形状的最小树，
 * 满足 richTextToDocx 用到的 nodeType / tagName / childNodes / getAttribute / textContent。
 * 只服务测试，生产代码在浏览器用原生 DOMParser。
 */
// cheerio 是 pnpm 传递依赖未提升到顶层，这里从 .pnpm 直达路径导入（仅测试用）。
// 该路径随 lockfile 版本变化，缺失时下方 HAS_DOM 会退化为 false 并跳过 DOM 用例。
// createRequire 直取 CJS 完整导出（ESM 命名导出会被 lexer 截断）
import "./docxDom";
const HAS_DOM = true;

test("fontMap: 浏览器字体映射到 Word 字体且永不失败", () => {
  assert.equal(mapFontToWord("Inter, system-ui, sans-serif"), "Arial");
  assert.equal(mapFontToWord("system-ui"), "Arial");
  assert.equal(mapFontToWord("思源黑体 CN"), "Microsoft YaHei");
  assert.equal(mapFontToWord("Microsoft YaHei"), "Microsoft YaHei");
  assert.equal(mapFontToWord(undefined), "Microsoft YaHei");
  assert.equal(mapFontToWord("SomeUnknownFont99"), "Arial"); // 未知字体也必须给兜底
  assert.equal(isCjkFont("Microsoft YaHei"), true);
  assert.equal(isCjkFont("Arial"), false);
});

test("DOCX 包结构: 必需部件齐全且 XML 转义正确", async () => {
  const bytes = await buildDocxBytes({
    paragraphs: [
      {
        runs: [
          { text: "BizAgent —— 企业业务数字员工智能平台", bold: true, fontSize: 15, color: "#1d4ed8" },
          { text: "准确率 98.5%，QPS > 2000，含 <script> & 'quotes' 之类的转义样本" },
        ],
      },
      {
        runs: [{ text: "项目文档", hyperlink: "https://example.com/bizagent" }],
      },
      {
        runs: [{ text: "列表项", bold: true }],
        numId: 1,
      },
    ],
    orderedListCount: 0,
    fontFamily: "Inter, system-ui, sans-serif",
    baseFontSize: 14,
    textColor: "#212529",
    pagePadding: 32,
  });

  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const files = await unzip(buffer);
  const names = files.map((file) => file.name).sort();
  assert.deepEqual(names, [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/_rels/document.xml.rels",
    "word/document.xml",
    "word/numbering.xml",
    "word/styles.xml",
  ]);

  const doc = await files.find((file) => file.name === "word/document.xml")!.text();
  // A4 页面 + 页边距（32px → 480 twips）
  assert.ok(doc.includes('w:pgSz w:w="11906" w:h="16838"'));
  assert.ok(doc.includes('w:top="480"'));
  // 字号半磅：15px → 22.5 → 四舍五入 23；14px → 21
  assert.ok(doc.includes('w:sz w:val="23"'));
  // 颜色去 # ：1d4ed8
  assert.ok(doc.includes('<w:color w:val="1d4ed8"/>'));
  // XML 转义：危险字符必须被实体化，绝不能把 <script> 原样写进 XML
  assert.ok(!doc.includes("<script>"));
  assert.ok(doc.includes("&lt;script&gt;"));
  assert.ok(doc.includes("&amp;"));
  // 空格保留
  assert.ok(doc.includes('xml:space="preserve"'));
  // bullet 编号挂载
  assert.ok(doc.includes('<w:numId w:val="1"/>'));

  const rels = await files.find((file) => file.name === "word/_rels/document.xml.rels")!.text();
  assert.ok(rels.includes('TargetMode="External"'));
  assert.ok(rels.includes("https://example.com/bizagent"));

  // hyperlink 引用的 relId 必须在 rels 里存在
  const relIdMatch = doc.match(/<w:hyperlink r:id="(rId\d+)"/);
  assert.ok(relIdMatch, "document 里应有 w:hyperlink");
  assert.ok(rels.includes(`Id="${relIdMatch[1]}"`));

  const numbering = await files.find((file) => file.name === "word/numbering.xml")!.text();
  assert.ok(numbering.includes('w:numFmt w:val="bullet"'));

  const styles = await files.find((file) => file.name === "word/styles.xml")!.text();
  assert.ok(styles.includes('w:eastAsia="zh-CN"'));
});

test("DOCX ordered list: 两个有序列表获得独立 numId（各自从 1 编号）", async () => {
  const bytes = await buildDocxBytes({
    paragraphs: [
      { runs: [{ text: "一" }], numId: 2 },
      { runs: [{ text: "二" }], numId: 3 },
    ],
    orderedListCount: 2,
    fontFamily: "Inter",
    baseFontSize: 14,
    textColor: "#111111",
    pagePadding: 24,
  });
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const files = await unzip(buffer);
  const numbering = await files.find((file) => file.name === "word/numbering.xml")!.text();
  assert.ok(numbering.includes('<w:num w:numId="2">'));
  assert.ok(numbering.includes('<w:num w:numId="3">'));
  assert.ok(numbering.includes('w:numFmt w:val="decimal"'));
});

test("富文本转换: bold/color/fontSize/link/列表（需 DOMParser）", { skip: !HAS_DOM }, async () => {
  const html = [
    "<p><strong>Agent 编排</strong>：基于 <em>LangGraph</em> 构建<u>多智能体</u>链路</p>",
    '<p><span style="color: #ff0000; font-size: 16px">红色大字</span>普通文字</p>',
    '<ul><li><p>RAG 检索</p></li><li><p>MCP 工具调用</p></li></ul>',
    '<ol><li>量化收益 30%</li><li>准确率 98.5%</li></ol>',
    '<p>参考 <a href="https://example.com/docs">项目文档</a> 与<br/>第二行</p>',
  ].join("");

  const result = richTextToDocxParagraphs(html, { fontSize: 14 });

  // 段落数：2 个普通段 + 2 个 bullet + 2 个 ordered + 1 个带链接段
  assert.equal(result.paragraphs.length, 7);
  assert.equal(result.orderedListCount, 1);

  // bold / italic / underline 保真（注意：inline 元素之间的文本节点各自是独立 run）
  const first = result.paragraphs[0]!;
  assert.equal(first.runs[0]?.bold, true);
  assert.equal(first.runs[0]?.text, "Agent 编排");
  assert.equal(first.runs[1]?.bold, undefined); // "：基于 "
  assert.equal(first.runs[2]?.italic, true);    // LangGraph
  assert.equal(first.runs[4]?.underline, true); // 多智能体
  assert.equal(first.runs[5]?.text, "链路");

  // 内联样式保真
  const second = result.paragraphs[1]!;
  assert.equal(second.runs[0]?.color, "#ff0000");
  assert.equal(second.runs[0]?.fontSize, 16);
  assert.equal(second.runs[1]?.color, undefined);

  // 列表挂载
  assert.equal(result.paragraphs[2]?.numId, 1);
  assert.equal(result.paragraphs[3]?.numId, 1);
  assert.equal(result.paragraphs[4]?.numId, 2);
  assert.equal(result.paragraphs[5]?.numId, 2);

  // 链接 + 换行：[0]"参考 " [1]链接 [2]" 与" [3]<br> [4]"第二行"
  const last = result.paragraphs[6]!;
  assert.equal(last.runs[1]?.hyperlink, "https://example.com/docs");
  assert.equal(last.runs[1]?.text, "项目文档");
  assert.equal(last.runs[3]?.lineBreak, true);
  assert.equal(last.runs[4]?.text, "第二行");
});

test("富文本转换: 空内容与纯文本安全通过", () => {
  assert.deepEqual(richTextToDocxParagraphs(undefined).paragraphs, []);
  assert.deepEqual(richTextToDocxParagraphs("").paragraphs, []);
  assert.deepEqual(richTextToDocxParagraphs("   ").paragraphs, []);
});

test("复杂内容冒烟: 中英文 + 特殊符号不炸包", async () => {
  const runs = [
    "BizAgent —— 企业业务数字员工智能平台",
    "LangGraph/RAG/MCP、QPS>2000、准确率 98.5%",
    "中文标点：，。；「」《》、英文 \"quotes\" & <tags>",
    "混合 emoji 🚀 与全角空格　测试",
  ];
  const bytes = await buildDocxBytes({
    paragraphs: runs.map((text) => ({ runs: [{ text }] })),
    orderedListCount: 0,
    fontFamily: "思源黑体 CN",
    baseFontSize: 14,
    textColor: "#000000",
    pagePadding: 32,
  });
  assert.ok(bytes.length > 1000);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const files = await unzip(buffer);
  const doc = await files.find((file) => file.name === "word/document.xml")!.text();
  assert.ok(doc.includes("BizAgent"));
  assert.ok(doc.includes("🚀"));
  // UTF-8 中文完整往返
  assert.ok(doc.includes("企业业务数字员工智能平台"));
});
