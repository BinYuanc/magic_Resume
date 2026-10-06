import type { ResumeData, GlobalSettings } from "@/types/resume";
import { resolveLegacyResumeData } from "./resumePresentation";
import { resolveTemplateDefinition, getBuiltinDefinition } from "./templateResolver";
import { useCustomTemplateStore } from "@/store/useCustomTemplateStore";
/** 只读投影，绝不写回。旧 UI 的 globalSettings 读取统一落到样式解析器。 */
export function readResumeSettings(resume?: ResumeData | null): GlobalSettings {
  if (!resume) return {};
  const definition = resolveTemplateDefinition(resume.templateId, useCustomTemplateStore.getState().templates) ?? getBuiltinDefinition("classic");
  return definition ? resolveLegacyResumeData(resume, definition).globalSettings : resume.globalSettings;
}
