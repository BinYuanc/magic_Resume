import React from "react";
import { useLocale } from "@/i18n/compat/client";
import type { ResumeData } from "@/types/resume";
import type { ResumeStyleOverrides } from "@/types/styleOverride";
import type { ColumnKey, TemplateDefinition, TemplateSectionKey } from "@/types/templateDefinition";
import { resolveResumeStyle, resolveSectionStyle } from "@/lib/resumeStyle";
import { legacySectionId, resumeSectionOrder } from "@/lib/resumePresentation";
import { BasicBlock, CustomBlock, EducationBlock, ExperienceBlock, ProjectsBlock,
  SectionHeading, SkillsBlock, SummaryBlock, CertificatesBlock } from "./SchemaBlocks";

const TITLES: Record<TemplateSectionKey, [string, string]> = {
  basic: ["基本信息", "Basic Information"], summary: ["自我评价", "Summary"],
  skills: ["专业技能", "Skills"], experience: ["工作经验", "Experience"],
  projects: ["项目经历", "Projects"], education: ["教育经历", "Education"],
  certificates: ["证书", "Certificates"], custom: ["自定义模块", "Custom"],
};

export default function SchemaTemplateRenderer({ data, template, overrides }: {
  data: ResumeData; template: TemplateDefinition; overrides?: ResumeStyleOverrides;
}) {
  const locale = useLocale();
  const resume = { ...data, styleOverrides: overrides ?? data.styleOverrides };
  const style = resolveResumeStyle(template, resume.styleOverrides, data.globalSettings);
  const order = resumeSectionOrder(resume, template);
  const assignment = template.layout.columnAssignment ?? {};
  const ratio = template.layout.columns ?? { main: 2, side: 1 };

  const renderSection = (key: TemplateSectionKey) => {
    const section = resolveSectionStyle(template, resume.styleOverrides, data.globalSettings, key, style);
    let block: React.ReactNode = null;
    switch (key) {
      case "basic": block = <BasicBlock basic={data.basic} align={data.basic.layout ?? template.layout.basicLayout ?? "left"} style={style} />; break;
      case "summary": block = data.selfEvaluationContent ? <SummaryBlock content={data.selfEvaluationContent} /> : null; break;
      case "skills": block = data.skillContent ? <SkillsBlock content={data.skillContent} /> : null; break;
      case "experience": block = data.experience?.some((i) => i.visible !== false) ? <ExperienceBlock items={data.experience} itemSpacing={section.itemSpacing} overrides={resume.styleOverrides} /> : null; break;
      case "projects": block = data.projects?.some((i) => i.visible !== false) ? <ProjectsBlock items={data.projects} itemSpacing={section.itemSpacing} locale={locale} overrides={resume.styleOverrides} subheaderSize={style.subheaderSize} /> : null; break;
      case "education": block = data.education?.some((i) => i.visible !== false) ? <EducationBlock items={data.education} itemSpacing={section.itemSpacing} overrides={resume.styleOverrides} /> : null; break;
      case "certificates": block = data.certificates?.length ? <CertificatesBlock items={data.certificates} /> : null; break;
      case "custom": block = <CustomBlock groups={data.customData ?? {}} itemSpacing={section.itemSpacing} resume={resume} overrides={resume.styleOverrides} />; break;
    }
    if (!block) return null;
    const title = data.menuSections?.find((s) => s.id === legacySectionId(key) || s.id === key)?.title ?? TITLES[key][locale === "en" ? 1 : 0];
    return <section key={key} data-resume-section-id={legacySectionId(key)} style={{ marginBottom: section.spacing, background: section.background }}>
      {key !== "basic" && key !== "custom" && <SectionHeading title={title} {...section} spacing={section.itemSpacing} />}
      {block}
    </section>;
  };
  // 页边距由外层页面容器（预览 / PDF / 列表卡片）统一施加，这里不再重复 padding，
  // 否则自定义模板会拿到双倍页边距；resolveResumeStyle 的 pagePadding 由外层读取。
  const rootStyle: React.CSSProperties = { fontFamily: style.fontFamily, fontSize: style.baseFontSize,
    lineHeight: style.lineHeight, color: style.textColor, background: style.background,
    minHeight: "100%", boxSizing: "border-box" };
  if (template.layout.layout !== "two-column") return <div className="schema-template" style={rootStyle}>{order.map(renderSection)}</div>;

  const pick = (column: ColumnKey) => order.filter((key) => key !== "basic" &&
    (assignment[key] ?? (key === "skills" ? "side" : "main")) === column);
  return <div className="schema-template" style={rootStyle}>
    {order.includes("basic") && assignment.basic !== "side" && renderSection("basic")}
    <div style={{ display: "grid", gridTemplateColumns: `minmax(0, ${ratio.main}fr) minmax(0, ${ratio.side}fr)`, gap: 24, alignItems: "start" }}>
      <div style={{ minWidth: 0 }}>{pick("main").map(renderSection)}</div>
      <div style={{ minWidth: 0 }}>{order.includes("basic") && assignment.basic === "side" && renderSection("basic")}{pick("side").map(renderSection)}</div>
    </div>
  </div>;
}
