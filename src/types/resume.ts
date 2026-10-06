export interface PhotoConfig {
  width: number;
  height: number;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "custom";
  borderRadius: "none" | "medium" | "full" | "custom";
  customBorderRadius: number;
  visible?: boolean;
}

export const DEFAULT_CONFIG: PhotoConfig = {
  width: 90,
  height: 120,
  aspectRatio: "1:1",
  borderRadius: "none",
  customBorderRadius: 0,
  visible: true,
};

export const getRatioMultiplier = (ratio: PhotoConfig["aspectRatio"]) => {
  switch (ratio) {
    case "4:3":
      return 3 / 4;
    case "3:4":
      return 4 / 3;
    case "16:9":
      return 9 / 16;
    default:
      return 1;
  }
};

export const getBorderRadiusValue = (config?: PhotoConfig) => {
  if (!config) return "0";

  switch (config.borderRadius) {
    case "medium":
      return "0.5rem";
    case "full":
      return "9999px";
    case "custom":
      return `${config.customBorderRadius}px`;
    default:
      return "0";
  }
};

export interface BasicFieldType {
  id: string;
  key: keyof BasicInfo;
  label: string;
  type?: "date" | "textarea" | "text" | "editor";
  visible: boolean;
  custom?: boolean;
}

export interface CustomFieldType {
  id: string;
  label: string;
  value: string;
  icon?: string;
  visible?: boolean;
  custom?: boolean;
  displayLabel?: boolean;
}
export interface BasicInfo {
  birthDate: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  icons: Record<string, string>;
  employementStatus: string;
  photo: string;
  photoConfig: PhotoConfig;
  fieldOrder?: BasicFieldType[];
  customFields: CustomFieldType[];
  githubKey: string;
  githubUseName: string;
  githubContributionsVisible: boolean;
  layout?: "left" | "center" | "right";
}

export interface Education {
  id: string;
  school: string;
  major: string;
  degree: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  description?: string;
  visible?: boolean;
}

export interface Experience {
  id: string;
  company: string;
  position: string;
  date: string;
  details: string;
  visible?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  level: number;
}

/**
 * 通用文本样式（三级样式体系的「局部样式」层）
 * 所有字段均可选：不存在时沿「局部 → 模块 → globalSettings → 模板默认」链向上继承。
 */
export interface ResumeTextStyle {
  fontSize?: number;      // 局部字号（px），不存在时继承上级样式
  color?: string;         // 文字颜色，不存在时继承上级样式
  bold?: boolean;         // 是否加粗
  italic?: boolean;       // 是否斜体
  underline?: boolean;    // 是否下划线
}

export interface Project {
  id: string;
  name: string;
  role: string;
  date: string;
  description: string;
  visible: boolean;
  nameStyle?: ResumeTextStyle; // 项目名称局部样式（缺失时继承 globalSettings.subheaderSize）
  roleStyle?: ResumeTextStyle; // 项目角色局部样式（缺失时继承 globalSettings.subheaderSize）
  link?: string;
  linkLabel?: string;
}

export interface Certificate {
  id: string;
  url: string; // Base64 encoding for the image or direct URL
  width: number; // Width percentage to support flex layouts
}

/**
 * 模块级样式配置（三级样式体系的「模块样式」层接口）
 * 本次仅接入 projects.itemSpacing，其余字段为第二阶段预留。
 */
export interface SectionStyles {
  projects?: {
    itemSpacing?: number; // 项目条目之间的间距（px），缺失时回退 paragraphSpacing
  };
  experience?: {
    itemSpacing?: number; // 工作经历条目间距（预留）
  };
  education?: {
    itemSpacing?: number; // 教育经历条目间距（预留）
  };
}

export type GlobalSettings = {
  themeColor?: string | undefined;
  fontFamily?: string | undefined;
  baseFontSize?: number | undefined;
  pagePadding?: number | undefined;
  paragraphSpacing?: number | undefined;
  lineHeight?: number | undefined;
  sectionSpacing?: number | undefined;
  headerSize?: number | undefined;
  subheaderSize?: number | undefined;
  sectionStyles?: SectionStyles | undefined; // 模块级样式（局部 → 模块 → 全局）
  useIconMode?: boolean | undefined;
  centerSubtitle?: boolean | undefined;
  flexibleHeaderLayout?: boolean | undefined;
  autoOnePage?: boolean | undefined;
  pageBreakLinesVisible?: boolean | undefined;
};

export interface ResumeTheme {
  id: string;
  name: string;
  color: string;
}

export interface CustomItem {
  id: string;
  title: string;
  subtitle: string;
  dateRange: string;
  description: string;
  visible: boolean;
}

export const THEME_COLORS = [
  "#000000",
  "#1A1A1A",
  "#333333",
  "#4D4D4D",
  "#666666",
  "#808080",
  "#999999",
  "#0047AB",
  "#8B0000",
  "#FF4500",
  "#4B0082",
  "#2E8B57",
];

export interface MenuSection {
  id: string;
  title: string;
  icon: string;
  enabled: boolean;
  order: number;
}

/**
 * ResumeStyleOverrides 单独维护「用户主动的排版调整」。
 * 注意：它不是简历内容，切模板时可以整体保留或整体清除，删除它不会丢失任何经历文字。
 */
import type { ResumeStyleOverrides } from "./styleOverride";

export interface ResumeData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  templateId: string | null | undefined;
  basic: BasicInfo;
  education: Education[];
  experience: Experience[];
  projects: Project[];
  certificates: Certificate[];
  customData: Record<string, CustomItem[]>;
  skillContent: string;
  selfEvaluationContent: string;
  activeSection: string;
  draggingProjectId: string | null;
  menuSections: MenuSection[];
  globalSettings: GlobalSettings;
  /** 用户排版覆盖层（可选，旧简历读取时迁移旧 globalSettings 样式） */
  styleOverrides?: ResumeStyleOverrides;
  /** 单一样式存储版本；globalSettings 中的样式仅作为旧数据迁移来源。 */
  styleModelVersion?: 1;
  /** v1 正文块使用明确语义标记，普通 H3 不再分块。 */
  bodySectionsVersion?: 1;
}

export interface ResumeStore {
  resumes: ResumeData[];
  currentResumeId: string | null;
  currentResume: ResumeData | null;
  addResume: (resume: Omit<ResumeData, "id">) => void;
  updateResume: (id: string, data: Partial<ResumeData>) => void;
  deleteResume: (id: string) => void;
  setCurrentResume: (id: string) => void;
  updateBasicInfo: (info: Partial<ResumeData["basic"]>) => void;
  addEducation: (education: Omit<ResumeData["education"][0], "id">) => void;
  updateEducation: (
    educationId: string,
    data: Partial<ResumeData["education"][0]>
  ) => void;
  removeEducation: (educationId: string) => void;
  addExperience: (experience: Omit<ResumeData["experience"][0], "id">) => void;
  updateExperience: (
    experienceId: string,
    data: Partial<ResumeData["experience"][0]>
  ) => void;
  removeExperience: (experienceId: string) => void;
  updateSkillContent: (skillContent: string) => void;
  addCertificate: (certificate: Certificate) => void;
  updateCertificate: (id: string, updates: Partial<Certificate>) => void;
  updateCertificatesBatch: (certificates: Certificate[]) => void;
  removeCertificate: (id: string) => void;
}
