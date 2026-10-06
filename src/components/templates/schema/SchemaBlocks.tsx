/**
 * Schema 模板的内容块组件。
 *
 * 这些块只负责「把 ResumeData 的内容按 TemplateDefinition 的样式画出来」，
 * 全部是普通 React 元素，没有任何来自模板字符串的求值过程。
 */
import React from "react";
import type {
  Education,
  Experience,
  Project,
  CustomItem,
  BasicInfo, Certificate, ResumeData,
} from "@/types/resume";
import { normalizeRichTextContent } from "@/lib/richText";
import { formatDateString } from "@/lib/utils";
import { resolveItemStyle, type ResolvedResumeStyle } from "@/lib/resumeStyle";
import { resolveTextStyle } from "@/lib/textStyle";
import type { ResumeStyleOverrides } from "@/types/styleOverride";
import { basicContactValues, basicFieldVisible, isResumeSectionEnabled } from "@/lib/resumePresentation";

function itemStyle(overrides: ResumeStyleOverrides | undefined, id: string): React.CSSProperties {
  const local = resolveItemStyle(overrides, id);
  const style = resolveTextStyle(local);
  if (local.fontSize === undefined) delete style.fontSize;
  return style;
}

/** 富文本渲染：复用项目既有的规范化逻辑，保证 bullet / 链接样式与内置模板一致 */
const RichText: React.FC<{ html?: string; style?: React.CSSProperties }> = ({
  html,
  style,
}) => {
  if (!html) return null;
  return (
    <div
      className="schema-rich-text"
      style={style}
      dangerouslySetInnerHTML={{ __html: normalizeRichTextContent(html) }}
    />
  );
};

export const SectionHeading: React.FC<{
  title?: string;
  fontSize: number;
  color: string;
  fontWeight: number;
  border: boolean;
  align: "left" | "center" | "right";
  spacing: number;
}> = ({ title, fontSize, color, fontWeight, border, align, spacing }) => {
  if (!title) return null;
  return (
    <h3
      style={{
        fontSize: `${fontSize}px`,
        color,
        fontWeight,
        textAlign: align,
        marginBottom: `${spacing}px`,
        borderBottom: border ? `1px solid ${color}` : undefined,
        paddingBottom: border ? "4px" : undefined,
      }}
    >
      {title}
    </h3>
  );
};

/** 基本信息：ATS 友好，联系方式必须是纯文本，不做图标化 */
export const BasicBlock: React.FC<{
  basic?: BasicInfo;
  align: "left" | "center" | "right";
  style: ResolvedResumeStyle;
}> = ({ basic, align, style }) => {
  if (!basic) return null;
  const contacts = basicContactValues(basic);

  return (
    <header style={{ textAlign: align }}>
      {basic.photo && basic.photoConfig?.visible !== false && <img src={basic.photo} alt="" style={{ width: basic.photoConfig?.width ?? 90, height: basic.photoConfig?.height ?? 120, objectFit: "cover", marginBottom: 8 }} />}
      {basicFieldVisible(basic, "name") && <h1 style={{ fontSize: `${style.headerSize}px`, fontWeight: 700, color: style.themeColor, marginBottom: "4px" }}>
        {basic.name}
      </h1>}
      {basic.title && basicFieldVisible(basic, "title") ? (
        <div style={{ fontSize: `${style.subheaderSize}px`, color: style.themeColor, marginBottom: "6px" }}>{basic.title}</div>
      ) : null}
      {contacts.length > 0 ? (
        <div style={{ opacity: 0.85 }}>{contacts.join(" · ")}</div>
      ) : null}
    </header>
  );
};

export const SummaryBlock: React.FC<{ content: string }> = ({ content }) => (
  <RichText html={content} />
);

export const SkillsBlock: React.FC<{ content: string }> = ({ content }) => (
  <RichText html={content} />
);

export const ExperienceBlock: React.FC<{
  items: Experience[];
  itemSpacing: number;
  overrides?: ResumeStyleOverrides;
}> = ({ items, itemSpacing, overrides }) => (
  <div>
    {items
      .filter((item) => item.visible !== false)
      .map((item, index) => (
        <div key={item.id} style={{ marginTop: index === 0 ? 0 : `${itemSpacing}px` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <strong>{item.company}</strong>
            <span style={{ opacity: 0.75 }}>{item.date}</span>
          </div>
          <div style={{ opacity: 0.85 }}>{item.position}</div>
          <RichText html={item.details} style={itemStyle(overrides,item.id)} />
        </div>
      ))}
  </div>
);

export const ProjectsBlock: React.FC<{
  items: Project[];
  itemSpacing: number;
  locale: string;
  overrides?: ResumeStyleOverrides;
  subheaderSize: number;
}> = ({ items, itemSpacing, locale, overrides, subheaderSize }) => (
  <div>
    {items
      .filter((item) => item.visible !== false)
      .map((item, index) => (
        <div key={item.id} style={{ marginTop: index === 0 ? 0 : `${itemSpacing}px` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <strong style={resolveTextStyle(item.nameStyle, subheaderSize)}>{item.name}</strong>
            <span style={{ opacity: 0.75 }}>{formatDateString(item.date, locale)}</span>
          </div>
          {item.role ? <div style={{ opacity: 0.85, ...resolveTextStyle(item.roleStyle, subheaderSize) }}>{item.role}</div> : null}
          {item.link ? (
            <a
              href={item.link}
              className="rich-text-link"
              style={{ fontSize: "0.9em" }}
              rel="noreferrer noopener"
              target="_blank"
            >
              {item.linkLabel || item.link}
            </a>
          ) : null}
          <RichText html={item.description} style={itemStyle(overrides,item.id)} />
        </div>
      ))}
  </div>
);

export const EducationBlock: React.FC<{
  items: Education[];
  itemSpacing: number;
  overrides?: ResumeStyleOverrides;
}> = ({ items, itemSpacing, overrides }) => (
  <div>
    {items
      .filter((item) => item.visible !== false)
      .map((item, index) => (
        <div key={item.id} style={{ marginTop: index === 0 ? 0 : `${itemSpacing}px` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <strong>{item.school}</strong>
            <span style={{ opacity: 0.75 }}>
              {item.startDate || item.endDate
                ? `${item.startDate ?? ""} - ${item.endDate ?? ""}`.replace(/^ - | - $/g, "")
                : ""}
            </span>
          </div>
          <div style={{ opacity: 0.85 }}>
            {[item.major, item.degree, item.gpa ? `GPA ${item.gpa}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <RichText html={item.description} style={itemStyle(overrides,item.id)} />
        </div>
      ))}
  </div>
);

export const CustomBlock: React.FC<{
  groups: Record<string, CustomItem[]>;
  itemSpacing: number;
  resume: ResumeData;
  overrides?: ResumeStyleOverrides;
}> = ({ groups, itemSpacing, resume, overrides }) => (
  <div>
    {Object.entries(groups).filter(([id]) => isResumeSectionEnabled(resume, id)).map(([groupId, items]) => (
      <div key={groupId} style={{ marginBottom: `${itemSpacing}px` }}>
        <h3 className="font-bold">{resume.menuSections.find((s) => s.id === groupId)?.title ?? groupId}</h3>
        {items
          .filter((item) => item.visible !== false)
          .map((item) => (
            <div key={item.id} style={{ marginTop: `${itemSpacing}px` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <strong>{item.title}</strong>
                <span style={{ opacity: 0.75 }}>{item.dateRange}</span>
              </div>
              {item.subtitle ? <div style={{ opacity: 0.85 }}>{item.subtitle}</div> : null}
              <RichText html={item.description} style={itemStyle(overrides,item.id)} />
            </div>
          ))}
      </div>
    ))}
  </div>
);

/** 只用到 BasicInfo 的几个字段，避免与 ResumeData 强耦合 */
export const CertificatesBlock = ({ items }: { items: Certificate[] }) => <div className="flex flex-wrap gap-2">
  {items.map((item) => <img key={item.id} src={item.url} alt="Certificate" style={{ width: `calc(${item.width ?? 100}% - 8px)`, height: "auto", objectFit: "contain" }} />)}
</div>;
