import type { ResumeData, ResumeTextStyle } from "@/types/resume";
import type { TemplateDefinition } from "@/types/templateDefinition";
import { resolveResumeStyle, resolveSectionStyle, resolveItemStyle } from "@/lib/resumeStyle";
import { builtinToDefinition } from "@/lib/templateResolver";
import { findTemplateView } from "@/lib/templateCatalog";
import { basicContactValues, basicFieldVisible, isResumeSectionEnabled, legacySectionId, resumeSectionOrder } from "@/lib/resumePresentation";
import { useCustomTemplateStore } from "@/store/useCustomTemplateStore";
import { richTextToDocxParagraphs, type DocxParagraph, type DocxRun } from "./richTextToDocx";
import { buildDocxBytes } from "./docxBuilder";
import { loadDocxImage } from "./image";

export interface ExportDocxResult { ok: boolean; simplified: boolean; error?: string; }

/** 独立的生成入口：下载之外的完整转换链也可在测试中验证。 */
export async function buildResumeDocx(resume: ResumeData, customTemplates: TemplateDefinition[] = [], imageLoader = loadDocxImage) {
  const definition = customTemplates.find((item) => item.id === resume.templateId) ?? builtinToDefinition(findTemplateView(resume.templateId, customTemplates));
  const style = resolveResumeStyle(definition, resume.styleOverrides, resume.globalSettings);
  const paragraphs: DocxParagraph[] = [];
  let orderedListCount = 0;
  const sectionStyle = (key: string) => resolveSectionStyle(definition, resume.styleOverrides, resume.globalSettings, key, style);
  const sectionTitle = (key: string) => resume.menuSections?.find((s) => s.id === key || s.id === legacySectionId(key))?.title ?? ({ summary: "自我评价", skills: "专业技能", experience: "工作经验", projects: "项目经历", education: "教育经历", certificates: "证书" } as Record<string, string>)[key] ?? key;
  const heading = (key: string) => {
    const resolved = sectionStyle(key);
    paragraphs.push({ runs: [{ text: sectionTitle(key), fontSize: resolved.fontSize, color: resolved.color, bold: resolved.fontWeight >= 600 }],
      spacingAfter: resolved.itemSpacing, align: resolved.align, border: resolved.border ? resolved.color : undefined, background: resolved.background });
  };
  const appendRichText = (html: string | undefined, key: string, local: ResumeTextStyle = {}) => {
    const result = richTextToDocxParagraphs(html, { fontSize: local.fontSize ?? style.baseFontSize,
      color: local.color ?? style.textColor, fontFamily: style.fontFamily, paragraphSpacing: sectionStyle(key).itemSpacing });
    // 每个转换片段独立分配编号，合并时偏移，bullet=1 保持固定。
    for (const paragraph of result.paragraphs) {
      if (paragraph.numId !== undefined && paragraph.numId > 1) paragraph.numId += orderedListCount;
      paragraph.runs = paragraph.runs.map((run) => ({ ...local, ...Object.fromEntries(Object.entries(run).filter(([, value]) => value !== undefined)) } as DocxRun));
    }
    paragraphs.push(...result.paragraphs);
    orderedListCount += result.orderedListCount;
  };
  const header = (left: string, date: string | undefined, key: string, index: number, local: ResumeTextStyle = {}, nameStyle?: ResumeTextStyle) => {
    paragraphs.push({ runs: [ { ...local, text: left, fontSize: local.fontSize ?? style.subheaderSize, bold: true, ...nameStyle },
      ...(date ? [{ ...local, text: `　　${date}`, fontSize: local.fontSize ?? style.subheaderSize }] : []) ],
      spacingBefore: index ? sectionStyle(key).itemSpacing : 0, spacingAfter: 0 });
  };
  const subtitle = (text: string, local: ResumeTextStyle = {}, nameStyle?: ResumeTextStyle) => paragraphs.push({ runs: [{ ...local, text, fontSize: local.fontSize ?? style.subheaderSize, ...nameStyle }], spacingAfter: 0 });
  const availableWidth = 794 - style.pagePadding * 2;
  for (const key of resumeSectionOrder(resume, definition)) {
    const start = paragraphs.length;
    switch (key) {
      case "basic": {
        const basic = resume.basic;
        const align = basic.layout ?? definition.layout.basicLayout ?? "left";
        if (basic.photo && basic.photoConfig?.visible !== false) paragraphs.push({ runs: [{ text: "", image: await imageLoader(basic.photo, basic.photoConfig?.width ?? 90, "照片", basic.photoConfig?.height ?? 120) }], align, spacingAfter: 4 });
        if (basic.name && basicFieldVisible(basic, "name")) paragraphs.push({ runs: [{ text: basic.name, bold: true, fontSize: style.headerSize, color: style.themeColor }], align, spacingAfter: 2 });
        if (basic.title && basicFieldVisible(basic, "title")) paragraphs.push({ runs: [{ text: basic.title, fontSize: style.subheaderSize, color: style.themeColor }], align, spacingAfter: 2 });
        const contacts = basicContactValues(basic);
        if (contacts.length) paragraphs.push({ runs: [{ text: contacts.join(" · ") }], align, spacingAfter: 0 });
        break;
      }
      case "summary": case "skills": {
        const content = key === "summary" ? resume.selfEvaluationContent : resume.skillContent;
        if (content) { heading(key); appendRichText(content, key); }
        break;
      }
      case "experience": {
        const items = (resume.experience ?? []).filter((i) => i.visible !== false);
        if (!items.length) break; heading(key);
        items.forEach((item, index) => { const local = resolveItemStyle(resume.styleOverrides, item.id);
          header(item.company, item.date, key, index, local); if (item.position) subtitle(item.position, local); appendRichText(item.details, key, local); });
        break;
      }
      case "projects": {
        const items = (resume.projects ?? []).filter((i) => i.visible !== false);
        if (!items.length) break; heading(key);
        items.forEach((item, index) => { const local = resolveItemStyle(resume.styleOverrides, item.id);
          header(item.name, item.date, key, index, local, item.nameStyle);
          if (item.role) subtitle(item.role, local, item.roleStyle);
          if (item.link) paragraphs.push({ runs: [{ text: item.linkLabel || item.link, ...(/^https?:/i.test(item.link) ? { hyperlink: item.link } : {}), ...local }], spacingAfter: 0 });
          appendRichText(item.description, key, local); });
        break;
      }
      case "education": {
        const items = (resume.education ?? []).filter((i) => i.visible !== false);
        if (!items.length) break; heading(key);
        items.forEach((item, index) => { const local = resolveItemStyle(resume.styleOverrides, item.id);
          header(item.school, [item.startDate, item.endDate].filter(Boolean).join(" - "), key, index, local);
          const detail = [item.major, item.degree, item.gpa ? `GPA ${item.gpa}` : ""].filter(Boolean).join(" · ");
          if (detail) subtitle(detail, local); appendRichText(item.description, key, local); });
        break;
      }
      case "certificates": {
        if (!resume.certificates?.length) break; heading(key);
        for (const cert of resume.certificates) {
          const image = await imageLoader(cert.url, availableWidth * Math.min(100, Math.max(10, cert.width ?? 100)) / 100, "证书");
          if (image.height > 900) { image.width *= 900 / image.height; image.height = 900; }
          paragraphs.push({ runs: [{ text: "", image }], spacingAfter: sectionStyle(key).itemSpacing });
        }
        break;
      }
      case "custom": {
        const groups = Object.entries(resume.customData ?? {}).filter(([id]) => isResumeSectionEnabled(resume, id))
          .sort(([a], [b]) => (resume.menuSections.find((s) => s.id === a)?.order ?? 0) - (resume.menuSections.find((s) => s.id === b)?.order ?? 0));
        for (const [id, items] of groups) {
          const visible = items.filter((i) => i.visible !== false); if (!visible.length) continue; heading(id);
          visible.forEach((item, index) => { const local = resolveItemStyle(resume.styleOverrides, item.id);
            header(item.title, item.dateRange, id, index, local); if (item.subtitle) subtitle(item.subtitle, local); appendRichText(item.description, id, local); });
        }
        break;
      }
    }
    if (paragraphs.length > start) paragraphs[paragraphs.length - 1].spacingAfter = sectionStyle(key).spacing;
  }
  return { bytes: await buildDocxBytes({ paragraphs, orderedListCount, fontFamily: style.fontFamily,
    baseFontSize: style.baseFontSize, textColor: style.textColor, pagePadding: style.pagePadding, lineHeight: style.lineHeight }),
    simplified: definition.docxCapability === "basic" };
}

export async function exportResumeAsDocx(resume: ResumeData): Promise<ExportDocxResult> {
  try {
    const result = await buildResumeDocx(resume, useCustomTemplateStore.getState().templates);
    const blob = new Blob([result.bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const safeName = (resume.title || "resume").replace(/[\\/:*?"<>|]/g, "_");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `${safeName}.docx`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    return { ok: true, simplified: result.simplified };
  } catch (error) { return { ok: false, simplified: false, error: (error as Error)?.message ?? "未知错误" }; }
}
