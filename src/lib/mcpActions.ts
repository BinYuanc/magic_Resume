import { useResumeStore } from "@/store/useResumeStore";
import { useCustomTemplateStore } from "@/store/useCustomTemplateStore";
import { clearHistoryGroup } from "@/store/resumeHistory";
import { listTemplateViews } from "./templateCatalog";
import { resolveTemplateDefinition } from "./templateResolver";
import { templateDefaultSettings } from "./resumePresentation";
import { buildTemplatePackage, parseTemplatePackage } from "./templateSchema";
import { buildTemplateFromResume } from "./templateSave";
import { mcpTemplateGuide } from "./mcpTemplateGuide";
import { formatMcpRichText, sanitizeMcpRichText } from "./mcpRichText";
import { colorToHex } from "./color";
import type { ResumeData } from "@/types/resume";
// JS 清单与本地 stdio 服务共用；不引入 server.mjs 到浏览器。
import { tools, validate } from "../../mcp/tools.mjs";

type Args = Record<string, any>;
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const string = (value: unknown, name: string) => { assert(typeof value === "string" && value.length <= 200000, `${name} 必须是字符串，长度不超过200000`); return value as string; };
const checkTree = (value: unknown, depth = 0) => {
  assert(depth <= 20, "对象嵌套过深");
  if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    assert(!["__proto__", "constructor", "prototype"].includes(key), "不允许的对象字段"); checkTree(item, depth + 1);
  }
};
const resultResume = (resumeId: string) => ({ ...useResumeStore.getState().resumes[resumeId], workbenchUrl: `/app/workbench/${resumeId}` });
const update = (resume: ResumeData, patch: Partial<ResumeData>) => {
  // 每次 MCP 调用是一项独立撤销记录，避免同一秒内多个写操作被合并。
  clearHistoryGroup(resume.id);
  useResumeStore.getState().updateResume(resume.id, patch);
  return resultResume(resume.id);
};

function sanitizePatch(raw: Args, resume: ResumeData): Partial<ResumeData> {
  const allowed = new Set(["title", "basic", "education", "experience", "projects", "certificates", "customData", "skillContent", "selfEvaluationContent", "menuSections"]);
  const patch: Args = structuredClone(raw);
  for (const key of Object.keys(patch)) assert(allowed.has(key), `patch.${key} 不允许；排版使用 set_resume_style，模板使用 apply_template`);
  for (const key of ["title", "skillContent", "selfEvaluationContent"]) if (key in patch) {
    patch[key] = string(patch[key], key);
    if (key !== "title") patch[key] = sanitizeMcpRichText(patch[key]);
  }
  if ("basic" in patch) {
    assert(patch.basic && typeof patch.basic === "object" && !Array.isArray(patch.basic), "basic 必须是对象");
    const simple = new Set(["name", "title", "email", "phone", "location", "birthDate", "employementStatus", "githubKey", "githubUseName"]);
    for (const [key, value] of Object.entries(patch.basic)) {
      assert(simple.has(key), `basic.${key} 暂不支持通过 MCP 修改`); string(value, key);
    }
    patch.basic = { ...resume.basic, ...patch.basic };
  }
  const arrays: Record<string, string[]> = { experience: ["id", "company", "position", "date", "details"], projects: ["id", "name", "role", "date", "description"], education: ["id", "school", "major", "degree", "startDate", "endDate"] };
  for (const [key, required] of Object.entries(arrays)) if (key in patch) {
    validateItems(patch[key], required, key);
    for (const item of patch[key]) {
      const field = key === "experience" ? "details" : "description";
      if (item[field] !== undefined) item[field] = sanitizeMcpRichText(string(item[field], field));
      if (key === "projects" && item.link) { assert(/^https?:\/\//i.test(item.link), "项目链接只支持 http/https"); }
    }
  }
  if ("customData" in patch) {
    assert(patch.customData && typeof patch.customData === "object" && !Array.isArray(patch.customData), "customData 必须是对象");
    for (const [key, items] of Object.entries(patch.customData)) {
      validateItems(items, ["id", "title", "subtitle", "dateRange", "description"], key);
      for (const item of items as Args[]) item.description = sanitizeMcpRichText(item.description);
    }
  }
  if ("certificates" in patch) {
    validateItems(patch.certificates, ["id", "url"], "certificates");
    for (const item of patch.certificates) {
      assert(/^https?:\/\/|^data:image\/(?:png|jpeg|webp);base64,/i.test(item.url), "证书只支持 http/https 或栅格图片 data URL");
      assert(typeof item.width === "number" && item.width >= 1 && item.width <= 100, "证书宽度必须1–100");
    }
  }
  if ("menuSections" in patch) {
    validateItems(patch.menuSections, ["id", "title", "icon"], "menuSections");
    for (const item of patch.menuSections) assert(typeof item.enabled === "boolean" && Number.isFinite(item.order), "模块需要 enabled 与 order");
  }
  return patch;
}
function validateItems(value: unknown, required: string[], name: string): asserts value is Args[] {
  assert(Array.isArray(value) && value.length <= 100, `${name} 必须是最多100条的数组`);
  const ids = new Set();
  for (const item of value) {
    assert(item && typeof item === "object" && !Array.isArray(item), `${name} 条目必须是对象`);
    for (const key of required) string(item[key], `${name}.${key}`);
    assert(item.id && !ids.has(item.id), `${name} 条目 id 为空或重复`); ids.add(item.id);
    if (item.visible !== undefined) assert(typeof item.visible === "boolean", "visible 必须布尔值");
  }
}

function parsePackage(raw: Args) {
  assert(raw && typeof raw === "object", "package 必须是对象");
  return parseTemplatePackage({ manifest: JSON.stringify(raw.manifest), layout: JSON.stringify(raw.layout), theme: JSON.stringify(raw.theme) });
}

export function executeMcpAction(name: string, args: Args): unknown {
  const descriptor = tools.find((tool: { name: string }) => tool.name === name);
  assert(descriptor && name !== "get_connection_info", "不支持的网页操作");
  validate(args, descriptor.inputSchema); checkTree(args);
  assert(JSON.stringify(args).length <= 2 * 1024 * 1024, "操作参数超过2MB");
  const store = useResumeStore.getState();
  const templateStore = useCustomTemplateStore.getState();
  const views = listTemplateViews(templateStore.templates);
  if (name === "list_resumes") return Object.values(store.resumes).map(({ id, title, templateId, updatedAt }) => ({ id, title, templateId, updatedAt }));
  if (name === "get_template_schema") return mcpTemplateGuide;
  if (name === "list_templates") return views.map((view) => resolveTemplateDefinition(view.id, templateStore.templates));
  if (name === "create_template" || name === "update_template") {
    const definition = parsePackage(args.package);
    const previous = templateStore.templates.find((item) => item.id === args.templateId);
    if (name === "create_template") assert(!views.some((item) => item.id === definition.id), "模板 id 已存在，请换一个 id");
    else { assert(previous && definition.id === previous.id, "只能更新已有自定义模板，且 id 不能变"); assert(args.expectedUpdatedAt === previous.updatedAt, "模板已修改，请重新读取版本"); }
    const next = { ...definition, createdAt: previous?.createdAt ?? definition.createdAt };
    templateStore.upsertTemplate(next);
    return { template: templateStore.getTemplate(next.id), templatesUrl: "/app/dashboard/templates" };
  }
  if (name === "create_resume") {
    assert(views.some((item) => item.id === args.templateId), "模板不存在");
    const id = store.createResume(args.templateId, true);
    return update(useResumeStore.getState().resumes[id], { title: args.title });
  }
  const resume = store.resumes[args.resumeId];
  assert(resume, "简历不存在；先 list_resumes");
  if (name === "get_resume") return resultResume(resume.id);
  if (name === "save_resume_as_template") {
    const definition = buildTemplateFromResume(resume, { name: args.name, description: args.description });
    const normalized = parsePackage(buildTemplatePackage(definition));
    templateStore.addTemplate(normalized);
    return { template: normalized, templatesUrl: "/app/dashboard/templates" };
  }
  assert(resume.updatedAt === args.expectedUpdatedAt, "简历已被修改，请重新 get_resume 后合并新内容，不要覆盖用户修改");
  if (name === "update_resume") return update(resume, sanitizePatch(args.patch, resume));
  if (name === "set_resume_style") {
    if (args.settings.themeColor) assert(colorToHex(args.settings.themeColor), "主题颜色无效");
    const global = { ...resume.styleOverrides?.global };
    for (const [key, value] of Object.entries(args.settings)) (global as Args)[key === "paragraphSpacing" ? "itemSpacing" : key] = value;
    return update(resume, { globalSettings: { ...resume.globalSettings, ...args.settings }, styleOverrides: { ...resume.styleOverrides, global } });
  }
  if (name === "apply_template") {
    const definition = resolveTemplateDefinition(args.templateId, templateStore.templates);
    assert(definition && views.some((item) => item.id === args.templateId), "模板不存在");
    return update(resume, args.preserveOverrides ? { templateId: args.templateId } : {
      templateId: args.templateId, styleOverrides: undefined,
      globalSettings: templateDefaultSettings(definition, resume.globalSettings), basic: { ...resume.basic, layout: definition.layout.basicLayout ?? "left" },
    });
  }
  if (name === "undo_resume_change") {
    assert(store.history[resume.id]?.length, "没有可撤销操作");
    const active = store.activeResumeId;
    store.setActiveResume(resume.id); useResumeStore.getState().undo();
    if (active && active !== resume.id) useResumeStore.getState().setActiveResume(active);
    return resultResume(resume.id);
  }
  if (name === "format_rich_text") {
    assert(args.indent !== undefined || args.fontSize !== undefined || args.align, "至少指定一种排版参数");
    if (args.section === "skills" || args.section === "summary") {
      const key = args.section === "skills" ? "skillContent" : "selfEvaluationContent";
      return update(resume, { [key]: formatMcpRichText(resume[key], args) });
    }
    const key = args.section === "custom" ? "customData" : args.section;
    const items = key === "customData" ? resume.customData[args.sectionId] : (resume as unknown as Args)[key];
    assert(Array.isArray(items) && items.some((item: Args) => item.id === args.itemId), "正文条目不存在，需要正确的 itemId / sectionId");
    const field = key === "experience" ? "details" : "description";
    const next = items.map((item: Args) => item.id === args.itemId ? { ...item, [field]: formatMcpRichText(item[field] ?? "", args) } : item);
    return update(resume, key === "customData" ? { customData: { ...resume.customData, [args.sectionId]: next } } : { [key]: next });
  }
  throw new Error("未知操作");
}
