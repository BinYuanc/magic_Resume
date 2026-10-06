import type { ResumeData } from "@/types/resume";
import { normalizeRichTextContent } from "./richText";
export const SECTION_ATTRIBUTE = "data-resume-section";
export type BodySection = { id: string; title: string; content: string; inline: boolean };
export const escapeBodyText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const newBodySection = (title = "", content = "", inline = false): BodySection => ({ id: crypto.randomUUID(), title, content, inline });
/** 只有存量简历读取时迁移一次。之后普通 H3、AI 内容、粘贴均不作为分隔符。 */
export function migrateLegacyBodyHtml(html: string): string {
  let index = 0;
  return html.replace(/<h3\b([^>]*)>/gi, (tag, attrs: string) => /data-resume-section\s*=/.test(attrs) ? tag : `<h3${attrs} data-resume-section="1" data-section-id="legacy-section-${++index}">`);
}
export function migrateResumeBody(resume: ResumeData): ResumeData {
  if (resume.bodySectionsVersion === 1) return resume;
  return { ...resume, bodySectionsVersion: 1,
    skillContent: migrateLegacyBodyHtml(resume.skillContent ?? ""),
    selfEvaluationContent: migrateLegacyBodyHtml(resume.selfEvaluationContent ?? ""),
    projects: (resume.projects ?? []).map(i => ({ ...i, description: migrateLegacyBodyHtml(i.description ?? "") })),
    experience: (resume.experience ?? []).map(i => ({ ...i, details: migrateLegacyBodyHtml(i.details ?? "") })),
    education: (resume.education ?? []).map(i => ({ ...i, description: migrateLegacyBodyHtml(i.description ?? "") })),
    customData: Object.fromEntries(Object.entries(resume.customData ?? {}).map(([key, items]) => [key, items.map(i => ({ ...i, description: migrateLegacyBodyHtml(i.description ?? "") }))])),
  };
}
export function parseBodySections(html: string): BodySection[] {
  if (typeof DOMParser === "undefined") return [{ id: "initial", title: "", content: html, inline: false }];
  const doc = new DOMParser().parseFromString(normalizeRichTextContent(html), "text/html");
  const sections: BodySection[] = [];
  let current: BodySection = { id: "body-intro", title: "", content: "", inline: false };
  const ids = new Set<string>();
  for (const node of Array.from(doc.body.childNodes)) {
    const element = node as Element;
    if (node.nodeType === 1 && element.tagName === "H3" && element.getAttribute(SECTION_ATTRIBUTE) === "1") {
      if (current.content || current.title || sections.length) sections.push(current);
      const id = element.getAttribute("data-section-id") ?? "";
      current = { ...newBodySection(node.textContent ?? "", "", element.getAttribute("data-body-inline") === "1"),
        id: /^[a-zA-Z0-9_-]{1,80}$/.test(id) && !ids.has(id) ? id : `body-section-${sections.length + 1}` };
      ids.add(current.id);
    } else current.content += node.nodeType === 1 ? element.outerHTML : escapeBodyText(node.textContent ?? "");
  }
  sections.push(current);
  return sections;
}
export function serializeBodySections(sections: BodySection[]): string {
  return sections.map((section, index) => {
    if (!section.title && index === 0) return section.content;
    return `<h3 data-resume-section="1" data-section-id="${escapeBodyText(section.id)}"${section.inline ? ' data-body-inline="1"' : ""}>${escapeBodyText(section.title)}</h3>${section.content}`;
  }).join("");
}
