import type { ResumeData, GlobalSettings, ResumeTextStyle } from "@/types/resume";
import type { SavedTemplatePresentation, TemplateDefinition } from "@/types/templateDefinition";
import { normalizeRichTextContent } from "./richText";
import { colorToHex } from "./color";

export const SAVED_RENDERERS = ["classic", "modern", "left-right", "timeline", "minimalist", "elegant", "creative", "editorial", "swiss"];
const HEADINGS = new Set(["核心负责", "项目定位", "技术栈", "核心职责与难点突破", "核心职责和难点突破", "项目成果", "典型场景"]);
const EXAMPLE_BODY = "在此填写示例业务背景、负责的工作、解决的问题和项目成果。";
const exampleText = (length: number) => EXAMPLE_BODY.repeat(Math.ceil(Math.max(1, length) / EXAMPLE_BODY.length)).slice(0, Math.max(1, length));
const number = (value: unknown, fallback: number, min = 0, max = 120) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const color = (value: unknown) => typeof value === "string" && colorToHex(value) ? value : undefined;
const icon = (value: unknown) => typeof value === "string" && /^[A-Z][A-Za-z]{0,40}$/.test(value) ? value : "User";
const textStyle = (value?: ResumeTextStyle): ResumeTextStyle | undefined => value ? {
  fontSize: value.fontSize === undefined ? undefined : number(value.fontSize, 18, 8, 40), color: color(value.color),
  bold: typeof value.bold === "boolean" ? value.bold : undefined,
  italic: typeof value.italic === "boolean" ? value.italic : undefined,
  underline: typeof value.underline === "boolean" ? value.underline : undefined,
} : undefined;

/** 保留富文本结构及安全样式，逐个文字节点换成生成的示例，不拷贝个人文字。 */
export function exampleRichText(html?: string): string {
  if (!html) return "";
  if (typeof DOMParser === "undefined") throw new Error("请在浏览器中保存排版模板");
  const doc = new DOMParser().parseFromString(normalizeRichTextContent(html), "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,img,svg,math,input,button,form,link,meta").forEach(node => node.remove());
  const allowed = new Set(["DIV", "P", "H1", "H2", "H3", "STRONG", "B", "EM", "I", "U", "S", "BR", "SPAN", "MARK", "UL", "OL", "LI", "BLOCKQUOTE", "A"]);
  for (const element of Array.from(doc.body.querySelectorAll<HTMLElement>("*"))) {
    if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); continue; }
    const oldStyle = element.style;
    const styles = Object.fromEntries(["font-size", "font-family", "font-weight", "color", "background-color", "text-align", "line-height", "margin-left"].map(key => [key, oldStyle.getPropertyValue(key)]));
    const section = element.tagName === "H3" && element.getAttribute("data-resume-section") === "1";
    const inline = element.getAttribute("data-body-inline") === "1";
    const indent = number(Number(element.getAttribute("data-indent")), 0, 0, 8);
    const start = number(Number(element.getAttribute("start")), 1, 1, 10000);
    for (const attr of Array.from(element.attributes)) element.removeAttribute(attr.name);
    for (const [key, value] of Object.entries(styles)) if (value && !/url\(|[<>@]|javascript:/i.test(value)) element.style.setProperty(key, value);
    if (section) element.setAttribute("data-resume-section", "1");
    if (inline && element.tagName === "H3") element.setAttribute("data-body-inline", "1");
    if (indent) element.setAttribute("data-indent", String(indent));
    if (element.tagName === "OL") element.setAttribute("start", String(start));
    if (element.tagName === "A") element.setAttribute("href", "https://example.com");
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const texts: Node[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const node of texts) {
    const original = node.textContent ?? "";
    if (!original.trim()) continue;
    const heading = node.parentElement?.closest("h1,h2,h3");
    const title = original.trim().replace(/[：:]$/, "");
    node.textContent = heading ? (HEADINGS.has(title) ? title : "示例小标题") : exampleText(original.trim().length);
  }
  return doc.body.innerHTML;
}

/** 白名单构造，不使用展开运算符复制个人字段或未知扩展字段。 */
export function buildTemplateExample(resume: ResumeData, renderer?: string): SavedTemplatePresentation {
  const settings = resume.globalSettings ?? {};
  const globalSettings: GlobalSettings = {};
  for (const [key, fallback] of Object.entries({ baseFontSize: 17, pagePadding: 32, paragraphSpacing: 16, lineHeight: 1.6, sectionSpacing: 24, headerSize: 20, subheaderSize: 18 })) {
    const max = key === "lineHeight" ? 3 : 120;
    (globalSettings as Record<string, unknown>)[key] = number((settings as Record<string, unknown>)[key], fallback, key === "lineHeight" ? 0.8 : 0, max);
  }
  globalSettings.fontFamily = typeof settings.fontFamily === "string" && !/[<>@]|url\(/i.test(settings.fontFamily) ? settings.fontFamily.slice(0, 120) : "sans-serif";
  globalSettings.themeColor = color(settings.themeColor);
  for (const key of ["useIconMode", "centerSubtitle", "flexibleHeaderLayout", "autoOnePage", "pageBreakLinesVisible"] as const) globalSettings[key] = settings[key] === true;
  globalSettings.sectionStyles = Object.fromEntries(["projects", "experience", "education"].map(key => [key, { itemSpacing: number((settings.sectionStyles as Record<string, { itemSpacing?: number }> | undefined)?.[key]?.itemSpacing, settings.paragraphSpacing ?? 16) }]));
  const basic = resume.basic;
  const pc = basic?.photoConfig;
  const customKeys = Object.keys(resume.customData ?? {}).map((key, index) => ({ old: key, next: `custom-${index + 1}` }));
  const avatar = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#e5e7eb"/><circle cx="50" cy="35" r="17" fill="#9ca3af"/><path d="M15 100V85a35 35 0 0170 0v15" fill="#9ca3af"/></svg>');
  const example: ResumeData = {
    id: "template-example", title: "示例简历", createdAt: "", updatedAt: "", templateId: null, activeSection: "basic", draggingProjectId: null,
    globalSettings,
    basic: {
      name: "示例候选人", title: "示例应聘岗位", email: "example.mail", phone: "000-0000-0000", location: "示例城市", birthDate: "2000-01", employementStatus: "示例状态",
      photo: basic?.photo ? avatar : "", photoConfig: { width: number(pc?.width, 68, 10, 400), height: number(pc?.height, 68, 10, 400), aspectRatio: ["1:1", "4:3", "3:4", "16:9", "custom"].includes(pc?.aspectRatio ?? "") ? pc!.aspectRatio : "1:1", borderRadius: ["none", "medium", "full", "custom"].includes(pc?.borderRadius ?? "") ? pc!.borderRadius : "medium", customBorderRadius: number(pc?.customBorderRadius, 0), visible: pc?.visible === true },
      layout: ["left", "center", "right"].includes(basic?.layout ?? "") ? basic.layout : "left",
      icons: Object.fromEntries(Object.entries(basic?.icons ?? {}).filter(([key]) => ["email", "phone", "location", "birthDate", "employementStatus"].includes(key)).map(([key, value]) => [key, icon(value)])),
      fieldOrder: basic?.fieldOrder?.filter(field => ["name", "title", "email", "phone", "location", "birthDate", "employementStatus"].includes(field.key)).map((field, index) => ({ id: String(index), key: field.key, label: "基础项", type: field.type === "date" || field.type === "textarea" || field.type === "editor" ? field.type : "text", visible: field.visible !== false })),
      customFields: (basic?.customFields ?? []).map((field, index) => ({ id: `example-field-${index}`, label: "示例信息", value: field.icon === "Mail" ? "example.mail" : field.icon === "Clock" ? "3年示例经验" : "示例学历与专业", icon: icon(field.icon), visible: field.visible !== false, displayLabel: field.displayLabel === true })),
      githubKey: "", githubUseName: "", githubContributionsVisible: false,
    },
    skillContent: exampleRichText(resume.skillContent), selfEvaluationContent: exampleRichText(resume.selfEvaluationContent),
    experience: (resume.experience ?? []).map((item, index) => ({ id: `example-job-${index}`, company: `示例科技公司 ${index + 1}`, position: "示例岗位", date: "2023/01 - 2025/01", visible: item.visible !== false, details: exampleRichText(item.details) })),
    projects: (resume.projects ?? []).map((item, index) => ({ id: `example-project-${index}`, name: `示例项目 ${index + 1}`, role: item.role ? "示例项目角色" : "", date: "2024/01 - 2025/01", visible: item.visible !== false, description: exampleRichText(item.description), nameStyle: textStyle(item.nameStyle), roleStyle: textStyle(item.roleStyle), link: item.link ? "https://example.com" : undefined, linkLabel: item.linkLabel ? "示例链接" : undefined })),
    education: (resume.education ?? []).map((item, index) => ({ id: `example-school-${index}`, school: "示例大学", major: "示例专业", degree: "示例学位", startDate: "2018-09", endDate: "2022-06", visible: item.visible !== false, gpa: item.gpa ? "0.0" : undefined, description: exampleRichText(item.description) })),
    certificates: (resume.certificates ?? []).map((item, index) => ({ id: `example-certificate-${index}`, url: avatar, width: number(item.width, 30, 1, 100) })),
    customData: Object.fromEntries(customKeys.map(({ old, next }) => [next, (resume.customData[old] ?? []).map((item, index) => ({ id: `example-${next}-${index}`, title: "示例条目", subtitle: item.subtitle ? "示例副标题" : "", dateRange: item.dateRange ? "2024/01 - 2025/01" : "", description: exampleRichText(item.description), visible: item.visible !== false }))])),
    menuSections: (resume.menuSections ?? []).map((item, index) => {
      const knownIds = ["basic", "skills", "experience", "projects", "education", "certificates", "selfEvaluation", "summary"];
      const id = customKeys.find(key => key.old === item.id)?.next ?? (knownIds.includes(item.id) ? item.id : `custom-${index + 1}`);
      const title = ({ basic: "基本信息", skills: "核心技能", experience: "工作经验", projects: "项目经历", education: "教育经历", certificates: "证书", selfEvaluation: "自我评价", summary: "自我评价" } as Record<string, string>)[id] ?? "自定义模块";
      return { id, title, icon: "", enabled: item.enabled === true, order: number(item.order, index, 0, 100) };
    }),
  };
  return { version: 1, renderer: renderer && SAVED_RENDERERS.includes(renderer) ? renderer : undefined, example };
}

/** 新建或示例预览使用模板自带的生成内容；套用模板到真实简历时不调用。 */
export function withTemplateExample(base: ResumeData, definition?: TemplateDefinition): ResumeData {
  const example = definition?.savedPresentation?.example;
  return example ? { ...base, ...JSON.parse(JSON.stringify(example)), id: base.id, title: base.title, createdAt: base.createdAt, updatedAt: base.updatedAt, templateId: definition!.id, styleOverrides: undefined, styleModelVersion: undefined } : base;
}
