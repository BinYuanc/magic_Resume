const RESERVED_CONTENT_KEYS = new Set([
  "basic",
  "experience",
  "projects",
  "education",
  "certificates",
  "customData",
  "menuSections",
  "skillContent",
  "selfEvaluationContent",
]);
import { colorToHex } from "./color";
import { buildTemplateExample, SAVED_RENDERERS } from "./templateExample";

/**
 * 自定义模板 Schema 校验 + 安全检查 + 包转换。
 *
 * 设计约束（来自模板自由度改造方案）：
 * 1. 模板**绝不能获得代码执行能力**：不 eval、不 new Function、不允许脚本/事件属性/外部资源。
 * 2. 导入失败必须说人话：JSON 非法 / schemaVersion 不支持 / 字段缺失 / ID 冲突 / 资源损坏。
 * 3. 模板里禁止出现个人信息，导出时再做一次反向体检。
 */
import {
  TEMPLATE_SCHEMA_VERSION,
  TEMPLATE_SECTION_KEYS,
  type TemplateDefinition,
  type TemplateLayoutDoc,
  type TemplateManifestDoc,
  type TemplatePackage,
  type TemplateSectionStyle,
  type TemplateSectionKey,
  type TemplateThemeDoc,
} from "@/types/templateDefinition";

export const TEMPLATE_LIMITS = {
  /** 整包大小上限 */
  zipBytes: 5 * 1024 * 1024,
  /** 单个 JSON 上限 */
  jsonBytes: 512 * 1024,
  /** 预览图上限 */
  imageBytes: 1024 * 1024,
  /** 名称长度 */
  nameLength: 60,
  /** 标签数量 */
  tagCount: 10,
} as const;

export type TemplateImportErrorCode =
  | "INVALID_ZIP"
  | "MISSING_FILE"
  | "INVALID_JSON"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "MISSING_FIELD"
  | "INVALID_FIELD"
  | "FORBIDDEN_CONTENT"
  | "RESOURCE_TOO_LARGE"
  | "ID_CONFLICT";

export class TemplateImportError extends Error {
  code: TemplateImportErrorCode;
  constructor(code: TemplateImportErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "TemplateImportError";
  }
}

/** 危险内容特征：命中即拒绝导入 */
const FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /<\s*script/i, label: "script 标签" },
  { pattern: /<\s*iframe/i, label: "iframe 标签" },
  { pattern: /\bon[a-z]+\s*=/i, label: "HTML 事件属性" },
  { pattern: /javascript:/i, label: "javascript: 协议" },
  { pattern: /\beval\s*\(/i, label: "eval 调用" },
  { pattern: /new\s+Function/i, label: "new Function 调用" },
  { pattern: /import\s*\(/i, label: "动态 import" },
  { pattern: /require\s*\(/i, label: "require 调用" },
];

/** 个人信息特征：模板文件里出现即视为污染 */
const PERSONAL_HINTS: { pattern: RegExp; label: string }[] = [
  { pattern: /@/, label: "邮箱" },
  { pattern: /1[3-9](?:[\s-]?\d){9}/, label: "手机号" },
  { pattern: /姓名|出生日期|手机号|联系方式/, label: "个人信息标签" },
];

/**
 * 中文姓名检测（启发式）：
 * 模板名/描述里的中文名词（如"专业模板"）不能误伤，所以只检查以下强信号：
 * 2~4 个汉字的孤立字符串，出现在 name 字段且不是常见模板用语。
 */
const TEMPLATE_NAME_WHITELIST = new Set([
  "模板", "简历", "专业", "简约", "经典", "优雅", "创意", "极简", "技术", "学术",
  "双栏", "单栏", "两栏", "画报", "时间轴", "工程师", "岗位", "通用", "定制", "默认",
]);
const CHINESE_NAME_PATTERN = /^[\u4e00-\u9fa5]{2,4}$/;
function looksLikeChinesePersonName(value: string): boolean {
  if (!CHINESE_NAME_PATTERN.test(value)) return false;
  // 包含白名单词的多字串（如"专业模板"）不算人名（Array.from 兼容无 downlevelIteration 的编译目标）
  const words = Array.from(TEMPLATE_NAME_WHITELIST);
  for (const word of words) {
    if (value.includes(word)) return false;
  }
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scanForbiddenString(value: unknown, fieldPath: string): void {
  if (typeof value !== "string") return;
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(value)) {
      throw new TemplateImportError(
        "FORBIDDEN_CONTENT",
        `字段 ${fieldPath} 包含不允许的内容（${label}），已阻止导入以保证安全`
      );
    }
  }
}

/** 递归检查：所有字符串都不允许携带可执行特征 */
function assertNoCodeDeep(value: unknown, fieldPath: string): void {
  if (typeof value === "string") {
    scanForbiddenString(value, fieldPath);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoCodeDeep(item, `${fieldPath}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      assertNoCodeDeep(nested, `${fieldPath}.${key}`);
    }
  }
}

function parseJsonSafely(
  content: string,
  fileName: string
): Record<string, unknown> {
  if (new TextEncoder().encode(content).byteLength > TEMPLATE_LIMITS.jsonBytes) {
    throw new TemplateImportError(
      "RESOURCE_TOO_LARGE",
      `${fileName} 体积超过限制（最大 ${Math.round(TEMPLATE_LIMITS.jsonBytes / 1024)}KB）`
    );
  }
  try {
    const parsed = JSON.parse(content);
    if (!isPlainObject(parsed)) {
      throw new TemplateImportError("INVALID_JSON", `${fileName} 顶层结构必须是对象`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof TemplateImportError) throw error;
    throw new TemplateImportError("INVALID_JSON", `${fileName} 不是合法 JSON 文件`);
  }
}

function requireString(
  source: Record<string, unknown>,
  key: string,
  fileName: string,
  maxLength: number = TEMPLATE_LIMITS.nameLength
): string {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new TemplateImportError(
      "MISSING_FIELD",
      `${fileName} 缺少必填字段 ${key}`
    );
  }
  if (value.length > maxLength) {
    throw new TemplateImportError(
      "INVALID_FIELD",
      `${fileName}.${key} 超过最大长度 ${maxLength}`
    );
  }
  scanForbiddenString(value, `${fileName}.${key}`);
  return value.trim();
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  fileName: string,
  maxLength: number = TEMPLATE_LIMITS.jsonBytes
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new TemplateImportError(
      "INVALID_FIELD",
      `${fileName}.${key} 必须是字符串`
    );
  }
  scanForbiddenString(value, `${fileName}.${key}`);
  return value.slice(0, maxLength);
}

/** 数值校验：限制在合理范围内，避免模板把页面撑爆 */
function optionalNumber(
  source: Record<string, unknown>,
  key: string,
  fileName: string,
  min: number,
  max: number
): number | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TemplateImportError(
      "INVALID_FIELD",
      `${fileName}.${key} 必须是数字`
    );
  }
  if (numeric < min || numeric > max) {
    throw new TemplateImportError(
      "INVALID_FIELD",
      `${fileName}.${key} 必须在 ${min} ~ ${max} 之间（当前 ${numeric}）`
    );
  }
  return numeric;
}

function optionalColors(source: Record<string, unknown>, fileName: string) {
  const raw = source.colors;
  if (!isPlainObject(raw)) return undefined;
  const result: Record<string, string> = {};
  for (const key of ["primary", "secondary", "background", "text"] as const) {
    const value = raw[key];
    if (typeof value !== "string") continue;
    scanForbiddenString(value, `${fileName}.colors.${key}`);
    if (!colorToHex(value)) {
      throw new TemplateImportError(
        "INVALID_FIELD",
        `${fileName}.colors.${key} 不是合法颜色值`
      );
    }
    result[key] = value.trim();
  }
  return result;
}

function checkSchemaVersion(source: Record<string, unknown>, fileName: string): void {
  const version = source.schemaVersion;
  if (version === undefined) {
    throw new TemplateImportError(
      "MISSING_FIELD",
      `${fileName} 缺少 schemaVersion 字段`
    );
  }
  const numeric = Number(version);
  if (!Number.isInteger(numeric)) {
    throw new TemplateImportError(
      "UNSUPPORTED_SCHEMA_VERSION",
      `${fileName} 的 schemaVersion 必须是整数`
    );
  }
  if (numeric !== TEMPLATE_SCHEMA_VERSION) {
    throw new TemplateImportError(
      "UNSUPPORTED_SCHEMA_VERSION",
      `模板版本 v${numeric} 与当前支持的 v${TEMPLATE_SCHEMA_VERSION} 不一致，需要转换后才能导入`
    );
  }
}

function validateId(value: string): string {
  if (!/^[a-z0-9][a-z0-9-_]{2,39}$/i.test(value)) {
    throw new TemplateImportError(
      "INVALID_FIELD",
      `模板 ID 只能包含字母、数字、- 和 _，长度 3~40（当前 ${value}）`
    );
  }
  return value;
}

export interface TemplatePackageInput {
  manifest: string;
  layout: string;
  theme: string;
  preview?: Uint8Array;
  previewMime?: string;
}

/**
 * 校验并反序列化模板包 → TemplateDefinition。
 * 任何一步失败都抛 TemplateImportError，UI 直接展示 message。
 */
export function parseTemplatePackage(input: TemplatePackageInput): TemplateDefinition {
  if (!input.manifest || !input.layout || !input.theme) {
    throw new TemplateImportError(
      "MISSING_FILE",
      "模板包必须包含 manifest.json、layout.json 和 theme.json"
    );
  }

  // 1. JSON 合法性 + 安全检查（在所有字段落地之前，先把危险字符串拦掉）
  assertNoCodeDeep(input.manifest, "manifest.json");
  assertNoCodeDeep(input.layout, "layout.json");
  assertNoCodeDeep(input.theme, "theme.json");

  const manifestRaw = parseJsonSafely(input.manifest, "manifest.json");
  const layoutRaw = parseJsonSafely(input.layout, "layout.json");
  const themeRaw = parseJsonSafely(input.theme, "theme.json");
  assertNoCodeDeep(manifestRaw, "manifest.json");
  assertNoCodeDeep(layoutRaw, "layout.json");
  assertNoCodeDeep(themeRaw, "theme.json");

  // 结构性体检：如果文件里出现简历内容字段，说明用户交上来的是简历 JSON 而不是模板文件
  for (const [fileName, doc] of [
    ["manifest.json", manifestRaw],
    ["layout.json", layoutRaw],
    ["theme.json", themeRaw],
  ] as const) {
    const contentKeys = Object.keys(doc).filter((key) => RESERVED_CONTENT_KEYS.has(key));
    if (contentKeys.length > 0) {
      throw new TemplateImportError(
        "FORBIDDEN_CONTENT",
        `${fileName} 包含简历内容字段（${contentKeys.join("、")}）。模板文件只能描述展示规则，请改用「简历 JSON」导入`
      );
    }
  }

  // 2. 版本检查
  checkSchemaVersion(manifestRaw, "manifest.json");

  // 3. manifest
  const id = validateId(requireString(manifestRaw, "id", "manifest.json", 40));
  const name = requireString(manifestRaw, "name", "manifest.json");
  const description = optionalString(manifestRaw, "description", "manifest.json", 300);
  const category = optionalString(manifestRaw, "category", "manifest.json", 30);
  const rawTags = manifestRaw.tags;
  const tags = Array.isArray(rawTags)
    ? rawTags.filter((tag): tag is string => typeof tag === "string").slice(0, TEMPLATE_LIMITS.tagCount)
    : undefined;

  // 4. layout
  const layout: TemplateLayoutDoc = {
    layout: layoutRaw.layout === "two-column" ? "two-column" : "single-column",
    order: sanitizeOrder(layoutRaw.order),
    basicLayout:
      layoutRaw.basicLayout === "center" || layoutRaw.basicLayout === "right"
        ? layoutRaw.basicLayout
        : "left",
    pagePadding: optionalNumber(layoutRaw, "pagePadding", "layout.json", 0, 120),
  };
  if (isPlainObject(layoutRaw.columns)) {
    const main = optionalNumber(layoutRaw.columns, "main", "layout.json", 1, 6);
    const side = optionalNumber(layoutRaw.columns, "side", "layout.json", 1, 6);
    if (main || side) layout.columns = { main: main ?? 2, side: side ?? 1 };
  }
  if (isPlainObject(layoutRaw.columnAssignment)) {
    const assignment: Record<string, "main" | "side"> = {};
    for (const [key, value] of Object.entries(layoutRaw.columnAssignment)) {
      // 与 sectionStyles 一致：旧的 selfEvaluation 归一成 canonical 的 summary
      const canonical = key === "selfEvaluation" ? "summary" : key;
      if (!TEMPLATE_SECTION_KEYS.includes(canonical as never)) continue;
      assignment[canonical] = value === "side" ? "side" : "main";
    }
    layout.columnAssignment = assignment as TemplateLayoutDoc["columnAssignment"];
  }

  // 5. theme
  const spacing = isPlainObject(themeRaw.spacing) ? themeRaw.spacing : {};
  const typography = {
    fontFamily: optionalString(themeRaw, "fontFamily", "theme.json", 120),
    baseFontSize: optionalNumber(themeRaw, "baseFontSize", "theme.json", 8, 24),
    headerSize: optionalNumber(themeRaw, "headerSize", "theme.json", 8, 40),
    subheaderSize: optionalNumber(themeRaw, "subheaderSize", "theme.json", 8, 32),
    lineHeight: optionalNumber(themeRaw, "lineHeight", "theme.json", 0.8, 3),
  };

  // 6. 预览图：限大小，且只允许转成 dataURL 内联（不保留外部 URL）
  let previewImage: string | undefined;
  if (input.preview && input.preview.byteLength > 0) {
    if (input.preview.byteLength > TEMPLATE_LIMITS.imageBytes) {
      throw new TemplateImportError(
        "RESOURCE_TOO_LARGE",
        `预览图超过 ${Math.round(TEMPLATE_LIMITS.imageBytes / 1024)}KB`
      );
    }
    const mime = input.previewMime?.startsWith("image/") ? input.previewMime : "image/png";
    // 分块转成二进制字符串再 base64：不用扩展运算符，避免 downlevelIteration 依赖
    let binary = "";
    for (let i = 0; i < input.preview.length; i++) {
      binary += String.fromCharCode(input.preview[i]!);
    }
    previewImage = `data:${mime};base64,${btoa(binary)}`;
  }

  const savedPresentation = isPlainObject(themeRaw.savedPresentation) && themeRaw.savedPresentation.version === 1 && isPlainObject(themeRaw.savedPresentation.example)
      ? buildTemplateExample(themeRaw.savedPresentation.example as unknown as import("@/types/resume").ResumeData,
          typeof themeRaw.savedPresentation.renderer === "string" && SAVED_RENDERERS.includes(themeRaw.savedPresentation.renderer) ? themeRaw.savedPresentation.renderer : undefined)
      : undefined;
  const definition: TemplateDefinition = {
    id,
    name,
    description,
    category,
    tags,
    source: "custom-schema",
    docxCapability: savedPresentation?.renderer ? (["classic", "minimalist"].includes(savedPresentation.renderer) ? "full" : "basic") : layout.layout === "single-column" ? "full" : "basic",
    layout,
    typography,
    spacing: {
      // 上限必须 ≥ 编辑器滑杆上限（pagePadding/sectionSpacing/paragraphSpacing 最大 100），
      // 否则「保存排版为模板 → 导出 → 再导入」会被自己的校验拒绝
      sectionGap: optionalNumber(spacing, "sectionGap", "theme.json", 0, 120),
      itemGap: optionalNumber(spacing, "itemGap", "theme.json", 0, 120),
      contentPadding: optionalNumber(spacing, "contentPadding", "theme.json", 0, 120),
    },
    colors: optionalColors(themeRaw, "theme.json") ?? {},
    sectionStyles: sanitizeSectionStyles(themeRaw.sectionStyles),
    savedPresentation,
    builtinLayout: isPlainObject(themeRaw.savedPresentation) && typeof themeRaw.savedPresentation.renderer === "string" && SAVED_RENDERERS.includes(themeRaw.savedPresentation.renderer) ? themeRaw.savedPresentation.renderer : undefined,
    previewImage,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 7. 最后一道反向体检：模板里绝不能混进个人信息
  const leaks = findPersonalContent(definition);
  if (leaks.length > 0) {
    throw new TemplateImportError(
      "FORBIDDEN_CONTENT",
      `模板文件中疑似包含个人信息（${leaks.join("、")}），已拒绝导入`
    );
  }
  return definition;
}

function sanitizeOrder(value: unknown): TemplateSectionKey[] {
  if (!Array.isArray(value)) {
    return [...TEMPLATE_SECTION_KEYS];
  }
  const allowed = Array.from(new Set(value.map((item) => item === "selfEvaluation" ? "summary" : item).filter((item): item is string =>
    typeof item === "string" && TEMPLATE_SECTION_KEYS.includes(item as never)
  )));
  // 补齐未声明的模块，避免模板漏写导致内容不显示
  for (const key of TEMPLATE_SECTION_KEYS) {
    if (!allowed.includes(key)) allowed.push(key);
  }
  return allowed as TemplateSectionKey[];
}

function sanitizeSectionStyles(value: unknown): Record<string, TemplateSectionStyle> | undefined {
  if (!isPlainObject(value)) return undefined;
  const result: Record<string, TemplateSectionStyle> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key !== "default" && key !== "selfEvaluation" && !TEMPLATE_SECTION_KEYS.includes(key as TemplateSectionKey)) continue;
    if (!isPlainObject(raw)) continue;
    const style: TemplateSectionStyle = {};
    style.fontSize = optionalNumber(raw, "fontSize", `sectionStyles.${key}`, 8, 40);
    style.fontWeight = optionalNumber(raw, "fontWeight", `sectionStyles.${key}`, 100, 900);
    const colors = optionalColors({ colors: { primary: raw.color, background: raw.background } }, `sectionStyles.${key}`);
    if (colors?.primary) style.color = colors.primary;
    if (colors?.background) style.background = colors.background;
    style.spacing = optionalNumber(raw, "spacing", `sectionStyles.${key}`, 0, 120);
    style.itemSpacing = optionalNumber(raw, "itemSpacing", `sectionStyles.${key}`, 0, 120);
    if (raw.align === "center" || raw.align === "right" || raw.align === "left") style.align = raw.align;
    if (typeof raw.border === "boolean") style.border = raw.border;
    result[key === "selfEvaluation" ? "summary" : key] = style;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 导出前的个人信息体检：
 * ResumeData 的姓名/手机/邮箱/经历正文如果混进模板，会被这里拦下。
 *
 * 两道判断：
 * 1. 顶层出现简历内容字段名（basic / projects / experience ...）→ 像是把简历 JSON 当模板提交了。
 * 2. 任意字符串里出现邮箱 / 手机号 / 敏感中文标签 → 疑似个人信息。
 */
export function findPersonalContent(definition: TemplateDefinition): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string") {
      if (value.startsWith("data:image/")) return; // 预览图 base64 不算
      for (const hint of PERSONAL_HINTS) {
        if (hint.pattern.test(value)) {
          found.add(`${path} 疑似包含${hint.label}`);
        }
      }
      // name 字段做启发式人名检测，其它字段（url、字体名等）不查，避免误伤
      if (path.endsWith(".name") && looksLikeChinesePersonName(value)) {
        found.add(`${path} 疑似为人名`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (isPlainObject(value)) {
      for (const [key, nested] of Object.entries(value)) walk(nested, `${path}.${key}`);
    }
  };
  walk(definition, "模板");

  // 顶层字段体检：简历内容字段名不得出现在模板定义上
  for (const key of Object.keys(definition)) {
    if (RESERVED_CONTENT_KEYS.has(key)) {
      found.add(`顶层字段 ${key} 属于简历内容，模板只能描述展示规则`);
    }
  }
  return Array.from(found);
}

/** TemplateDefinition → 模板包文件（供打包 ZIP / 单文件导出） */
export function buildTemplatePackage(
  definition: TemplateDefinition
): TemplatePackage {
  const leaks = findPersonalContent(definition);
  if (leaks.length > 0) {
    throw new TemplateImportError(
      "FORBIDDEN_CONTENT",
      `该模板无法导出：${leaks.join("、")}`
    );
  }
  const manifest: TemplateManifestDoc = {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id: definition.id,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    tags: definition.tags,
  };
  const layout: TemplateLayoutDoc = { ...definition.layout };
  const theme: TemplateThemeDoc = {
    fontFamily: definition.typography.fontFamily,
    baseFontSize: definition.typography.baseFontSize,
    headerSize: definition.typography.headerSize,
    subheaderSize: definition.typography.subheaderSize,
    lineHeight: definition.typography.lineHeight,
    colors: definition.colors,
    spacing: definition.spacing,
    sectionStyles: definition.sectionStyles,
    savedPresentation: definition.savedPresentation,
  };
  return { manifest, layout, theme, preview: definition.previewImage };
}
