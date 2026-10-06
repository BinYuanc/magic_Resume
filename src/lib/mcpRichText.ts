import { normalizeRichTextContent, normalizeLinkHref } from "./richText";
import { colorToHex } from "./color";

/** MCP 输入也进入 HTML 白名单；格式化不改变文本和列表结构。 */
export function sanitizeMcpRichText(html: string): string {
  const doc = new DOMParser().parseFromString(normalizeRichTextContent(html), "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,svg,math,form,input,button,video,audio,link,meta,img").forEach((element) => element.remove());
  const allowed = new Set(["p", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "br", "span", "mark", "ul", "ol", "li", "a", "blockquote"]);
  for (const element of Array.from(doc.body.querySelectorAll("*"))) {
    if (!allowed.has(element.tagName.toLowerCase())) { element.replaceWith(...Array.from(element.childNodes)); continue; }
    const style = (element as HTMLElement).style;
    const color = colorToHex(style.color || "");
    const background = colorToHex(style.backgroundColor || "");
    const size = /^([\d.]+)px$/.exec(style.fontSize);
    const align = ["left", "center", "right", "justify"].includes(style.textAlign) ? style.textAlign : "";
    const isSection = element.tagName === "H3" && element.getAttribute("data-resume-section") === "1";
    const inline = element.getAttribute("data-body-inline") === "1";
    const sectionId = element.getAttribute("data-section-id") ?? "";
    const indent = Number(element.getAttribute("data-indent"));
    const start = Number(element.getAttribute("start"));
    const href = element.tagName === "A" ? normalizeLinkHref(element.getAttribute("href") ?? "") : null;
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
    if (isSection) {
      element.setAttribute("data-resume-section", "1");
      if (/^[a-zA-Z0-9_-]{1,80}$/.test(sectionId)) element.setAttribute("data-section-id", sectionId);
      if (inline) element.setAttribute("data-body-inline", "1");
    }
    const cleanStyle = (element as HTMLElement).style;
    if (color) cleanStyle.color = `#${color}`;
    if (background) cleanStyle.backgroundColor = `#${background}`;
    if (element.tagName === "MARK" && background) element.setAttribute("data-color", `#${background}`);
    if (element.tagName === "OL" && Number.isInteger(start) && start >= 1 && start <= 10000) element.setAttribute("start", String(start));
    if (size && Number(size[1]) >= 8 && Number(size[1]) <= 40) cleanStyle.fontSize = `${Number(size[1])}px`;
    if (align) cleanStyle.textAlign = align;
    if (["P", "H1", "H2", "H3", "LI"].includes(element.tagName) && Number.isInteger(indent) && indent > 0 && indent <= 8) {
      element.setAttribute("data-indent", String(indent)); cleanStyle.marginLeft = `${indent}em`;
    }
    if (href) { element.setAttribute("href", href); element.setAttribute("target", "_blank"); element.setAttribute("rel", "noopener noreferrer"); }
  }
  return doc.body.innerHTML;
}

export function formatMcpRichText(html: string, format: { indent?: number; fontSize?: number; align?: string }): string {
  const doc = new DOMParser().parseFromString(sanitizeMcpRichText(html), "text/html");
  for (const block of Array.from(doc.body.querySelectorAll<HTMLElement>("p,h1,h2,h3,li"))) {
    if (format.indent !== undefined) {
      // 列表移动 li，避免其内部 p 又缩进一次。
      const indent = block.tagName !== "LI" && block.closest("li") ? 0 : format.indent;
      if (indent) { block.setAttribute("data-indent", String(indent)); block.style.marginLeft = `${indent}em`; }
      else { block.removeAttribute("data-indent"); block.style.removeProperty("margin-left"); }
    }
    if (format.align) block.style.textAlign = format.align;
  }
  if (format.fontSize !== undefined) {
    // 每个文本节点加 textStyle span，Tiptap 重新打开时也会保留字号。
    doc.querySelectorAll<HTMLElement>("[style]").forEach((element) => element.style.removeProperty("font-size"));
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes: Node[] = [];
    while (walker.nextNode()) if (walker.currentNode.textContent?.trim()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const span = doc.createElement("span"); span.style.fontSize = `${format.fontSize}px`;
      node.parentNode!.replaceChild(span, node); span.appendChild(node);
    }
  }
  return doc.body.innerHTML;
}
