import { Extension, type CommandProps, type Editor } from "@tiptap/core";

export const MAX_INDENT = 8;
export const normalizeIndent = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(MAX_INDENT, Math.round(number))) : 0;
};

/** 列表按条目缩进，普通正文按段落缩进；同一个条目只处理一次。 */
export function selectedIndentBlocks(state: Editor["state"]) {
  const blocks = new Map<number, number>();
  const collect = (pos: number) => {
    const resolved = state.doc.resolve(pos);
    for (let depth = resolved.depth; depth > 0; depth--) {
      if (resolved.node(depth).type.name === "listItem") {
        blocks.set(resolved.before(depth), normalizeIndent(resolved.node(depth).attrs.indent));
        return;
      }
    }
    const node = resolved.parent;
    if (["paragraph", "heading", "resumeSectionHeading"].includes(node.type.name)) {
      blocks.set(resolved.before(), normalizeIndent(node.attrs.indent));
    }
  };
  if (state.selection.empty) collect(state.selection.from);
  else state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (node.isTextblock) collect(pos + 1);
  });
  return blocks;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      setIndent: (value: number) => ReturnType;
      increaseIndent: () => ReturnType;
      decreaseIndent: () => ReturnType;
    };
  }
}

export const Indent = Extension.create({
  name: "indent",
  addGlobalAttributes() {
    return [{ types: ["paragraph", "heading", "resumeSectionHeading", "listItem"], attributes: {
      indent: {
        default: 0,
        parseHTML: (element) => normalizeIndent(element.getAttribute("data-indent")),
        renderHTML: (attributes) => {
          const indent = normalizeIndent(attributes.indent);
          return indent ? { "data-indent": String(indent), style: `margin-left: ${indent}em` } : {};
        },
      },
    } }];
  },
  addCommands() {
    const apply = (value: number, relative: boolean) => ({ state, tr, dispatch }: CommandProps) => {
      const blocks = selectedIndentBlocks(state);
      if (!blocks.size) return false;
      if (dispatch) for (const [pos, current] of Array.from(blocks)) {
        const node = tr.doc.nodeAt(pos)!;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: normalizeIndent(relative ? current + value : value) });
      }
      return true;
    };
    return {
      setIndent: (value) => apply(value, false),
      increaseIndent: () => apply(1, true),
      decreaseIndent: () => apply(-1, true),
    };
  },
});
