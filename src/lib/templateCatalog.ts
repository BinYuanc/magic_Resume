/**
 * 模板目录：把「内置 React 模板」和「用户自定义模板」合并成同一个视图供 UI 使用。
 *
 * 为什么需要它：
 * 全项目有 10 多处 `DEFAULT_TEMPLATES.find(id => id === templateId)`，
 * 如果每处都要为新加的用户模板改一遍，既易漏又会破坏旧逻辑。
 * 这里统一提供一个 TemplateView（形状 = 旧 ResumeTemplate），
 * 老代码零改动就能认识自定义模板。
 */
import { DEFAULT_TEMPLATES } from "@/components/templates/registry";
import type { ResumeTemplate } from "@/types/template";
import type { TemplateDefinition } from "@/types/templateDefinition";
import { SYSTEM_FALLBACK_STYLE } from "./resumeStyle";

/**
 * 惰性取内置模板列表。
 * 注意：registry → 模板组件 → useResumeStore → 本文件 存在循环依赖，
 * 所以这里**绝不能在模块求值阶段解引用 DEFAULT_TEMPLATES**（会触发 TDZ 报错），
 * 只在函数真正被调用时才访问。
 */
let builtinCache: ResumeTemplate[] | null = null;
function builtinTemplates(): ResumeTemplate[] {
  if (!builtinCache) builtinCache = DEFAULT_TEMPLATES;
  return builtinCache;
}

const FALLBACK_ID = "classic";

/**
 * 把 TemplateDefinition 投影成 ResumeTemplate 视图。
 * 注意：真实渲染由 templates/index.tsx 按 id 判断走 React 分支还是 Schema 分支，
 * 这里的 layout / colorScheme 只用于 UI 展示与样式兜底。
 */
export function definitionToTemplateView(
  definition: TemplateDefinition
): ResumeTemplate {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description ?? "",
    thumbnail: "",
    // 自定义 Schema 模板没有 React 组件；给一个稳定的 layout 值避免旧代码取不到分支
    layout: definition.builtinLayout ?? (definition.layout.layout === "two-column" ? "left-right" : "classic"),
    colorScheme: {
      primary: definition.colors?.primary ?? SYSTEM_FALLBACK_STYLE.themeColor,
      secondary: definition.colors?.secondary ?? "#4b5563",
      background: definition.colors?.background ?? SYSTEM_FALLBACK_STYLE.background,
      text: definition.colors?.text ?? SYSTEM_FALLBACK_STYLE.textColor,
    },
    spacing: {
      sectionGap: definition.spacing?.sectionGap ?? SYSTEM_FALLBACK_STYLE.sectionSpacing,
      itemGap: definition.spacing?.itemGap ?? SYSTEM_FALLBACK_STYLE.itemSpacing,
      // 只声明 layout.pagePadding 的模板也要能生效（旧 UI 路径从这里读 contentPadding）
      contentPadding: definition.spacing?.contentPadding ?? definition.layout?.pagePadding ?? SYSTEM_FALLBACK_STYLE.pagePadding,
    },
    basic: {
      layout: definition.layout?.basicLayout ?? "left",
    },
    // 侧栏 STANDARD_MODULES 仍以 selfEvaluation 为 id，这里投影回旧 id，否则自定义模板
    // 的「自我评价」在模块列表里找不到对应项，用户无法重新添加
    availableSections: definition.layout?.order?.map((key) => (key === "summary" ? "selfEvaluation" : key)),
  };
}

/** 全部模板视图（内置在前，用户模板在后） */
export function listTemplateViews(customTemplates: TemplateDefinition[] = []): ResumeTemplate[] {
  return [...builtinTemplates(), ...customTemplates.map(definitionToTemplateView)];
}

/** 按 id 查模板视图，查不到时回退到经典模板（保持旧行为） */
export function findTemplateView(
  templateId: string | null | undefined,
  customTemplates: TemplateDefinition[] = []
): ResumeTemplate {
  const all = listTemplateViews(customTemplates);
  return (
    all.find((template) => template.id === templateId) ??
    builtinTemplates().find((template) => template.id === FALLBACK_ID) ??
    builtinTemplates()[0]
  );
}

/** 判断某个 id 是否为用户自定义模板 */
export function isCustomTemplateId(
  templateId: string | null | undefined,
  customTemplates: TemplateDefinition[] = []
): boolean {
  if (!templateId) return false;
  return customTemplates.some((template) => template.id === templateId);
}
