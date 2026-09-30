/**
 * 「保存当前排版为模板」：把用户当前简历的排版参数固化成 TemplateDefinition。
 *
 * 铁律（对应方案第十二 / 十三节）：
 * - 只保存 Presentation（布局 / 字号 / 颜色 / 间距），**绝不保存姓名 / 公司 / 项目等简历内容**。
 * - 导出的定义在落库前会跑 findPersonalContent 反向体检，双保险。
 */
import type { ResumeData } from "@/types/resume";
import type {
  PageLayoutMode,
  TemplateDefinition,
  TemplateSectionKey,
} from "@/types/templateDefinition";
import { findTemplateView } from "./templateCatalog";
import { builtinToDefinition } from "./templateResolver";
import { resolveResumeStyle, resolveSectionStyle } from "./resumeStyle";
import { TEMPLATE_SECTION_KEYS } from "@/types/templateDefinition";
import { resumeSectionOrder } from "./resumePresentation";
import { listTemplateViews } from "./templateCatalog";
import { useCustomTemplateStore, makeUniqueTemplateId } from "@/store/useCustomTemplateStore";

export interface SaveAsTemplateOptions {
  /** 模板名称（必填，弹窗收集） */
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  /** 三项内容勾选（默认全 true） */
  includeColors?: boolean;
  includeFonts?: boolean;
  includeSpacing?: boolean;
}

/**
 * 从一份简历的「最终生效样式」生成模板定义。
 * 注意读取的是 resolveResumeStyle 的合成结果（用户覆盖已生效），
 * 而不是原始 globalSettings —— 保存的模板 = 用户现在看到的样子。
 */
export function buildTemplateFromResume(
  resume: ResumeData,
  options: SaveAsTemplateOptions
): TemplateDefinition {
  const customTemplates = useCustomTemplateStore.getState().templates;
  const currentView = findTemplateView(resume.templateId, customTemplates);
  const currentDefinition =
    customTemplates.find((item) => item.id === resume.templateId) ??
    builtinToDefinition(currentView);

  // 现在页面上真实生效的样式（三层合成后的结果）
  const effective = resolveResumeStyle(
    currentDefinition,
    resume.styleOverrides,
    resume.globalSettings
  );

  const includeColors = options.includeColors !== false;
  const includeFonts = options.includeFonts !== false;
  const includeSpacing = options.includeSpacing !== false;

  const layout: PageLayoutMode =
    currentDefinition?.layout.layout === "two-column" ? "two-column" : "single-column";

  const definition: TemplateDefinition = {
    id: makeUniqueTemplateId(slugify(options.name) || "my-template", listTemplateViews(customTemplates)),
    name: options.name.trim().slice(0, 60),
    description: options.description?.trim().slice(0, 300),
    category: options.category,
    tags: options.tags?.slice(0, 10),
    source: "custom-schema",
    docxCapability: layout === "single-column" ? "full" : "basic",
    layout: {
      layout,
      order: resumeSectionOrder(resume, currentDefinition),
      columnAssignment: currentDefinition?.layout.columnAssignment,
      columns: currentDefinition?.layout.columns,
      basicLayout: resume.basic?.layout ?? "left",
      pagePadding: includeSpacing ? effective.pagePadding : undefined,
    },
    typography: includeFonts
      ? {
          fontFamily: effective.fontFamily,
          baseFontSize: effective.baseFontSize,
          headerSize: effective.headerSize,
          subheaderSize: effective.subheaderSize,
          lineHeight: effective.lineHeight,
        }
      : {},
    spacing: includeSpacing
      ? {
          sectionGap: effective.sectionSpacing,
          itemGap: effective.itemSpacing,
          contentPadding: effective.pagePadding,
        }
      : {},
    colors: includeColors
      ? {
          primary: effective.themeColor,
          text: effective.textColor,
          secondary: effective.secondaryColor,
          background: effective.background,
        }
      : {},
    // 模块级条目间距（项目条目间距等）也属于排版资产；类型形状兼容（都只有数值/布尔可选字段）
    sectionStyles: Object.fromEntries(TEMPLATE_SECTION_KEYS.map((key) => {
      const resolved = resolveSectionStyle(currentDefinition, resume.styleOverrides, resume.globalSettings, key, effective);
      return [key, {
        ...(includeFonts ? { fontSize: resolved.fontSize, fontWeight: resolved.fontWeight } : {}),
        ...(includeColors ? { color: resolved.color, background: resolved.background } : {}),
        ...(includeSpacing ? { spacing: resolved.spacing, itemSpacing: resolved.itemSpacing } : {}),
        align: resolved.align, border: resolved.border,
      }];
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return definition;
}

/** 名称 → 合法模板 id：只留字母数字和 - */
function slugify(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    // 模板 id 必须以字母或数字开头（见 templateSchema.validateId），"-"/"_" 开头都会被拒
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+$/g, "")
    .slice(0, 40);
  if (ascii.length >= 3) return ascii;
  // 中文名等场景：用时间戳保证唯一且合法
  return `my-template-${Date.now().toString(36)}`;
}
