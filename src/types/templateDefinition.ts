/**
 * 模板定义（TemplateDefinition）
 *
 * 职责边界（非常重要）：
 * - TemplateDefinition **只描述展示规则**：布局、字体、字号、颜色、间距、模块默认样式。
 * - TemplateDefinition **禁止保存真实简历内容**；可携带生成的示例，以保留排版结构。
 * - 内容由 ResumeData 负责，用户手动样式由 ResumeStyleOverrides 负责，三者互相独立。
 *
 * 这样做的好处：
 * 1. 模板可以跨简历复用（公司 A 的模板套到公司 B 的简历上不需要搬运内容）。
 * 2. 切模板只改 templateId，不动 ResumeData，也不会丢失用户排版。
 * 3. 模板可以被序列化导出 / 导入，而不泄漏个人信息。
 */

/** 模板来源：内置 React 模板 / 用户导入的 Schema 模板 */
export type TemplateSource = "builtin-react" | "custom-schema";

/** Word 导出能力：full 完整映射 / basic 简化布局 / unsupported 不支持 */
export type DocxCapability = "full" | "basic" | "unsupported";

/** 模板分类（V1 用字符串宽收，避免以后加分类需要改类型） */
export type TemplateCategory =
  | "professional"
  | "technology"
  | "simple"
  | "creative"
  | "academic"
  | "ats"
  | string;

/** 页面布局模式，V1 只支持单栏 / 双栏 */
export type PageLayoutMode = "single-column" | "two-column";

/** 双栏布局下的栏位键 */
export type ColumnKey = "main" | "side";

/** 模板可渲染的逻辑 Section 键（模板只引用逻辑位置，绝不内联内容） */
export type TemplateSectionKey =
  | "basic"
  | "summary"
  | "skills"
  | "experience"
  | "projects"
  | "education"
  | "certificates"
  | "custom";

export const TEMPLATE_SECTION_KEYS: TemplateSectionKey[] = [
  "basic",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certificates",
  "custom",
];

/** 当前 Schema 版本：schemaVersion 不等于此值时需要 migration 或拒绝导入 */
export const TEMPLATE_SCHEMA_VERSION = 1;

/** ------------------------- Schema 模板包的文件格式 ------------------------- */

/** manifest.json：身份 + 元信息，必须无任何个人信息 */
export interface TemplateManifestDoc {
  schemaVersion: number;
  id: string;
  name: string;
  description?: string;
  category?: TemplateCategory;
  tags?: string[];
}

/** layout.json：页面布局与模块顺序 */
export interface TemplateLayoutDoc {
  schemaVersion?: number;
  /** 布局模式 */
  layout?: PageLayoutMode;
  /** 双栏比例（权重，如 main: 2, side: 1） */
  columns?: Record<ColumnKey, number>;
  /** 模块顺序（用逻辑 key，不含内容） */
  order?: TemplateSectionKey[];
  /** 模块归属哪一栏，two-column 生效 */
  columnAssignment?: Partial<Record<TemplateSectionKey, ColumnKey>>;
  /** BasicInfo 对齐方式 */
  basicLayout?: "left" | "center" | "right";
  /** 页面边距 */
  pagePadding?: number;
}

/** 主题样式（字体 / 字号 / 颜色 / 间距 / 模块默认样式） */
export interface TemplateThemeDoc {
  /** 保存排版的示例快照，只含生成的示例内容，不含用户履历。 */
  savedPresentation?: SavedTemplatePresentation;
  schemaVersion?: number;
  fontFamily?: string;
  baseFontSize?: number;
  headerSize?: number;
  subheaderSize?: number;
  lineHeight?: number;
  colors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    text?: string;
  };
  spacing?: {
    sectionGap?: number;
    itemGap?: number;
    contentPadding?: number;
  };
  sectionStyles?: Record<string, TemplateSectionStyle>;
}

/** theme.json 的实际文件格式 = 主题样式本身 */
export type TemplateThemeFile = TemplateThemeDoc;

/** 单个模块的默认样式 */
export interface TemplateSectionStyle {
  /** 模块标题字号 */
  fontSize?: number;
  /** 模块标题字重，如 400 / 700 */
  fontWeight?: number;
  /** 模块标题颜色 */
  color?: string;
  /** 模块之间间距 */
  spacing?: number;
  /** 模块内条目间距 */
  itemSpacing?: number;
  /** 对齐 */
  align?: "left" | "center" | "right";
  /** 是否显示分隔线 */
  border?: boolean;
  /** 模块背景色（慎用，ATS 模板不要带） */
  background?: string;
}

/** ------------------------- 运行时 TemplateDefinition ------------------------- */

/**
 * 运行时模板定义（Schema 模板可以直接从文件反序列化得到，
 * 内置 React 模板通过 adapter 转换得到，见 src/lib/templateResolver.ts）。
 */
export interface TemplateDefinition {
  savedPresentation?: SavedTemplatePresentation;
  id: string;
  name: string;
  description?: string;
  category?: TemplateCategory;
  tags?: string[];
  source: TemplateSource;
  /** Word 导出能力提示 */
  docxCapability: DocxCapability;

  layout: TemplateLayoutDoc;
  typography: TemplateTypography;
  spacing: TemplateSpacing;
  colors: TemplateColors;
  sectionStyles?: Record<string, TemplateSectionStyle>;

  /** 内置模板专用：真实布局 id，用于 ReactTemplateRenderer 查组件 */
  builtinLayout?: string;
  /** 自定义模板的预览图（dataURL，导入时已限大小） */
  previewImage?: string;
  /** 记录来源文件名，便于冲突提示 */
  importedFrom?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SavedTemplatePresentation {
  version: 1;
  /** 复用原有 React 布局，避免保存后悄悄换成另一套布局。 */
  renderer?: string;
  example: import("./resume").ResumeData;
}

export interface TemplateTypography {
  fontFamily?: string;
  baseFontSize?: number;
  headerSize?: number;
  subheaderSize?: number;
  lineHeight?: number;
}

export interface TemplateSpacing {
  sectionGap?: number;
  itemGap?: number;
  contentPadding?: number;
}

export interface TemplateColors {
  primary?: string;
  secondary?: string;
  background?: string;
  text?: string;
}

/** 导入/导出用的完整模板包（纯展示资产，不含简历内容） */
export interface TemplatePackage {
  manifest: TemplateManifestDoc;
  layout: TemplateLayoutDoc;
  theme: TemplateThemeDoc;
  preview?: string;
}
