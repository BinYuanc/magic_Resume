/**
 * DOCX（OOXML）构建器 —— 零依赖，纯字符串拼 XML + 复用自研 ZIP 打包。
 *
 * 产出真正可编辑的 Word（方案第十八节）：Paragraph / TextRun / Hyperlink /
 * Heading / Bullet / Ordered List，绝不走「截图塞进 docx」的路线。
 *
 * OOXML 最小包结构：
 *   [Content_Types].xml
 *   _rels/.rels
 *   word/document.xml      正文
 *   word/styles.xml        默认字体字号 + 标题样式
 *   word/numbering.xml     bullet / ordered 编号定义
 *   word/_rels/document.xml.rels   样式/编号/超链接关系
 */
import { zipFiles } from "@/lib/templateZip";
import { isCjkFont, mapFontToWord } from "./fontMap";
import type { DocxImage, DocxParagraph, DocxRun } from "./richTextToDocx";
import { colorToHex, isTransparentColor } from "@/lib/color";
import { SECTION_TITLE_BORDER_EIGHTHS_OF_POINT } from "@/lib/sectionTitleBorder";

const XML_HEAD =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** px → twips（96dpi：1px = 15 twips） */
const pxToTwips = (px: number) => Math.round(px * 15);
/** px → half-points（w:sz 单位是半磅：1px = 0.75pt = 1.5 half-point） */
const pxToHalfPoints = (px: number) => Math.round(px * 1.5);
/** #rrggbb → rrggbb（w:color 不带 #） */
const colorHex = (color: string) => (colorToHex(color) ?? "000000").toLowerCase();

function escapeXml(text: string): string {
  return text
    // XML 1.0 不允许的字符：C0 控制符（保留 \t \n \r）、C1 控制符、U+FFFE/U+FFFF
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffe\uffff]/g, "")
    // 落单的代理码位（粘贴残片）会让 document.xml 直接打不开：保留成对代理，丢弃单个
    .replace(/[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g, (match) => (match.length === 2 ? match : ""))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface DocxBuildOptions {
  paragraphs: DocxParagraph[];
  orderedListCount: number;
  /** 默认字体（CSS 名，内部会映射到 Word 字体） */
  fontFamily: string;
  /** 正文字号 px */
  baseFontSize: number;
  /** 正文颜色 */
  textColor: string;
  /** 页边距 px（与网页 resume 相同的 pagePadding） */
  pagePadding: number;
  lineHeight?: number;
}

/** run 属性 XML */
function runProperties(run: DocxRun, options: DocxBuildOptions): string {
  const parts: string[] = [];
  const wordFont = mapFontToWord(run.fontFamily ?? options.fontFamily);
  parts.push(
    `<w:rFonts w:ascii="${escapeXml(wordFont)}" w:hAnsi="${escapeXml(wordFont)}"${
      isCjkFont(wordFont) ? ` w:eastAsia="${escapeXml(wordFont)}"` : ""
    } w:cs="${escapeXml(wordFont)}"/>`
  );
  if (run.bold !== undefined) parts.push(`<w:b w:val="${run.bold ? 1 : 0}"/><w:bCs w:val="${run.bold ? 1 : 0}"/>`);
  if (run.italic !== undefined) parts.push(`<w:i w:val="${run.italic ? 1 : 0}"/><w:iCs w:val="${run.italic ? 1 : 0}"/>`);
  if (run.color) parts.push(`<w:color w:val="${colorHex(run.color)}"/>`);
  const size = run.fontSize ?? options.baseFontSize;
  parts.push(`<w:sz w:val="${pxToHalfPoints(size)}"/><w:szCs w:val="${pxToHalfPoints(size)}"/>`);
  if (run.underline !== undefined || run.hyperlink) parts.push(`<w:u w:val="${run.underline || run.hyperlink ? "single" : "none"}"/>`);
  return `<w:rPr>${parts.join("")}</w:rPr>`;
}

function textRunXml(run: DocxRun, options: DocxBuildOptions): string {
  if (run.hyperlink) return ""; // 超链接 run 由 hyperlinkXml 单独处理
  if (run.lineBreak) return "<w:r><w:br/></w:r>";
  return `<w:r>${runProperties(run, options)}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
}

/** 超链接：w:hyperlink + r:id 引用外部关系 */
function hyperlinkRunXml(run: DocxRun, options: DocxBuildOptions, relId: string): string {
  return `<w:hyperlink r:id="${relId}" w:history="1"><w:r>${runProperties(
    run,
    options
  )}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r></w:hyperlink>`;
}

function paragraphXml(
  paragraph: DocxParagraph,
  options: DocxBuildOptions,
  relIds: Map<string, string>,
  images: Map<DocxImage, number>
): string {
  const parts: string[] = [];

  // 段落属性
  const pPrParts: string[] = [];
  if (paragraph.keepNext) pPrParts.push("<w:keepNext/>");
  if (paragraph.keepLines) pPrParts.push("<w:keepLines/>");
  if (paragraph.numId !== undefined) {
    pPrParts.push(
      `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${paragraph.numId}"/></w:numPr>`
    );
  }
  const spacing: string[] = [];
  if (paragraph.spacingBefore !== undefined) {
    spacing.push(`w:before="${pxToTwips(paragraph.spacingBefore)}"`);
  }
  if (paragraph.spacingAfter !== undefined) {
    spacing.push(`w:after="${pxToTwips(paragraph.spacingAfter)}"`);
  }
  if (paragraph.lineHeight !== undefined) spacing.push(`w:line="${Math.round(paragraph.lineHeight * 240)}" w:lineRule="auto"`);
  if (paragraph.border) pPrParts.push(`<w:pBdr><w:bottom w:val="single" w:sz="${SECTION_TITLE_BORDER_EIGHTHS_OF_POINT}" w:color="${colorHex(paragraph.border)}"/></w:pBdr>`);
  // 背景是可选的装饰：颜色非法或完全透明时宁可不填充，也不要退化成黑色色块
  const backgroundHex = paragraph.background && !isTransparentColor(paragraph.background)
    ? colorToHex(paragraph.background)
    : undefined;
  if (backgroundHex) pPrParts.push(`<w:shd w:val="clear" w:fill="${backgroundHex.toLowerCase()}"/>`);
  if (spacing.length > 0) pPrParts.push(`<w:spacing ${spacing.join(" ")}/>`);
  if (paragraph.indentCharacters !== undefined && Number.isFinite(paragraph.indentCharacters) && paragraph.indentCharacters > 0) {
    const left = pxToTwips(Math.min(64, paragraph.indentCharacters) * options.baseFontSize) + (paragraph.numId !== undefined ? 360 : 0);
    pPrParts.push(`<w:ind w:left="${left}"${paragraph.numId !== undefined ? ' w:hanging="180"' : ""}/>`);
  }
  // 对齐值来自模板/导入的简历数据，用白名单而不是直接插值，避免拼出非法 XML
  if (paragraph.align === "center" || paragraph.align === "right") {
    pPrParts.push(`<w:jc w:val="${paragraph.align}"/>`);
  }
  parts.push(`<w:pPr>${pPrParts.join("")}</w:pPr>`);

  for (const run of paragraph.runs) {
    if (run.image) {
      const id = images.get(run.image)!;
      const cx = Math.round(run.image.width * 9525), cy = Math.round(run.image.height * 9525);
      parts.push(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Image ${id}" descr="${escapeXml(run.image.description ?? "")}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Image ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`);
    } else if (run.hyperlink) {
      const relId = relIds.get(run.hyperlink);
      if (relId) parts.push(hyperlinkRunXml(run, options, relId));
      else parts.push(textRunXml({ ...run, hyperlink: undefined, underline: true }, options));
    } else {
      parts.push(textRunXml(run, options));
    }
  }
  return `<w:p>${parts.join("")}</w:p>`;
}

/** 固定栏宽、无边框、零 cell padding。每个单元格以合法段落结束。 */
function blockXml(p: DocxParagraph, options: DocxBuildOptions, relIds: Map<string, string>, images: Map<DocxImage, number>): string {
  if (!p.table) return paragraphXml(p, options, relIds, images);
  const widths = p.table.widths.map(pxToTwips);
  const grid = widths.map(width => `<w:gridCol w:w="${width}"/>`).join("");
  const rows = p.table.rows.map(row => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row.map((cell, i) => `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${cell.paragraphs.map(block => blockXml(block, options, relIds, images)).join("")}${!cell.paragraphs.length || cell.paragraphs.at(-1)?.table ? "<w:p/>" : ""}</w:tc>`).join("")}</w:tr>`).join("");
  const before = p.spacingBefore ? paragraphXml({ runs: [], spacingBefore: p.spacingBefore, lineHeight: 0.01, keepNext: true }, options, relIds, images) : "";
  const after = p.spacingAfter ? paragraphXml({ runs: [], spacingAfter: p.spacingAfter, lineHeight: 0.01 }, options, relIds, images) : "";
  return before + `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a,b)=>a+b,0)}" w:type="dxa"/><w:tblBorders>${["top","left","bottom","right","insideH","insideV"].map(side=>`<w:${side} w:val="nil"/>`).join("")}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar>${["top","left","bottom","right"].map(side=>`<w:${side} w:w="0" w:type="dxa"/>`).join("")}</w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>` + after;
}
function flattenParagraphs(paragraphs: DocxParagraph[]): DocxParagraph[] {
  return paragraphs.flatMap(p => [p, ...(p.table ? p.table.rows.flatMap(row => row.flatMap(cell => flattenParagraphs(cell.paragraphs))) : [])]);
}

/** numbering.xml：numId=1 固定 bullet；之后每个 ordered 列表独立 numId（各自从 1 开始） */
function numberingXml(orderedListCount: number): string {
  const abstracts: string[] = [];
  const nums: string[] = [];

  abstracts.push(`    <w:abstractNum w:abstractNumId="0">
      <w:multiLevelType w:val="singleLevel"/>
      <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr></w:lvl>
    </w:abstractNum>`);
  nums.push(`    <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`);

  for (let index = 0; index < orderedListCount; index++) {
    const abstractId = 1 + index;
    abstracts.push(`    <w:abstractNum w:abstractNumId="${abstractId}">
      <w:multiLevelType w:val="singleLevel"/>
      <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr></w:lvl>
    </w:abstractNum>`);
    nums.push(
      `    <w:num w:numId="${2 + index}"><w:abstractNumId w:val="${abstractId}"/></w:num>`
    );
  }

  return `${XML_HEAD}
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
${abstracts.join("\n")}
${nums.join("\n")}
</w:numbering>`;
}

function stylesXml(options: DocxBuildOptions): string {
  const wordFont = escapeXml(mapFontToWord(options.fontFamily));
  const eastAsia = isCjkFont(wordFont) ? ` w:eastAsia="${wordFont}"` : "";
  const size = pxToHalfPoints(options.baseFontSize);
  const color = colorHex(options.textColor);
  return `${XML_HEAD}
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="${wordFont}" w:hAnsi="${wordFont}"${eastAsia} w:cs="${wordFont}"/>
      <w:color w:val="${color}"/>
      <w:sz w:val="${size}"/><w:szCs w:val="${size}"/>
      <w:lang w:val="en-US" w:eastAsia="zh-CN"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:line="${Math.round((options.lineHeight ?? 1.5) * 240)}" w:lineRule="auto" w:after="0"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
</w:styles>`;
}

function documentXml(
  paragraphs: DocxParagraph[],
  options: DocxBuildOptions,
  relIds: Map<string, string>,
  images: Map<DocxImage, number>
): string {
  const body = paragraphs.map((p) => blockXml(p, options, relIds, images)).join("");
  // A4：210mm×297mm = 11906×16838 twips；页边距沿用网页的 pagePadding
  const margin = pxToTwips(options.pagePadding);
  return `${XML_HEAD}
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

/** 组装完整 .docx（ZIP 字节），浏览器端直接可下载 */
export async function buildDocxBytes(options: DocxBuildOptions): Promise<Uint8Array> {
  const images = new Map<DocxImage, number>();
  for (const paragraph of flattenParagraphs(options.paragraphs)) for (const run of paragraph.runs) {
    if (run.image && !images.has(run.image)) images.set(run.image, images.size + 1);
  }
  // 1. 收集超链接 → 分配关系 id（从 rId100 起避免与 rIdStyles/rIdNumbering 撞车）
  const relIds = new Map<string, string>();
  let relIndex = 100;
  for (const paragraph of flattenParagraphs(options.paragraphs)) {
    for (const run of paragraph.runs) {
      if (run.hyperlink && !relIds.has(run.hyperlink)) {
        relIds.set(run.hyperlink, `rId${relIndex}`);
        relIndex += 1;
      }
    }
  }

  // 2. 关系文件：样式 / 编号 / 超链接（编号仅在列表存在时声明）
  const hasNumbering = options.orderedListCount > 0 || flattenParagraphs(options.paragraphs).some((p) => p.numId !== undefined);
  const relEntries: string[] = [
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ];
  const imageEntries = Array.from(images.entries());
  for (const [img, id] of imageEntries) {
    relEntries.push(`<Relationship Id="rIdImage${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${id}.${img.contentType === "image/png" ? "png" : "jpg"}"/>`);
  }
  if (hasNumbering) {
    relEntries.push(
      `<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`
    );
  }
  // Array.from 兼容无 downlevelIteration 的编译目标（tsconfig 未设 target）
  const hyperlinkEntries = Array.from(relIds.entries());
  for (const [url, relId] of hyperlinkEntries) {
    relEntries.push(
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(
        url
      )}" TargetMode="External"/>`
    );
  }

  const contentTypes = `${XML_HEAD}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
${
  hasNumbering
    ? `  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>\n`
    : ""
}</Types>`;

  const rootRels = `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdDoc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relEntries.map((entry) => `  ${entry}`).join("\n")}
</Relationships>`;

  const docXml = documentXml(options.paragraphs, options, relIds, images);

  const encoder = new TextEncoder();
  return zipFiles([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "word/document.xml", data: encoder.encode(docXml) },
    { name: "word/styles.xml", data: encoder.encode(stylesXml(options)) },
    ...(hasNumbering
      ? [{ name: "word/numbering.xml", data: encoder.encode(numberingXml(options.orderedListCount)) }]
      : []),
    { name: "word/_rels/document.xml.rels", data: encoder.encode(docRels) },
    ...imageEntries.map(([img, id]) => ({ name: `word/media/image${id}.${img.contentType === "image/png" ? "png" : "jpg"}`, data: img.bytes })),
  ]);
}
