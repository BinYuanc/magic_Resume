/** Codex 读取的展示规则说明与可直接提交的模板示例。 */
export const mcpTemplateGuide = {
  schemaVersion: 1,
  workflow: ["从用户截图辨认栏数、基本信息对齐、字体、字号、色彩、分隔线、模块间距和模块顺序", "先 list_templates 避免 id 冲突", "create_template 创建模板", "用户已有简历时 get_resume → apply_template(preserveOverrides=false)；否则 create_resume", "网页检查视觉效果，再 update_template 微调"],
  rules: ["只保存展示规则，不复制截图中的个人信息或经历正文", "id 使用小写字母/数字/连字符，不超过40字符", "页面为A4；px为单位；正文8–24，标题8–40，副标题8–32，行距0.8–3", "两栏权重main/side各1–6；section key为basic/summary/skills/experience/projects/education/certificates/custom", "sectionStyles支持标题字号/字重/颜色/对齐/分隔线、模块背景、模块间距spacing、条目间距itemSpacing", "仅支持单栏/双栏、文本标题和水平线；任意形状、复杂多层表格、渐变装饰与特殊字体不能保证逐像素一致。遇到不支持的样式告知用户并用最接近的展示规则，不生成JS/CSS代码", "模板创建后出现在 我的模板，可跨简历复用。两栏DOCX为简化线性布局；网页/PDF保留两栏"],
  example: {
    manifest: { schemaVersion: 1, id: "screenshot-blue", name: "蓝色清晰简历", description: "根据参考图提取的展示样式", category: "professional", tags: ["蓝色", "单栏"] },
    layout: { layout: "single-column", basicLayout: "left", pagePadding: 32, order: ["basic", "skills", "experience", "projects", "education", "summary", "certificates", "custom"], columns: { main: 2, side: 1 }, columnAssignment: { skills: "side", education: "side", experience: "main", projects: "main" } },
    theme: { fontFamily: "Microsoft YaHei", baseFontSize: 16, headerSize: 24, subheaderSize: 16, lineHeight: 1.5, colors: { primary: "#3b82f6", text: "#262626", background: "#ffffff" }, spacing: { sectionGap: 24, itemGap: 12, contentPadding: 32 }, sectionStyles: { default: { fontSize: 18, fontWeight: 700, color: "#3b82f6", border: true, align: "left" }, experience: { spacing: 24, itemSpacing: 16 } } },
  },
};
