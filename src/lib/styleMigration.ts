import type { GlobalSettings, ResumeData } from "@/types/resume";
import type { ResumeStyleOverrides } from "@/types/styleOverride";

/** 旧 API 字段 -> 唯一存储模型。globalSettings 仅保留产品开关。 */
export const STYLE_FIELDS = {
  fontFamily: "fontFamily", baseFontSize: "baseFontSize", lineHeight: "lineHeight",
  pagePadding: "pagePadding", sectionSpacing: "sectionSpacing", paragraphSpacing: "itemSpacing",
  headerSize: "headerSize", subheaderSize: "subheaderSize", themeColor: "themeColor",
} as const;
export function settingsToOverrides(settings: GlobalSettings, previous: ResumeStyleOverrides = {}): ResumeStyleOverrides {
  const global = { ...previous.global };
  for (const key of Object.keys(STYLE_FIELDS) as (keyof typeof STYLE_FIELDS)[]) {
    if (Object.hasOwn(settings, key)) {
      const target = STYLE_FIELDS[key];
      if (settings[key] === undefined) delete global[target];
      else Object.assign(global, { [target]: settings[key] });
    }
  }
  const sections = { ...previous.sections };
  for (const [key, style] of Object.entries(settings.sectionStyles ?? {})) {
    sections[key] = { ...sections[key], ...style };
  }
  return { ...previous, global, sections };
}
export function productSettings(settings: GlobalSettings = {}): GlobalSettings {
  const copy = { ...settings };
  for (const key of Object.keys(STYLE_FIELDS) as (keyof typeof STYLE_FIELDS)[]) delete copy[key];
  delete copy.sectionStyles;
  return copy;
}
/** 幂等、无副作用：旧字段只迁移一次，显式覆盖优先。不修改原对象或时间戳。 */
export function migrateResumeStyle(resume: ResumeData): ResumeData {
  const legacy = settingsToOverrides(resume.globalSettings ?? {});
  const overrides = resume.styleOverrides ?? {};
  const sections = { ...legacy.sections };
  for (const [key, value] of Object.entries(overrides.sections ?? {})) sections[key] = { ...sections[key], ...value };
  return { ...resume, styleModelVersion: 1, globalSettings: productSettings(resume.globalSettings),
    styleOverrides: { ...overrides, global: { ...legacy.global, ...overrides.global }, sections } };
}
export function settingsPatch(resume: ResumeData, settings: GlobalSettings): Partial<ResumeData> {
  const canonical = migrateResumeStyle(resume);
  return { styleModelVersion: 1, styleOverrides: settingsToOverrides(settings, canonical.styleOverrides),
    globalSettings: { ...canonical.globalSettings, ...productSettings(settings) } };
}
