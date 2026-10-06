import type { BasicInfo, GlobalSettings, ResumeData } from "@/types/resume";
import { TEMPLATE_SECTION_KEYS, type TemplateDefinition, type TemplateSectionKey } from "@/types/templateDefinition";
import { resolveResumeStyle, resolveSectionStyle, resolveItemStyle } from "./resumeStyle";

/** 模板 ID 与旧侧栏 ID 的兼容边界；不修改简历内容。 */
export const legacySectionId = (key: string) => key === "summary" ? "selfEvaluation" : key;
export const canonicalSectionId = (key: string) => key === "selfEvaluation" ? "summary" : key;

export function isResumeSectionEnabled(resume: ResumeData, key: string): boolean {
  const entry = resume.menuSections?.find((s) => canonicalSectionId(s.id) === key);
  const override = resume.styleOverrides?.sections?.[key] ?? resume.styleOverrides?.sections?.[legacySectionId(key)];
  return entry?.enabled !== false && override?.hidden !== true;
}

export function resumeSectionOrder(resume: ResumeData, definition?: TemplateDefinition): TemplateSectionKey[] {
  const order = definition?.source === "builtin-react" && resume.menuSections?.length
    ? [...resume.menuSections].sort((a, b) => a.order - b.order).map((s) => canonicalSectionId(s.id))
    : definition?.layout.order ?? TEMPLATE_SECTION_KEYS;
  return Array.from(new Set([...order, ...TEMPLATE_SECTION_KEYS]))
    .filter((key): key is TemplateSectionKey => TEMPLATE_SECTION_KEYS.includes(key as TemplateSectionKey))
    .filter((key) => isResumeSectionEnabled(resume, key));
}

/**
 * 完整替换模板负责的展示字段，保留图标、分页等产品设置。
 *
 * 只覆盖模板真正声明过的字段，未声明的字段沿用 previous。
 * 内置模板由 resolver 声明原有默认字号，避免系统兜底改变原始排版。
 */
export function templateDefaultSettings(definition: TemplateDefinition | undefined, previous: GlobalSettings = {}): GlobalSettings {
  const typography = definition?.typography ?? {};
  const spacing = definition?.spacing ?? {};
  const colors = definition?.colors ?? {};
  return {
    ...previous,
    ...(definition?.savedPresentation?.example.globalSettings ?? {}),
    fontFamily: typography.fontFamily ?? previous.fontFamily,
    baseFontSize: typography.baseFontSize ?? previous.baseFontSize,
    headerSize: typography.headerSize ?? previous.headerSize,
    subheaderSize: typography.subheaderSize ?? previous.subheaderSize,
    lineHeight: typography.lineHeight ?? previous.lineHeight,
    pagePadding: spacing.contentPadding ?? definition?.layout?.pagePadding ?? previous.pagePadding,
    sectionSpacing: spacing.sectionGap ?? previous.sectionSpacing,
    paragraphSpacing: spacing.itemGap ?? previous.paragraphSpacing,
    themeColor: colors.primary ?? previous.themeColor,
    sectionStyles: undefined,
  };
}

export function basicFieldVisible(basic: BasicInfo, key: string): boolean {
  return basic.fieldOrder?.find((field) => field.key === key)?.visible !== false;
}

export function basicContactValues(basic: BasicInfo): string[] {
  const keys = basic.fieldOrder?.length ? basic.fieldOrder.filter((f) => f.visible).map((f) => f.key)
    : ["email", "phone", "location", "birthDate", "employementStatus"];
  const result = keys.filter((key) => key !== "name" && key !== "title")
    .map((key) => basic[key as keyof BasicInfo]).filter((v): v is string => typeof v === "string" && !!v.trim());
  for (const field of basic.customFields ?? []) {
    if (field.visible !== false && field.value?.trim()) result.push(field.displayLabel ? `${field.label}: ${field.value}` : field.value);
  }
  return result;
}

/** 将统一样式投影给旧 React 模板，消除旧组件自身回退值的差异。 */
export function resolveLegacyResumeData(resume: ResumeData, definition: TemplateDefinition): ResumeData {
  const style = resolveResumeStyle(definition, resume.styleOverrides, resume.globalSettings);
  const settings = { ...resume.globalSettings, ...templateDefaultSettings(definition, resume.globalSettings),
    fontFamily: style.fontFamily, baseFontSize: style.baseFontSize, headerSize: style.headerSize,
    subheaderSize: style.subheaderSize, lineHeight: style.lineHeight, pagePadding: style.pagePadding,
    sectionSpacing: style.sectionSpacing, paragraphSpacing: style.itemSpacing, themeColor: style.themeColor,
    sectionStyles: { ...resume.globalSettings?.sectionStyles } };
  for (const key of ["projects", "experience", "education"] as const) {
    settings.sectionStyles[key] = { itemSpacing: resolveSectionStyle(definition, resume.styleOverrides, resume.globalSettings, key, style).itemSpacing };
  }
  const body = (html: string | undefined, id: string) => {
    if (!html) return html;
    const local = resolveItemStyle(resume.styleOverrides,id);
    const css = [local.fontSize === undefined ? "" : `font-size:${local.fontSize}px`,local.color ? `color:${local.color}` : "",local.bold === undefined ? "" : `font-weight:${local.bold ? 700 : 400}`,local.italic === undefined ? "" : `font-style:${local.italic ? "italic" : "normal"}`,local.underline === undefined ? "" : `text-decoration:${local.underline ? "underline" : "none"}`].filter(Boolean).join(";");
    return css ? `<div style="${css.replace(/"/g,"&quot;")}">${html}</div>` : html;
  };
  const templateOrder = definition.layout.order ?? TEMPLATE_SECTION_KEYS;
  return { ...resume, globalSettings: settings,
    projects: (resume.projects ?? []).map(i=>({ ...i, description: body(i.description,i.id) ?? "" })),
    experience: (resume.experience ?? []).map(i=>({ ...i,details:body(i.details,i.id) ?? "" })),
    education: (resume.education ?? []).map(i=>({ ...i,description:body(i.description,i.id) })),
    customData: Object.fromEntries(Object.entries(resume.customData ?? {}).map(([key,items])=>[key,items.map(i=>({ ...i,description:body(i.description,i.id) ?? "" }))])),
    menuSections: (resume.menuSections ?? []).map((s) => {
      const key = canonicalSectionId(s.id);
      const isCustom = !TEMPLATE_SECTION_KEYS.includes(key as TemplateSectionKey) || key === "custom";
      const index = templateOrder.indexOf((isCustom ? "custom" : key) as TemplateSectionKey);
      return { ...s, enabled: s.enabled && isResumeSectionEnabled(resume,key),
        order: definition.source === "custom-schema" ? (index < 0 ? templateOrder.length : index) + (isCustom ? s.order / 1000 : 0) : s.order };
    }) };
}
