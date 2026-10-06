import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { ResumeData } from "../src/types/resume";
import type { TemplateDefinition } from "../src/types/templateDefinition";
import { buildTemplateExample, exampleRichText, withTemplateExample } from "../src/lib/templateExample";
import { findPersonalContent, buildTemplatePackage, parseTemplatePackage } from "../src/lib/templateSchema";
import { templateDefaultSettings } from "../src/lib/resumePresentation";

// 使用现有 turndown 的 DOM 依赖，无新增依赖，也不连接用户浏览器。
const require = createRequire(import.meta.url);
const domino = createRequire(require.resolve("turndown"))("@mixmark-io/domino");
const window = domino.createWindow("");
if (!window.Element.prototype.closest) window.Element.prototype.closest = function(selector: string) {
  let node = this;
  while (node) { if (node.matches(selector)) return node; node = node.parentElement; }
  return null;
};
Object.assign(globalThis, { NodeFilter: window.NodeFilter, DOMParser: class { parseFromString(html: string) { return domino.createWindow(html).document; } } });

function source(): ResumeData {
  return {
    id: "secret-id", title: "私人简历", templateId: "classic", createdAt: "", updatedAt: "", activeSection: "projects", draggingProjectId: null,
    basic: { name: "张某某", title: "私人岗位", phone: "13812345678", email: "private@example.net", location: "私人住址", birthDate: "1990-01", employementStatus: "在职", photo: "private-photo", photoConfig: { width: 82, height: 94, aspectRatio: "custom", borderRadius: "custom", customBorderRadius: 13, visible: true }, fieldOrder: [{ id: "secret", key: "phone", type: "text", label: "手机号", visible: true }], customFields: [{ id: "secret-field", label: "私人标签", value: "私人内容", icon: "Mail", visible: true, displayLabel: false }], icons: { phone: "Phone" }, githubKey: "secret-token", githubUseName: "private-user", githubContributionsVisible: true, layout: "right" },
    projects: [{ id: "secret-project", name: "私人项目", role: "私人角色", date: "2020 - 2026", visible: true, description: '<h3 data-body-inline="1">项目定位</h3><p><span style="font-size: 23px; color: #123456;">私人正文</span></p><ul><li data-indent="2" style="margin-left: 2em;"><p><strong>私人指标</strong>继续说明</p></li></ul>', nameStyle: { fontSize: 24, bold: true }, roleStyle: { fontSize: 19, color: "#334455" } }],
    experience: [], education: [], certificates: [], customData: {}, skillContent: "", selfEvaluationContent: "",
    menuSections: [{ id: "basic", title: "个人资料", icon: "", order: 0, enabled: true }, { id: "projects", title: "项目经历", icon: "", order: 1, enabled: true }],
    globalSettings: { fontFamily: '"Alibaba PuHuiTi", sans-serif', baseFontSize: 18, headerSize: 25, subheaderSize: 21, pagePadding: 42, paragraphSpacing: 22, sectionSpacing: 32, lineHeight: 1.8, themeColor: "#123456", centerSubtitle: true, flexibleHeaderLayout: true, useIconMode: true, sectionStyles: { projects: { itemSpacing: 37 } } },
  };
}
function definition(): TemplateDefinition {
  return { id: "saved-layout", name: "完整排版模板", source: "custom-schema", docxCapability: "basic", builtinLayout: "classic", layout: { layout: "single-column", order: ["basic", "projects"], basicLayout: "right", pagePadding: 42 }, typography: { fontFamily: '"Alibaba PuHuiTi", sans-serif', baseFontSize: 18, headerSize: 25, subheaderSize: 21, lineHeight: 1.8 }, spacing: { sectionGap: 32, itemGap: 22, contentPadding: 42 }, colors: { primary: "#123456" }, savedPresentation: buildTemplateExample(source(), "classic") };
}

test("保存保留布局、所有生效字号间距、照片几何和局部字体", () => {
  const saved = buildTemplateExample(source(), "classic");
  assert.equal(saved.renderer, "classic");
  for (const key of ["fontFamily", "baseFontSize", "headerSize", "subheaderSize", "pagePadding", "paragraphSpacing", "sectionSpacing", "lineHeight", "themeColor", "centerSubtitle", "flexibleHeaderLayout", "useIconMode"] as const) assert.equal(saved.example.globalSettings[key], source().globalSettings[key]);
  assert.equal(saved.example.globalSettings.sectionStyles?.projects?.itemSpacing, 37);
  assert.deepEqual(saved.example.basic.photoConfig, source().basic.photoConfig);
  assert.equal(saved.example.projects[0].nameStyle?.fontSize, 24);
  assert.equal(saved.example.projects[0].roleStyle?.bold, undefined);
  assert.match(saved.example.projects[0].description, /data-body-inline="1"/);
  assert.match(saved.example.projects[0].description, /font-size: 23px/);
  assert.match(saved.example.projects[0].description, /data-indent="2"/);
});

test("示例快照移除真实身份、私人履历、照片、链接和凭据", () => {
  const saved = definition();
  const json = JSON.stringify(saved);
  for (const value of ["张某某", "私人", "13812345678", "private", "secret", "2020 - 2026"]) assert.ok(!json.includes(value), value);
  assert.deepEqual(findPersonalContent(saved), []);
  assert.notEqual(saved.savedPresentation!.example.basic.photo, source().basic.photo);
});

test("富文本示例只保留安全结构，移除可执行属性和外部资源", () => {
  const html = exampleRichText('<script>alert(1)</script><p onclick="attack()"><img src="https://private.test"/><a href="javascript:attack()">私人链接</a></p>');
  assert.ok(!/script|onclick|attack|private|img|私人/.test(html));
  assert.match(html, /https:\/\/example.com/);
});

test("ZIP/JSON 包往返保留布局与正文分块，导入再次生成安全示例", () => {
  const original = definition();
  const pkg = buildTemplatePackage(original);
  const imported = parseTemplatePackage({ manifest: JSON.stringify(pkg.manifest), layout: JSON.stringify(pkg.layout), theme: JSON.stringify(pkg.theme) });
  assert.equal(imported.savedPresentation?.renderer, "classic");
  assert.equal(imported.savedPresentation?.example.projects[0].nameStyle?.fontSize, 24);
  assert.equal(imported.savedPresentation?.example.globalSettings.sectionStyles?.projects?.itemSpacing, 37);
  assert.match(imported.savedPresentation!.example.projects[0].description, /data-body-inline="1"/);
  assert.deepEqual(findPersonalContent(imported), []);
});

test("新建用模板示例，保留新简历身份；模板默认设置不丢页头开关", () => {
  const saved = definition();
  const base = { ...source(), id: "new-id", title: "新建简历" };
  const example = withTemplateExample(base, saved);
  assert.equal(example.id, "new-id");
  assert.equal(example.title, "新建简历");
  assert.equal(example.templateId, saved.id);
  assert.equal(example.basic.name, "示例候选人");
  assert.equal(templateDefaultSettings(saved).centerSubtitle, true);
  assert.equal(base.basic.name, "张某某");
  assert.equal(withTemplateExample(base, undefined), base);
});
