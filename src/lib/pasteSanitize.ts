/**
 * 粘贴内容净化
 *
 * 从 Word / 网页 / ChatGPT 复制的 HTML 常带有：
 * font-family / font-size / color / background / margin / line-height / class / style，
 * 会造成「格式污染」。净化策略：
 * - 保留结构（p / h1-h3 / ul / ol / li / br / a）与基础 inline 格式
 *   （b / strong / i / em / u / s）——Tiptap schema 会解析为 bold/italic/underline/list/link
 * - 移除所有 style / class / id 属性（font-size、color、background 等随之消失）
 * - 移除 Word 私有标签（o:p 等）与注释
 * - <font> 标签剥壳为纯内联内容
 */

/** 净化粘贴的 HTML：去除外部样式与类名，保留文字与必要结构 */
export function sanitizePastedHtml(html: string): string {
  if (!html) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");

  // 移除注释节点与 Word 私有元素
  const removeGarbage = (root: ParentNode) => {
    const iterator = doc.createNodeIterator(root, NodeFilter.SHOW_COMMENT);
    const comments: Node[] = [];
    let node: Node | null;
    while ((node = iterator.nextNode())) comments.push(node);
    comments.forEach((comment) => comment.parentNode?.removeChild(comment));
    root.querySelectorAll("o\\:p, style, script, meta, link").forEach((el) => el.remove());
  };

  // <font> 剥壳：替换为其子内容（其 face/size/color 属性随之消失）
  const unwrapFontTags = (root: ParentNode) => {
    Array.from(root.querySelectorAll("font")).forEach((font) => {
      const parent = font.parentNode;
      if (!parent) return;
      while (font.firstChild) parent.insertBefore(font.firstChild, font);
      parent.removeChild(font);
    });
  };

  removeGarbage(doc.body);
  unwrapFontTags(doc.body);

  // 移除所有元素的 style / class / id / 其他排版相关属性
  Array.from(doc.body.querySelectorAll("*")).forEach((el) => {
    el.removeAttribute("data-resume-section");
    el.removeAttribute("data-section-id");
    el.removeAttribute("data-body-inline");
    el.removeAttribute("style");
    el.removeAttribute("class");
    el.removeAttribute("id");
    el.removeAttribute("align");
    el.removeAttribute("face");
    el.removeAttribute("size");
    el.removeAttribute("color");
    el.removeAttribute("bgcolor");
  });

  return doc.body.innerHTML;
}

/** 将纯文本转换为段落 HTML（用于 Ctrl+Shift+V 与纯文本粘贴） */
export function plainTextToParagraphs(text: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => `<p>${line.trim() ? escape(line) : "<br />"}</p>`)
    .join("");
}
