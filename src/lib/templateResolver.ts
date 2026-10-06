/**
 * 模板解析器：把「内置 React 模板」和「用户导入的 Schema 模板」统一成 TemplateDefinition。
 *
 * 之所以要这一层：
 * - 旧的内置模板是 9 份写死的 config.ts + 72 个手写 Section 组件（= 代码，用户无法导入）。
 * - 新的 Schema 模板是纯数据（manifest + layout + theme）。
 * - 有了统一的定义层，上层的 Style Resolver / Schema Renderer / DOCX Export 只需要认识
 *   TemplateDefinition 一种形态，不需要关心模板来自哪里。
 */
import { DEFAULT_TEMPLATES } from "@/components/templates/registry";
import type { ResumeTemplate } from "@/types/template";
import type {
  DocxCapability,
  TemplateDefinition,
} from "@/types/templateDefinition";

/**
 * Word 导出能力分级：
 * 时间轴 / 大背景 / 自由定位类模板无法 1:1 映射到 DOCX 段落模型，
 * 标记为 basic，导出时走简化布局并提示用户，而不是硬凑一个不可编辑的伪 Word。
 */
const FULL_DOCX_TEMPLATES = new Set(["classic", "minimalist"]);

/** 内置模板 config（ResumeTemplate）→ 统一 TemplateDefinition */
export function builtinToDefinition(config: ResumeTemplate): TemplateDefinition {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    source: "builtin-react",
    docxCapability: (FULL_DOCX_TEMPLATES.has(config.id)
      ? "full"
      : "basic") as DocxCapability,
    layout: {
      layout: config.layout === "left-right" ? "two-column" : "single-column",
      order: ["basic", "summary", "skills", "experience", "projects", "education", "certificates", "custom"],
      basicLayout: config.basic?.layout ?? "left",
      // 全部用可选链：内置 config 数据不全时不能让整条渲染链崩掉
      pagePadding: config.spacing?.contentPadding,
    },
    typography: { baseFontSize: 16, headerSize: 18, subheaderSize: 16, lineHeight: 1.5 },
    spacing: {
      sectionGap: config.spacing?.sectionGap,
      itemGap: config.spacing?.itemGap,
      contentPadding: config.spacing?.contentPadding,
    },
    colors: { ...(config.colorScheme ?? {}) },
    sectionStyles: { default: { border: config.id === "classic" } },
    builtinLayout: config.layout,
  };
}

/**
 * 惰性求值的内置模板 Definition 列表。
 * 与 templateCatalog 同理：registry → 模板组件 → store 存在循环依赖，
 * 不能在模块求值阶段直接 map，否则 Node ESM 下会 TDZ。
 */
let definitionsCache: TemplateDefinition[] | null = null;

export function builtinTemplateDefinitions(): TemplateDefinition[] {
  if (!definitionsCache) definitionsCache = DEFAULT_TEMPLATES.map(builtinToDefinition);
  return definitionsCache;
}

export function getBuiltinDefinition(id: string): TemplateDefinition | undefined {
  return builtinTemplateDefinitions().find((item) => item.id === id);
}

/**
 * 按 id 解析模板定义：先查用户模板，找不到再查内置。
 * 用户模板优先，允许用户用自定义模板覆盖同名内置模板的展示规则（内容仍然隔离）。
 */
export function resolveTemplateDefinition(
  id: string | null | undefined,
  customTemplates: TemplateDefinition[] = []
): TemplateDefinition | undefined {
  if (!id) return undefined;
  return (
    customTemplates.find((item) => item.id === id) ?? getBuiltinDefinition(id)
  );
}
