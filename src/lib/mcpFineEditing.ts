import type { ResumeData, ResumeTextStyle } from "@/types/resume";
import { newBodySection, parseBodySections, serializeBodySections } from "./bodySections";
import { sanitizeMcpRichText } from "./mcpRichText";
type Args = Record<string, any>;
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
export function resumeItems(resume: ResumeData, args: Args) {
  assert(["projects", "experience", "education", "custom"].includes(args.section), "条目模块不支持");
  if (args.section === "custom") {
    assert(typeof args.sectionId === "string" && Object.hasOwn(resume.customData ?? {}, args.sectionId), "自定义模块不存在");
    return resume.customData[args.sectionId];
  }
  return resume[args.section as "projects"] ?? [];
}
export function itemsPatch(resume: ResumeData, args: Args, items: any[]): Partial<ResumeData> {
  return args.section === "custom" ? { customData: { ...resume.customData, [args.sectionId]: items } } : { [args.section]: items };
}
export function mutateItem(resume: ResumeData, args: Args): Partial<ResumeData> {
  const items = [...resumeItems(resume, args)];
  const index = items.findIndex(item => item.id === args.itemId);
  const fields: Record<string, string[]> = {
    projects:["name","role","date","description","visible","link","linkLabel"],
    experience:["company","position","date","details","visible"],
    education:["school","major","degree","startDate","endDate","description","gpa","visible"],
    custom:["title","subtitle","dateRange","description","visible"],
  };
  const patch = { ...args.patch };
  for (const [key, value] of Object.entries(patch)) {
    assert(fields[args.section].includes(key), `条目字段 ${key} 不支持；样式使用 set_item_style`);
    assert(key === "visible" ? typeof value === "boolean" : typeof value === "string" && value.length <= 200000, `字段 ${key} 类型无效`);
    if (key === "details" || key === "description") patch[key] = sanitizeMcpRichText(value as string);
    if (key === "link" && value) assert(/^https?:\/\//i.test(value as string), "链接只支持 http/https");
  }
  if (args.action === "add") {
    const required: Record<string,string[]> = { projects:["name","role","date","description"], experience:["company","position","date","details"], education:["school","major","degree","startDate","endDate"], custom:["title","subtitle","dateRange","description"] };
    for (const field of required[args.section]) assert(typeof patch[field] === "string", `add 需要 ${field}`);
    items.push({ ...patch, id: crypto.randomUUID(), visible: patch.visible ?? true });
  } else {
    assert(index >= 0, "条目不存在，需要正确 itemId");
    if (args.action === "update") { assert(args.patch && Object.keys(patch).length, "update 需要非空 patch"); items[index] = { ...items[index], ...patch }; }
    else if (args.action === "delete") items.splice(index,1);
    else {
      const target = index + (args.action === "move_up" ? -1 : 1);
      assert(target >= 0 && target < items.length, "条目已经位于边界");
      [items[index], items[target]] = [items[target], items[index]];
    }
  }
  return itemsPatch(resume,args,items);
}
export function bodyTarget(resume: ResumeData, args: Args) {
  if (args.section === "skills" || args.section === "summary") {
    const key = args.section === "skills" ? "skillContent" : "selfEvaluationContent";
    return { html: resume[key], patch: (html: string): Partial<ResumeData> => ({ [key]: html }) };
  }
  const items = resumeItems(resume,args);
  const item = items.find(i => i.id === args.itemId);
  assert(item, "正文条目不存在");
  const field = args.section === "experience" ? "details" : "description";
  return { html: (item as Args)[field] ?? "", patch: (html: string) => itemsPatch(resume,args,items.map(i => i.id === args.itemId ? { ...i, [field]: html } : i)) };
}
export function manageBody(resume: ResumeData, args: Args) {
  const target = bodyTarget(resume,args);
  const sections = parseBodySections(target.html);
  if (args.action === "list") return { sections, updatedAt: resume.updatedAt };
  const index = sections.findIndex(s => s.id === args.bodySectionId);
  if (args.action === "add") sections.push(newBodySection(args.title ?? "", sanitizeMcpRichText(args.content ?? ""), args.inline ?? false));
  else {
    assert(index >= 0,"正文块不存在，需要 list 返回的 bodySectionId");
    if (args.action === "update_title") { assert(typeof args.title === "string","需要 title"); sections[index].title = args.title; }
    else if (args.action === "update_content") { assert(typeof args.content === "string","需要 content"); sections[index].content = sanitizeMcpRichText(args.content); }
    else if (args.action === "set_inline") { assert(typeof args.inline === "boolean","需要 inline"); sections[index].inline = args.inline; }
    else if (args.action === "delete") sections.splice(index,1);
    else {
      const next = index + (args.action === "move_up" ? -1 : 1);
      assert(next >= 0 && next < sections.length,"正文块已位于边界");
      [sections[index],sections[next]] = [sections[next],sections[index]];
    }
  }
  return target.patch(serializeBodySections(sections));
}
export function itemStylePatch(resume: ResumeData, args: Args): Partial<ResumeData> {
  const items = resumeItems(resume,args); assert(items.some(i => i.id === args.itemId), "条目不存在");
  assert(args.reset || args.style && Object.keys(args.style).length, "需要 style 或 reset");
  if (args.target === "name" || args.target === "role") {
    assert(args.section === "projects", "name/role 仅支持项目字段");
    const key = args.target === "name" ? "nameStyle" : "roleStyle";
    return itemsPatch(resume,args,items.map(i => i.id === args.itemId ? { ...i, [key]: args.reset ? undefined : { ...(i as Args)[key], ...args.style } } : i));
  }
  const styles = { ...resume.styleOverrides?.items };
  if (args.reset) delete styles[args.itemId]; else styles[args.itemId] = { ...styles[args.itemId], ...args.style } as ResumeTextStyle;
  return { styleOverrides: { ...resume.styleOverrides, items: styles } };
}
