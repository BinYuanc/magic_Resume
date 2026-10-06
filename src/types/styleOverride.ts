/**
 * ResumeStyleOverrides（用户手动样式覆盖层）
 *
 * 职责边界：
 * - ResumeData 存内容；TemplateDefinition 存模板默认展示规则；这里存 **用户主动做的排版调整**。
 * - 正因为把「用户覆盖」和「模板默认」拆开，切换模板时才有得选：
 *     保留我的排版调整  → StyleOverrides 不动
 *     使用模板默认排版  → 只清 StyleOverrides / 更新展示开关，绝不碰 ResumeData 内容
 *
 * 所有字段一律可选：旧简历读取时由 styleMigration 将旧 globalSettings 样式迁入；新简历空覆盖走模板默认。
 */
import type { TemplateSectionStyle } from "./templateDefinition";

/** 全局级覆盖 */
export interface GlobalStyleOverride {
  fontFamily?: string;
  baseFontSize?: number;
  lineHeight?: number;
  pagePadding?: number;
  /** 模块间距 */
  sectionSpacing?: number;
  /** 段落 / 条目间距 */
  itemSpacing?: number;
  headerSize?: number;
  subheaderSize?: number;
  themeColor?: string;
}

/** 模块级覆盖（key 用逻辑 section key，如 projects / experience） */
export interface SectionStyleOverride extends TemplateSectionStyle {
  /** 该模块是否被隐藏（未来可用，UI 暂不暴露） */
  hidden?: boolean;
}

/** 局部级覆盖：单条 item（如某个 Project / Experience 的 id） */
export interface ItemStyleOverride {
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/**
 * 优先级链条（高 → 低）：
 *   用户局部 Item Override
 * → 用户模块 Section Override
 * → 用户 Global Override
 * → TemplateDefinition 默认
 * → 系统 Fallback
 */
export interface ResumeStyleOverrides {
  global?: GlobalStyleOverride;
  sections?: Record<string, SectionStyleOverride>;
  items?: Record<string, ItemStyleOverride>;
}
