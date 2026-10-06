import type { EditorState } from "@tiptap/pm/state";

/** 插入独立标题，保留当前非空内容块（包括列表）和选中的正文。 */
export function bodyHeadingInsertion(state: EditorState, title: string) {
  const text = title.trim();
  if (!text) return null;
  const { $from } = state.selection;
  const block = $from.depth ? $from.node(1) : null;
  const replaceEmpty = block?.type.name === "paragraph" && block.content.size === 0;
  const from = block ? (replaceEmpty ? $from.before(1) : $from.after(1)) : state.doc.content.size;
  return {
    range: { from, to: replaceEmpty ? $from.after(1) : from },
    content: [
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text }] },
      { type: "paragraph" },
    ],
    cursor: from + text.length + 3,
  };
}
