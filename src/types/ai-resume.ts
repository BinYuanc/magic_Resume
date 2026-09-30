/**
 * AI 简历优化助手相关类型定义
 */

/**
 * AI 优化任务类型
 * - polish        润色表达：更专业、简洁、自然，不改变事实
 * - shorten       精简内容：压缩长度，保留 业务问题→技术动作→结果
 * - expand        扩写内容：仅基于已有事实合理展开
 * - technical     强化技术表达：体现设计动机、解决的技术问题、架构职责
 * - business      强化业务价值：技术动作 → 业务问题 → 业务价值
 * - metrics       强化量化结果：仅优化已有数据表达，缺失时提示用户补充
 * - star          STAR 改写：按 Situation/Task/Action/Result 重组（不显示标签）
 * - hr            HR 友好优化：降低术语堆砌，5~10 秒可理解
 * - ai_engineer   AI 应用开发专项优化：面向 RAG/Agent/LLM 工程师岗位
 * - custom        自定义要求：用户自由输入指令
 */
export type ResumeAITask =
  | "polish"
  | "shorten"
  | "expand"
  | "technical"
  | "business"
  | "metrics"
  | "star"
  | "hr"
  | "ai_engineer"
  | "custom";

/** 全部任务列表（用于菜单渲染与服务端校验） */
export const RESUME_AI_TASKS: readonly ResumeAITask[] = [
  "polish",
  "shorten",
  "expand",
  "technical",
  "business",
  "metrics",
  "star",
  "hr",
  "ai_engineer",
  "custom",
] as const;

export const isResumeAITask = (value: unknown): value is ResumeAITask =>
  typeof value === "string" &&
  (RESUME_AI_TASKS as readonly string[]).includes(value);

/** 简历优化设置（持久化到 LocalStorage） */
export interface ResumeAISettings {
  targetRole: string;            // 目标岗位，例如：AI 应用开发工程师
  yearsOfExperience: string;     // 工作年限，例如：3 年
  technicalFocus: string;        // 技术方向，例如：RAG、Agent、LangGraph、MCP
  writingStyle: string;          // 简历表达风格，例如：专业、简洁、结果导向
  language: string;              // 简历语言：zh / en
  maxBulletLength: number;       // 单条职责最大长度（字符数），0 表示不限制
  preferMetrics: boolean;        // 是否优先量化
  preferBusinessValue: boolean;  // 是否优先业务价值
  preferTechnicalDepth: boolean; // 是否强调技术难点
  customPrompt: string;          // 用户自定义 AI Prompt（附加规则）
}

/** 默认简历优化设置 */
export const DEFAULT_RESUME_AI_SETTINGS: ResumeAISettings = {
  targetRole: "",
  yearsOfExperience: "",
  technicalFocus: "",
  writingStyle: "",
  language: "zh",
  maxBulletLength: 80,
  preferMetrics: false,
  preferBusinessValue: false,
  preferTechnicalDepth: false,
  customPrompt: "",
};

/** 编辑器选区快照（用于「只替换选中文字」模式） */
export interface EditorSelectionInfo {
  from: number; // ProseMirror 文档内起始位置
  to: number;   // ProseMirror 文档内结束位置
  text: string; // 选中纯文本（发送给 AI 的内容）
}

/** AI 优化请求载荷：由 RichEditor 捕获后交给上层弹窗 */
export interface AIOptimizeRequest {
  task: ResumeAITask;
  /** 选中文字时非空；为空表示优化整个字段 */
  selection: EditorSelectionInfo | null;
}

/** RichEditor 向上层暴露的选区替换能力 */
export interface RichEditorAPI {
  /**
   * 只替换选区范围内的内容，其他内容保持不变。
   * sameBlock 场景下使用 plainText 内联插入（避免破坏句子结构），
   * 跨块场景下使用 html。
   */
  replaceSelection: (
    from: number,
    to: number,
    html: string,
    plainText: string,
  ) => void;
}
