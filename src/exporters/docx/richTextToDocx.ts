/**
 * Tiptap 富文本 HTML → DOCX 中间结构（方案第二十一节）。
 *
 * 至少支持：paragraph / bold / italic / underline / fontSize / color /
 * bulletList / orderedList / link / lineBreak。
 * 不是 strip HTML —— `<strong>Agent 编排</strong>` 导出 Word 后必须仍然加粗。
 *
 * 中间结构（与 OOXML 解耦，方便单测）：
 *   DocxRun       一段同格式文字（或一个超链接）
 *   DocxParagraph 一个段落（可挂在编号列表上）
 */

import { colorToHex } from "@/lib/color";
// 与 Web 端 normalizeRichTextContent 用同一个判定：没有 HTML 标签就按纯文本处理
import { HTML_TAG_REGEX } from "@/lib/richText";
export interface DocxImage {
  bytes: Uint8Array;
  contentType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  description?: string;
}
export interface DocxRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** #rrggbb */
  color?: string;
  /** px */
  fontSize?: number;
  fontFamily?: string;
  /** 有值时该 run 渲染为超链接 */
  hyperlink?: string;
  /** 段内换行（<br/>） */
  lineBreak?: boolean;
  image?: DocxImage;
}

export interface DocxParagraph {
  runs: DocxRun[];
  /** 挂到哪个编号实例（bullet / ordered 共用 numbering 机制） */
  numId?: number;
  /** 段前 / 段后间距（px） */
  spacingBefore?: number;
  spacingAfter?: number;
  align?: "left" | "center" | "right";
  border?: string;
  background?: string;
  lineHeight?: number;
}

export interface RichTextDocx {
  paragraphs: DocxParagraph[];
  /** 需要的编号定义：bullet 固定 numId=1；ordered 每个列表独立 numId */
  orderedListCount: number;
}

/** 解析 style="color: #xxx; font-size: 14px" 这类内联样式 */
function parseInlineStyle(element: Element): { color?: string; fontSize?: number } {
  const style = element.getAttribute("style") ?? "";
  const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  const sizeMatch = style.match(/(?:^|;)\s*font-size\s*:\s*([\d.]+)px/i);
  return {
    color: colorMatch ? normalizeColor(colorMatch[1]) : undefined,
    fontSize: sizeMatch ? Math.round(parseFloat(sizeMatch[1])) : undefined,
  };
}

function normalizeColor(value: string): string | undefined {
  const color = colorToHex(value);
  return color ? `#${color.toLowerCase()}` : undefined;
}

interface WalkContext {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
}

/** 把一个 DOM 节点树摊平成 runs（纯函数，无副作用） */
function collectRuns(node: Node, ctx: WalkContext, output: DocxRun[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (!text) return;
    output.push({
      text,
      bold: ctx.bold || undefined,
      italic: ctx.italic || undefined,
      underline: ctx.underline || undefined,
      color: ctx.color,
      fontSize: ctx.fontSize,
      fontFamily: ctx.fontFamily,
    });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  const tag = element.tagName.toLowerCase();

  if (tag === "br") {
    output.push({ text: "", lineBreak: true });
    return;
  }

  const next: WalkContext = { ...ctx };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "a") {
    const href = element.getAttribute("href");
    if (href && /^https?:/i.test(href)) {
      // 链接：整体收集为一个 hyperlink run（内部格式不再细分，Word 里够用）
      const text = element.textContent ?? "";
      if (text) {
        output.push({
          text,
          hyperlink: href,
          underline: true,
          color: ctx.color ?? "#0563c1",
          fontSize: ctx.fontSize,
          fontFamily: ctx.fontFamily,
        });
      }
      return;
    }
  }
  if (tag === "span") {
    const inline = parseInlineStyle(element);
    if (inline.color) next.color = inline.color;
    if (inline.fontSize) next.fontSize = inline.fontSize;
  }

  for (const child of Array.from(element.childNodes)) {
    collectRuns(child, next, output);
  }
}

/**
 * 富文本 HTML → 段落列表。
 * @param html Tiptap 产出的 HTML（p / ul / ol / 嵌套 strong 等）
 * @param defaults 默认 run 格式（模块级字号/颜色可传入）
 */
export function richTextToDocxParagraphs(
  html: string | undefined,
  defaults?: Partial<Pick<DocxRun, "fontSize" | "color" | "fontFamily">> & {
    paragraphSpacing?: number;
  }
): RichTextDocx {
  const paragraphs: DocxParagraph[] = [];
  let orderedListCount = 0;

  if (!html || !html.trim()) return { paragraphs, orderedListCount };

  // 纯文本（旧简历里的技能 / 自我评价字段）：与 Web 端 normalizeRichTextContent 对齐——
  // 不解析成 HTML，按行拆段，避免 "<" 被当成标签、也避免换行在 Word 里塌成空格。
  if (!HTML_TAG_REGEX.test(html)) {
    const lines = html.replace(/\r\n|\r/g, "\n").split("\n");
    while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
    for (const line of lines) {
      paragraphs.push({
        runs: line
          ? [{ text: line, fontSize: defaults?.fontSize, color: defaults?.color, fontFamily: defaults?.fontFamily }]
          : [],
        spacingAfter: defaults?.paragraphSpacing,
      });
    }
    return { paragraphs, orderedListCount };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");

  const walkBlock = (node: Node, numId?: number): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) paragraphs.push({ runs: [{ text: node.textContent, fontSize: defaults?.fontSize, color: defaults?.color, fontFamily: defaults?.fontFamily }], spacingAfter: defaults?.paragraphSpacing });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.tagName.toLowerCase();

    if (tag === "p") {
      const runs: DocxRun[] = [];
      collectRuns(
        element,
        {
          bold: false,
          italic: false,
          underline: false,
          fontSize: defaults?.fontSize,
          color: defaults?.color,
          fontFamily: defaults?.fontFamily,
        },
        runs
      );
      paragraphs.push({
        runs,
        numId,
        spacingAfter: defaults?.paragraphSpacing,
        align: /text-align\s*:\s*(center|right)/i.exec(element.getAttribute("style") ?? "")?.[1]?.toLowerCase() as DocxParagraph["align"],
      });
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const isOrdered = tag === "ol";
      const listNumId = isOrdered ? 1 + ++orderedListCount : 1;
      for (const li of Array.from(element.children)) {
        if (li.tagName.toLowerCase() !== "li") continue;
        // li 里的直接内容 + 嵌套 p 都摊平为挂编号的段落
        for (const child of Array.from(li.childNodes)) {
          if (child.nodeType === Node.ELEMENT_NODE && ["ul", "ol"].includes((child as Element).tagName.toLowerCase())) {
            walkBlock(child, undefined); // 嵌套列表：V1 不做二级编号，退化为普通列表
          } else if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName.toLowerCase() === "p") {
            walkBlock(child, listNumId);
          } else if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim()) {
            const runs: DocxRun[] = [];
            collectRuns(
              li,
              {
                bold: false,
                italic: false,
                underline: false,
                fontSize: defaults?.fontSize,
                color: defaults?.color,
                fontFamily: defaults?.fontFamily,
              },
              runs
            );
            paragraphs.push({ runs, numId: listNumId, spacingAfter: defaults?.paragraphSpacing });
            break; // 已整体收集
          }
        }
      }
      return;
    }
    // 其它块级元素：整体收集为普通段落
    const runs: DocxRun[] = [];
    collectRuns(
      element,
      {
        bold: false,
        italic: false,
        underline: false,
        fontSize: defaults?.fontSize,
        color: defaults?.color,
        fontFamily: defaults?.fontFamily,
      },
      runs
    );
    if (runs.length > 0) {
      paragraphs.push({ runs, spacingAfter: defaults?.paragraphSpacing });
    }
  };

  for (const child of Array.from(doc.body.childNodes)) {
    walkBlock(child);
  }

  return { paragraphs, orderedListCount };
}
