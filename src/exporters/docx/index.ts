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

export interface ExportDocxResult { ok: boolean; simplified: boolean; decorationsOmitted?: DocxOmittedDecoration[]; error?: string; }

/**
 * full 模板（classic / minimalist）走完整表格布局，但以下装饰 Word 无法表达。
 * 它们只作为提示返回，不再把整份导出标成「简化布局」。
 */
export type DocxOmittedDecoration = "contactIcons" | "githubContributions" | "flexibleHeaderLayout" | "photoBorderRadius";

/** 独立的生成入口：下载之外的完整转换链也可在测试中验证。 */
export async function buildResumeDocx(resume: ResumeData, customTemplates: TemplateDefinition[] = [], imageLoader = loadDocxImage) {
  const definition = customTemplates.find((item) => item.id === resume.templateId) ?? builtinToDefinition(findTemplateView(resume.templateId, customTemplates));
  const style = resolveResumeStyle(definition, resume.styleOverrides, resume.globalSettings);
  const paragraphs: DocxParagraph[] = [];
  const renderer = definition.savedPresentation?.renderer ?? definition.builtinLayout;
  const full = definition.docxCapability === "full" && ["classic", "minimalist"].includes(renderer ?? "");
  const centeredSubtitle = resume.globalSettings?.centerSubtitle === true;
  let orderedListCount = 0;
  const sectionStyle = (key: string) => resolveSectionStyle(definition, resume.styleOverrides, resume.globalSettings, key, style);
  const sectionTitle = (key: string) => resume.menuSections?.find((s) => s.id === key || s.id === legacySectionId(key))?.title ?? ({ summary: "自我评价", skills: "专业技能", experience: "工作经验", projects: "项目经历", education: "教育经历", certificates: "证书" } as Record<string, string>)[key] ?? key;
  const heading = (key: string) => {
    const resolved = sectionStyle(key);
    paragraphs.push({ runs: [{ text: sectionTitle(key), fontSize: resolved.fontSize, color: resolved.color, bold: resolved.fontWeight >= 600 }],
      keepNext: true, keepLines: true, spacingAfter: resolved.itemSpacing, align: resolved.align, border: resolved.border ? resolved.color : undefined, background: resolved.background });
  };
  const appendRichText = (html: string | undefined, key: string, local: ResumeTextStyle = {}) => {
    const result = richTextToDocxParagraphs(html, { fontSize: local.fontSize ?? style.baseFontSize,
      color: local.color ?? style.textColor, fontFamily: style.fontFamily, paragraphSpacing: full ? 0 : sectionStyle(key).itemSpacing });
    // 每个转换片段独立分配编号，合并时偏移，bullet=1 保持固定。
    for (const paragraph of result.paragraphs) {
      if (paragraph.numId !== undefined && paragraph.numId > 1) paragraph.numId += orderedListCount;
      paragraph.runs = paragraph.runs.map((run) => ({ ...local, ...Object.fromEntries(Object.entries(run).filter(([, value]) => value !== undefined)) } as DocxRun));
    }
    paragraphs.push(...result.paragraphs);
    orderedListCount += result.orderedListCount;
  };
  const header = (left: string, date: string | undefined, key: string, index: number, local: ResumeTextStyle = {}, nameStyle?: ResumeTextStyle, middle?: string, middleStyle?: ResumeTextStyle) => {
    if (full) {
      const width = 11906 / 15 - style.pagePadding * 2;
      paragraphs.push({ runs: [], spacingBefore: sectionStyle(key).itemSpacing, table: {
        widths: [width * 3 / 7, width * 2 / 7, width * 2 / 7], rows: [[
          { paragraphs: [{ runs: [{ ...local, text: left, fontSize: local.fontSize ?? style.subheaderSize, bold: true, ...nameStyle }], keepNext: true }] },
          { paragraphs: [{ runs: [{ ...local, text: centeredSubtitle ? middle ?? "" : "", fontSize: local.fontSize ?? style.subheaderSize, ...middleStyle }], keepNext: true }] },
          { paragraphs: [{ runs: date ? [{ ...local, text: date, fontSize: local.fontSize ?? style.subheaderSize }] : [], align: "right", keepNext: true }] },
        ]] } });
      return;
    }
    paragraphs.push({ runs: [ { ...local, text: left, fontSize: local.fontSize ?? style.subheaderSize, bold: true, ...nameStyle },
      ...(date ? [{ ...local, text: `　　${date}`, fontSize: local.fontSize ?? style.subheaderSize }] : []) ],
      keepNext: true, spacingBefore: index ? sectionStyle(key).itemSpacing : 0, spacingAfter: 0 });
  };
  const subtitle = (text: string, local: ResumeTextStyle = {}, nameStyle?: ResumeTextStyle) => paragraphs.push({ runs: [{ ...local, text, fontSize: local.fontSize ?? style.subheaderSize, ...nameStyle }], spacingAfter: 0 });
  const availableWidth = 794 - style.pagePadding * 2;
  for (const key of resumeSectionOrder(resume, definition)) {
    const start = paragraphs.length;
    switch (key) {
      case "basic": {
        const basic = resume.basic;
        const align = basic.layout ?? definition.layout.basicLayout ?? "left";
        const basicParagraphs: DocxParagraph[] = [];
        if (basic.name && basicFieldVisible(basic, "name")) basicParagraphs.push({ runs: [{ text: basic.name, bold: true, fontSize: full ? 30 : style.headerSize, color: full ? style.textColor : style.themeColor }], align, keepNext: true, spacingAfter: 2 });
        if (basic.title && basicFieldVisible(basic, "title")) basicParagraphs.push({ runs: [{ text: basic.title, fontSize: full ? 18 : style.subheaderSize, color: full ? style.textColor : style.themeColor }], align, keepNext: true, spacingAfter: 2 });
        const contacts = basicContactValues(basic);
        const photo = basic.photo && basic.photoConfig?.visible !== false ? { runs: [{ text: "", image: await imageLoader(basic.photo, basic.photoConfig?.width ?? 90, "照片", basic.photoConfig?.height ?? 120) }], align, spacingAfter: 4 } as DocxParagraph : undefined;
        if (full && align !== "center") {
          const width = 11906 / 15 - style.pagePadding * 2;
          const identity = { paragraphs: photo ? [{ runs: [], table: {
            widths: [Math.min(photo.runs[0].image!.width,width*.25),24,Math.max(20,width*.42-Math.min(photo.runs[0].image!.width,width*.25)-24)],
            rows: [[{paragraphs:[photo]},{paragraphs:[{runs:[]}]},{paragraphs:basicParagraphs}]],
          } } as DocxParagraph] : basicParagraphs };
          const contactBlock: DocxParagraph = { runs: [], table: { widths: [width * .28, width * .28], rows: Array.from({ length: Math.max(1,Math.ceil(contacts.length / 2)) }, (_, i) => [0,1].map(j => ({ paragraphs: [{ runs: [{ text: contacts[i*2+j] ?? "", color: "#4b5563" }], spacingAfter: 8 }] }))) } };
          const gap = { paragraphs: [{ runs: [] }] };
          const cells = align === "right" ? [{ paragraphs: [contactBlock] }, gap, identity] : [identity, gap, { paragraphs: [contactBlock] }];
          paragraphs.push({ runs: [], table: { widths: align === "right" ? [width*.56, width*.02, width*.42] : [width*.42, width*.02, width*.56], rows: [cells] } });
        } else {
          if (photo) paragraphs.push(photo);
          paragraphs.push(...basicParagraphs);
          if (contacts.length) paragraphs.push({ runs: [{ text: contacts.join(" · ") }], align, spacingAfter: 0 });
        }
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
          header(item.company, item.date, key, index, {}, undefined, item.position); if (item.position && !(full && centeredSubtitle)) subtitle(item.position); appendRichText(item.details, key, local); });
        break;
      }
      case "projects": {
        const items = (resume.projects ?? []).filter((i) => i.visible !== false);
        if (!items.length) break; heading(key);
        items.forEach((item, index) => { const local = resolveItemStyle(resume.styleOverrides, item.id);
          header(item.name, item.date, key, index, {}, item.nameStyle, item.role, item.roleStyle);
          if (item.role && !(full && centeredSubtitle)) subtitle(item.role, {}, item.roleStyle);
          if (item.link) paragraphs.push({ runs: [{ text: item.linkLabel || item.link, ...(/^https?:/i.test(item.link) ? { hyperlink: item.link } : {}), ...local }], spacingAfter: 0 });
          appendRichText(item.description, key, local); });
        break;
      }
      case "education": {
        const items = (resume.education ?? []).filter((i) => i.visible !== false);
        if (!items.length) break; heading(key);
        items.forEach((item, index) => { const local = resolveItemStyle(resume.styleOverrides, item.id);
          const detail = [item.major, item.degree, item.gpa ? `GPA ${item.gpa}` : ""].filter(Boolean).join(" · ");
          header(item.school, [item.startDate, item.endDate].filter(Boolean).join(" - "), key, index, {}, undefined, detail);
          if (detail && !(full && centeredSubtitle)) subtitle(detail); appendRichText(item.description, key, local); });
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
  // 装饰差异单独上报：图标/贡献图/自由头部/圆角照片 Word 表达不了，
  // 但它们不影响「是否用了完整布局」，因此不再等同于 simplified。
  const decorationsOmitted: DocxOmittedDecoration[] = full ? ([
    resume.globalSettings?.useIconMode ? "contactIcons" : null,
    resume.basic.githubContributionsVisible ? "githubContributions" : null,
    resume.globalSettings?.flexibleHeaderLayout ? "flexibleHeaderLayout" : null,
    resume.basic.photo && resume.basic.photoConfig?.borderRadius !== "none" ? "photoBorderRadius" : null,
  ].filter((value): value is DocxOmittedDecoration => Boolean(value))) : [];
  return { bytes: await buildDocxBytes({ paragraphs, orderedListCount, fontFamily: style.fontFamily,
    baseFontSize: style.baseFontSize, textColor: style.textColor, pagePadding: style.pagePadding, lineHeight: style.lineHeight }),
    simplified: definition.docxCapability === "basic" || (!full && definition.source === "builtin-react"),
    decorationsOmitted };
}

export async function exportResumeAsDocx(resume: ResumeData): Promise<ExportDocxResult> {
  try {
    const result = await buildResumeDocx(resume, useCustomTemplateStore.getState().templates);
    const blob = new Blob([result.bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const safeName = (resume.title || "resume").replace(/[\\/:*?"<>|]/g, "_");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `${safeName}.docx`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    return { ok: true, simplified: result.simplified, decorationsOmitted: result.decorationsOmitted };
  } catch (error) { return { ok: false, simplified: false, error: (error as Error)?.message ?? "未知错误" }; }
}
