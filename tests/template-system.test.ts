import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TemplateImportError,
  buildTemplatePackage,
  findPersonalContent,
  parseTemplatePackage,
} from "../src/lib/templateSchema";
import { zipFiles, unzip, crc32 } from "../src/lib/templateZip";
import { builtinToDefinition } from "../src/lib/templateResolver";
import { definitionToTemplateView } from "../src/lib/templateCatalog";
import { resolveResumeStyle, resolveSectionStyle } from "../src/lib/resumeStyle";
import type { TemplateDefinition } from "../src/types/templateDefinition";

/** 一个最小合法的模板包（纯展示资产，不含任何简历内容） */
const validPackage = {
  manifest: JSON.stringify({
    schemaVersion: 1,
    id: "ai-engineer-pro",
    name: "AI 工程师专业模板",
    category: "technology",
    tags: ["AI", "单栏"],
  }),
  layout: JSON.stringify({
    layout: "single-column",
    order: ["basic", "skills", "projects", "education"],
    basicLayout: "left",
    pagePadding: 30,
  }),
  theme: JSON.stringify({
    fontFamily: "Inter",
    baseFontSize: 14,
    lineHeight: 1.55,
    colors: { primary: "#1d4ed8", text: "#111827" },
    spacing: { sectionGap: 14, itemGap: 10, contentPadding: 30 },
  }),
};

test("parseTemplatePackage: 合法模板可以解析且默认值补齐", () => {
  const definition = parseTemplatePackage(validPackage);
  assert.equal(definition.id, "ai-engineer-pro");
  assert.equal(definition.source, "custom-schema");
  assert.equal(definition.layout.layout, "single-column");
  assert.equal(definition.spacing.sectionGap, 14);
  assert.equal(definition.colors.primary, "#1d4ed8");
  // 未声明的模块必须自动补齐，避免内容不显示
  assert.ok(definition.layout.order?.includes("experience"));
  assert.equal(definition.docxCapability, "full");
});

test("parseTemplatePackage: JSON 非法时给出可读错误", () => {
  assert.throws(
    () => parseTemplatePackage({ ...validPackage, manifest: "{ 坏的 json" }),
    (error: unknown) =>
      error instanceof TemplateImportError &&
      error.code === "INVALID_JSON" &&
      /合法 JSON/.test(error.message)
  );
});

test("parseTemplatePackage: schemaVersion 不支持时拒绝", () => {
  const future = JSON.parse(validPackage.manifest);
  future.schemaVersion = 99;
  assert.throws(
    () => parseTemplatePackage({ ...validPackage, manifest: JSON.stringify(future) }),
    (error: unknown) =>
      error instanceof TemplateImportError &&
      error.code === "UNSUPPORTED_SCHEMA_VERSION"
  );
});

test("parseTemplatePackage: 缺少 id / name 时拒绝", () => {
  const broken = JSON.parse(validPackage.manifest);
  delete broken.name;
  assert.throws(
    () => parseTemplatePackage({ ...validPackage, manifest: JSON.stringify(broken) }),
    (error: unknown) =>
      error instanceof TemplateImportError && error.code === "MISSING_FIELD"
  );
});

test("parseTemplatePackage: 字号 / 间距越界时拒绝", () => {
  const badTheme = JSON.parse(validPackage.theme);
  badTheme.baseFontSize = 999;
  assert.throws(
    () => parseTemplatePackage({ ...validPackage, theme: JSON.stringify(badTheme) }),
    (error: unknown) =>
      error instanceof TemplateImportError && error.code === "INVALID_FIELD"
  );
});

test("安全检查: 携带 script / eval / 事件属性的模板无法导入", () => {
  const cases = [
    "<script>alert(1)</script>",
    "<div onclick=alert(1)>",
    "javascript:alert(1)",
    "eval('bad')",
    "new Function('return 1')",
  ];
  for (const payload of cases) {
    const manifest = JSON.parse(validPackage.manifest);
    manifest.description = payload;
    assert.throws(
      () => parseTemplatePackage({ ...validPackage, manifest: JSON.stringify(manifest) }),
      (error: unknown) =>
        error instanceof TemplateImportError && error.code === "FORBIDDEN_CONTENT",
      `应拦截: ${payload}`
    );
  }
});

test("模板与 JSON 备份是两回事：模板包不能含个人信息", () => {
  const cases: Record<string, Record<string, unknown>>[] = [
    // 姓名混进模板
    (() => { const m = JSON.parse(validPackage.manifest); m.name = "张三"; return m; })(),
    // 邮箱混进模板说明
    (() => { const m = JSON.parse(validPackage.manifest); m.description = "联系我 zhangsan@example.com"; return m; })(),
    // 手机号混进模板说明
    (() => { const m = JSON.parse(validPackage.manifest); m.description = "电话 13800138000"; return m; })(),
  ];
  for (const manifest of cases) {
    assert.throws(
      () => parseTemplatePackage({ ...validPackage, manifest: JSON.stringify(manifest) }),
      (error: unknown) =>
        error instanceof TemplateImportError && error.code === "FORBIDDEN_CONTENT"
    );
  }
});

test("buildTemplatePackage: 导出的模板包只有展示信息", () => {
  const definition = parseTemplatePackage(validPackage);
  const pkg = buildTemplatePackage(definition);
  const serialized = JSON.stringify(pkg);
  // 个人信息关键词一律不得出现
  for (const word of ["@", "139", "姓名", "出生日期"]) {
    assert.ok(!serialized.includes(word), `导出包不应包含 ${word}`);
  }
  assert.equal(pkg.manifest.schemaVersion, 1);
  assert.equal(findPersonalContent(definition).length, 0);
});

test("resolveResumeStyle: 优先级 用户全局 override > 模板默认 > 系统兜底", () => {
  const definition: TemplateDefinition = {
    id: "t1",
    name: "t1",
    source: "custom-schema",
    docxCapability: "full",
    layout: {},
    typography: { baseFontSize: 12, fontFamily: "Inter" },
    spacing: { contentPadding: 20, itemGap: 6, sectionGap: 8 },
    colors: { primary: "#123456" },
  };

  // 只给模板 → 取模板默认
  const fromTemplate = resolveResumeStyle(definition);
  assert.equal(fromTemplate.baseFontSize, 12);
  assert.equal(fromTemplate.pagePadding, 20);
  assert.equal(fromTemplate.themeColor, "#123456");

  // 用户 override 覆盖模板
  const withOverride = resolveResumeStyle(definition, {
    global: { baseFontSize: 16, pagePadding: 40, themeColor: "#ff0000" },
  });
  assert.equal(withOverride.baseFontSize, 16);
  assert.equal(withOverride.pagePadding, 40);
  assert.equal(withOverride.themeColor, "#ff0000");

  // 什么都没有 → 系统兜底，绝不出现 undefined
  const bare = resolveResumeStyle(undefined);
  assert.equal(typeof bare.baseFontSize, "number");
  assert.equal(typeof bare.pagePadding, "number");
  assert.ok(bare.fontFamily.length > 0);
});

test("resolveSectionStyle: 模块级样式优先于全局，缺失则回退", () => {
  const definition: TemplateDefinition = {
    id: "t2",
    name: "t2",
    source: "custom-schema",
    docxCapability: "full",
    layout: {},
    typography: {},
    spacing: { sectionGap: 8, itemGap: 6 },
    colors: { primary: "#000000" },
    sectionStyles: { projects: { itemSpacing: 20, color: "#00ff00" } },
  };
  const base = { subheaderSize: 16, sectionSpacing: 8, itemSpacing: 6, themeColor: "#000000" };

  const fromTemplate = resolveSectionStyle(definition, undefined, undefined, "projects", base);
  assert.equal(fromTemplate.itemSpacing, 20);
  assert.equal(fromTemplate.color, "#00ff00");

  // 用户覆盖优先
  const overridden = resolveSectionStyle(
    definition,
    { sections: { projects: { itemSpacing: 30 } } },
    undefined,
    "projects",
    base
  );
  assert.equal(overridden.itemSpacing, 30);

  // 未配置的模块回退到全局值
  const other = resolveSectionStyle(definition, undefined, undefined, "education", base);
  assert.equal(other.itemSpacing, 6);
});

test("内置模板: config → definition → 视图 的三段转换不丢字段", () => {
  const definition = builtinToDefinition({
    id: "classic",
    name: "经典模板",
    description: "desc",
    thumbnail: "classic",
    layout: "classic",
    colorScheme: { primary: "#000", secondary: "#444", background: "#fff", text: "#111" },
    spacing: { sectionGap: 16, itemGap: 12, contentPadding: 32 },
    basic: { layout: "left" },
  });
  assert.equal(definition.source, "builtin-react");
  assert.equal(definition.spacing.contentPadding, 32);
  assert.equal(definition.docxCapability, "full");

  const view = definitionToTemplateView(definition);
  assert.equal(view.id, "classic");
  assert.equal(view.spacing.contentPadding, 32);
  assert.equal(view.colorScheme.primary, "#000");
  // 时间轴类模板必须降级为 basic，避免生成伪 Word
  assert.equal(
    builtinToDefinition({ ...({ id: "timeline" } as never), layout: "timeline" }).docxCapability,
    "basic"
  );
});

test("ZIP: 打包后能被正确解回（stored / deflate 两种压缩方式）", async () => {
  const encoder = new TextEncoder();
  const entries = [
    { name: "manifest.json", data: encoder.encode('{"schemaVersion":1}') },
    { name: "layout.json", data: encoder.encode('{"layout":"single-column"}') },
    { name: "theme.json", data: encoder.encode('{"baseFontSize":14}'.repeat(40)) },
  ];
  const zipped = await zipFiles(entries);
  const buffer = zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength
  ) as ArrayBuffer;
  const restored = await unzip(buffer);
  assert.equal(restored.length, 3);
  const contents: Record<string, string> = {};
  for (const file of restored) contents[file.name] = await file.text();
  assert.equal(contents["layout.json"], '{"layout":"single-column"}');
  assert.ok(contents["theme.json"]!.startsWith('{"baseFontSize":14}'));
});

test("ZIP: 非 ZIP 数据会报错而不是静默产出空列表", async () => {
  const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
  await assert.rejects(() => unzip(junk));
});

test("crc32: 与已知值一致", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("i18n: 模板相关文案在 zh / en 都已就位", () => {
  for (const locale of ["zh", "en"]) {
    const messages = JSON.parse(
      readFileSync(`src/i18n/locales/${locale}.json`, "utf-8")
    );
    assert.ok(
      messages.dashboard.templates.tabs.mine,
      `${locale} 缺少 dashboard.templates.tabs.mine`
    );
    assert.ok(
      messages.templates.switchTemplateDialog.keepOverrides,
      `${locale} 缺少切换模板弹窗文案`
    );
  }
});

// ---------- P1: 保存当前排版为模板 ----------

test("P1 buildTemplateFromResume: 保存的是排版而非内容，且三项勾选生效", async () => {
  // 模拟浏览器全局（store 导入链上有 localStorage 访问）
  const store = await import("../src/store/useCustomTemplateStore");
  const resumeLike = {
    id: "r1",
    templateId: "classic",
    globalSettings: {
      themeColor: "#1d4ed8",
      fontFamily: "Inter",
      baseFontSize: 15,
      pagePadding: 28,
      paragraphSpacing: 10,
      lineHeight: 1.6,
      sectionSpacing: 12,
      headerSize: 18,
      subheaderSize: 15,
      sectionStyles: { projects: { itemSpacing: 18 } },
    },
    basic: { name: "张三", email: "zhangsan@example.com", layout: "left" },
    projects: [{ id: "p1", name: "BizAgent 平台", visible: true }],
    experience: [],
    education: [],
  };

  const { buildTemplateFromResume } = await import("../src/lib/templateSave");
  const definition = buildTemplateFromResume(resumeLike as never, {
    name: "我的 AI 排版",
    includeColors: true,
    includeFonts: true,
    includeSpacing: true,
  });

  // 排版被固化
  assert.equal(definition.typography.baseFontSize, 15);
  assert.equal(definition.spacing.contentPadding, 28);
  assert.equal(definition.colors.primary, "#1d4ed8");
  assert.equal(definition.sectionStyles?.projects?.itemSpacing, 18);
  assert.equal(definition.source, "custom-schema");

  // 内容绝不能进模板
  const serialized = JSON.stringify(definition);
  for (const banned of ["张三", "zhangsan@example.com", "BizAgent", "basic.name"]) {
    assert.ok(!serialized.includes(banned), `模板不得包含 ${banned}`);
  }
  assert.equal(findPersonalContent(definition).length, 0);

  // 勾选关闭时对应维度不保存
  const minimal = buildTemplateFromResume(resumeLike as never, {
    name: "minimal",
    includeColors: false,
    includeFonts: false,
    includeSpacing: false,
  });
  assert.equal(minimal.colors.primary, undefined);
  assert.equal(minimal.typography.baseFontSize, undefined);
  assert.equal(minimal.spacing.contentPadding, undefined);
});

test("P1 resolveSectionStyle: default 基座 + 模块覆盖", async () => {
  const { resolveSectionStyle } = await import("../src/lib/resumeStyle");
  const base = { subheaderSize: 16, sectionSpacing: 8, itemSpacing: 6, themeColor: "#000" };
  const definition: TemplateDefinition = {
    id: "t3",
    name: "t3",
    source: "custom-schema",
    docxCapability: "full",
    layout: {},
    typography: {},
    spacing: {},
    colors: {},
    sectionStyles: {
      default: { border: true, color: "#00ff00" },
      projects: { itemSpacing: 20 },
    },
  };
  const result = resolveSectionStyle(definition, undefined, undefined, "education", base);
  assert.equal(result.border, true); // default 基座生效
  assert.equal(result.color, "#00ff00");
  const projects = resolveSectionStyle(definition, undefined, undefined, "projects", base);
  assert.equal(projects.itemSpacing, 20); // 模块覆盖生效
  assert.equal(projects.border, true); // 未覆盖字段回落到 default
});
