/**
 * resolveResumeStyle —— Web / PDF / DOCX **共用**的唯一样式出口。
 *
 * 背景：改造前模板 Section 里散落 268 处 `globalSettings?.xxx || 数字` 硬编码回退，
 * 导致 Web 一套逻辑、PDF 一套、以后 DOCX 还会再有一套。这个文件把三层优先级收敛到一处：
 *
 *   用户局部 Item Override
 * → 用户模块 Section Override
 * → 用户 Global Override（styleOverrides.global；legacy 参数仅供未迁移数据/展示投影兼容）
 * → TemplateDefinition 默认
 * → 系统 Fallback
 */
import type {
  TemplateDefinition,
  TemplateSectionStyle,
} from "@/types/templateDefinition";
import type {
  GlobalStyleOverride,
  ItemStyleOverride,
  ResumeStyleOverrides,
  SectionStyleOverride,
} from "@/types/styleOverride";
import type { GlobalSettings } from "@/types/resume";

/** 系统最终兜底值：任何一层都没有时用它，保证渲染永不出现 undefinedpx */
export const SYSTEM_FALLBACK_STYLE = {
  fontFamily: "Inter, system-ui, sans-serif",
  baseFontSize: 14,
  headerSize: 18,
  subheaderSize: 16,
  lineHeight: 1.5,
  pagePadding: 32,
  sectionSpacing: 10,
  itemSpacing: 12,
  themeColor: "#000000",
  textColor: "#212529",
  background: "#ffffff",
} as const;

export interface ResolvedResumeStyle {
  fontFamily: string;
  baseFontSize: number;
  headerSize: number;
  subheaderSize: number;
  lineHeight: number;
  pagePadding: number;
  sectionSpacing: number;
  itemSpacing: number;
  themeColor: string;
  secondaryColor: string;
  textColor: string;
  background: string;
}

/**
 * 解析全局最终样式。
 * @param definition 模板定义（提供默认值）
 * @param overrides  用户覆盖层（可选，旧简历没有）
 * @param legacy     旧的 resume.globalSettings（可选，仅作未迁移数据适配）
 */
export function resolveResumeStyle(
  definition: Pick<
    TemplateDefinition,
    "typography" | "spacing" | "colors"
  > & { layout?: TemplateDefinition["layout"] } | undefined,
  overrides?: ResumeStyleOverrides,
  legacy?: GlobalSettings
): ResolvedResumeStyle {
  const globalOverride: GlobalStyleOverride = overrides?.global ?? {};
  const fallback = SYSTEM_FALLBACK_STYLE;

  return {
    fontFamily:
      globalOverride.fontFamily ??
      legacy?.fontFamily ??
      definition?.typography?.fontFamily ??
      fallback.fontFamily,
    baseFontSize:
      globalOverride.baseFontSize ??
      legacy?.baseFontSize ??
      definition?.typography?.baseFontSize ??
      fallback.baseFontSize,
    headerSize:
      globalOverride.headerSize ??
      legacy?.headerSize ??
      definition?.typography?.headerSize ??
      fallback.headerSize,
    subheaderSize:
      globalOverride.subheaderSize ??
      legacy?.subheaderSize ??
      definition?.typography?.subheaderSize ??
      fallback.subheaderSize,
    lineHeight:
      globalOverride.lineHeight ??
      legacy?.lineHeight ??
      definition?.typography?.lineHeight ??
      fallback.lineHeight,
    pagePadding:
      globalOverride.pagePadding ??
      legacy?.pagePadding ??
      definition?.spacing?.contentPadding ??
      definition?.layout?.pagePadding ??
      fallback.pagePadding,
    sectionSpacing:
      globalOverride.sectionSpacing ??
      legacy?.sectionSpacing ??
      definition?.spacing?.sectionGap ??
      fallback.sectionSpacing,
    itemSpacing:
      globalOverride.itemSpacing ??
      legacy?.paragraphSpacing ??
      definition?.spacing?.itemGap ??
      fallback.itemSpacing,
    themeColor:
      globalOverride.themeColor ??
      legacy?.themeColor ??
      definition?.colors?.primary ??
      fallback.themeColor,
    secondaryColor: definition?.colors?.secondary ?? "#4b5563",
    textColor: definition?.colors?.text ?? fallback.textColor,
    background: definition?.colors?.background ?? fallback.background,
  };
}

/** 解析某个模块的样式（标题字号 / 颜色 / 字重 / 间距 / 条目间距） */
export function resolveSectionStyle(
  definition: Pick<TemplateDefinition, "sectionStyles"> | undefined,
  overrides: ResumeStyleOverrides | undefined,
  legacy: GlobalSettings | undefined,
  sectionKey: string,
  base: Pick<ResolvedResumeStyle, "subheaderSize" | "sectionSpacing" | "itemSpacing" | "themeColor"> & { headerSize?: number }
): Required<Pick<TemplateSectionStyle, "fontSize" | "color" | "fontWeight" | "spacing" | "itemSpacing">> & {
  align: "left" | "center" | "right";
  border: boolean;
  background?: string;
  hidden: boolean;
} {
  const templateSection: TemplateSectionStyle = {
    ...(definition?.sectionStyles?.default ?? {}),
    ...(definition?.sectionStyles?.[sectionKey] ?? {}),
  };
  const alias = sectionKey === "summary" ? "selfEvaluation" : sectionKey;
  const overrideSection: SectionStyleOverride =
    overrides?.sections?.[sectionKey] ?? overrides?.sections?.[alias] ?? {};
  const legacySection = legacy?.sectionStyles?.[
    sectionKey as keyof NonNullable<GlobalSettings["sectionStyles"]>
  ] as { itemSpacing?: number } | undefined;

  return {
    fontSize:
      overrideSection.fontSize ?? overrides?.global?.headerSize ?? legacy?.headerSize ?? templateSection.fontSize ?? base.headerSize ?? base.subheaderSize,
    color: overrideSection.color ?? overrides?.global?.themeColor ?? legacy?.themeColor ?? templateSection.color ?? base.themeColor,
    fontWeight:
      overrideSection.fontWeight ?? templateSection.fontWeight ?? 700,
    spacing:
      overrideSection.spacing ?? overrides?.global?.sectionSpacing ?? legacy?.sectionSpacing ?? templateSection.spacing ?? base.sectionSpacing,
    itemSpacing:
      overrideSection.itemSpacing ??
      legacySection?.itemSpacing ??
      overrides?.global?.itemSpacing ??
      legacy?.paragraphSpacing ??
      templateSection.itemSpacing ??
      base.itemSpacing,
    align: overrideSection.align ?? templateSection.align ?? "left",
    border: overrideSection.border ?? templateSection.border ?? false,
    background: overrideSection.background ?? templateSection.background,
    hidden: overrideSection.hidden ?? false,
  };
}

/** 解析单条 item 的局部样式（返回 undefined 表示该维度应继承上层） */
export function resolveItemStyle(
  overrides: ResumeStyleOverrides | undefined,
  itemId: string
): ItemStyleOverride {
  return overrides?.items?.[itemId] ?? {};
}
