import { Node, mergeAttributes } from "@tiptap/core";
/** 真正的语义 Node；输出标准 H3 以兼容预览/PDF/Word，同时标记类型。 */
export const ResumeSectionHeading = Node.create({
  name: "resumeSectionHeading", group: "block", content: "inline*", defining: true,
  addAttributes() { return {
    sectionId: { default: null, parseHTML: el => el.getAttribute("data-section-id"), renderHTML: attrs => attrs.sectionId ? { "data-section-id": attrs.sectionId } : {} },
    inline: { default: false, parseHTML: el => el.getAttribute("data-body-inline") === "1", renderHTML: attrs => attrs.inline ? { "data-body-inline": "1" } : {} },
  }; },
  parseHTML() { return [{ tag: 'h3[data-resume-section="1"]', priority: 100 }]; },
  renderHTML({ HTMLAttributes }) { return ["h3", mergeAttributes(HTMLAttributes, { "data-resume-section": "1" }), 0]; },
});
