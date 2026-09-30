import React from "react";
import { TemplateProvider } from "./TemplateContext";
import { getTemplateComponent } from "./registry";
import SchemaTemplateRenderer from "./schema/SchemaTemplateRenderer";
import { useCustomTemplateStore } from "@/store/useCustomTemplateStore";
import { ResumeData } from "@/types/resume";
import { ResumeTemplate } from "@/types/template";
import { builtinToDefinition } from "@/lib/templateResolver";
import { resolveLegacyResumeData } from "@/lib/resumePresentation";
import { resolveResumeStyle, resolveSectionStyle } from "@/lib/resumeStyle";
import { canonicalSectionId, legacySectionId } from "@/lib/resumePresentation";

interface TemplateProps {
  data: ResumeData;
  template: ResumeTemplate;
}

/**
 * 模板渲染分发：
 *   builtin-react  → 现有 9 套手写 React 模板（完全保留，行为不变）
 *   custom-schema  → 用户导入的 Schema 模板，交给 SchemaTemplateRenderer
 *
 * 上层（预览 / PDF / 详情页 / 导出）不需要关心区别，仍然只传 templateId。
 * 关键点：ResumeData 在两条支路上都是同一份，切换模板永不改写内容。
 */
const ResumeTemplateComponent: React.FC<TemplateProps> = ({
  data,
  template,
}) => {
  const customTemplates = useCustomTemplateStore((state) => state.templates);
  const customTemplate = customTemplates.find(
    (entry) => entry.id === template.id
  );

  const TemplateComponent = getTemplateComponent(template.layout);
  const definition = customTemplate ?? builtinToDefinition(template);
  const style = resolveResumeStyle(definition, data.styleOverrides, data.globalSettings);
  // 模块样式同时挂「当前 id」「canonical id」「legacy id」三把钥匙：
  // Schema/新代码用 summary，9 套内置模板的 SectionTitle 用 selfEvaluation，
  // 只挂一种会导致自我评价模块的模块级样式在内置模板里失效。
  const sectionStyles = Object.fromEntries(data.menuSections.flatMap((section) => {
    const canonical = canonicalSectionId(section.id);
    const resolved = resolveSectionStyle(definition, data.styleOverrides, data.globalSettings, canonical, style);
    const keys = new Set([section.id, canonical, legacySectionId(canonical)]);
    return Array.from(keys).map((key) => [key, resolved]);
  }));

  return (
    <TemplateProvider templateId={template.id} menuSections={data.menuSections} sectionStyles={sectionStyles}>
      {customTemplate ? (
        <SchemaTemplateRenderer
          data={data}
          template={customTemplate}
          overrides={data.styleOverrides}
        />
      ) : (
        <TemplateComponent data={resolveLegacyResumeData(data, builtinToDefinition(template))} template={template} />
      )}
    </TemplateProvider>
  );
};

export default ResumeTemplateComponent;
