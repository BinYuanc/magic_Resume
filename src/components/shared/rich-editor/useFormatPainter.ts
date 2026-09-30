import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";

/**
 * ProseMirror Mark 的最小结构类型。
 * 项目未直接安装 @tiptap/pm（经 @tiptap/react 传递依赖、未提升），
 * 这里只声明用到的字段，真实 Mark 结构天然兼容（type.name + attrs）。
 */
export interface MarkLike {
  type: { name: string };
  attrs: Record<string, unknown>;
}

/** 格式刷模式：off 未启用 / once 单次 / locked 双击锁定 */
export type FormatPainterMode = "off" | "once" | "locked";

/** 格式快照：仅 inline 样式，V1 明确不复制 link / 列表 / 对齐 / Heading */
export interface TextFormatSnapshot {
  fontSize?: string;   // 字号（如 "16px"）
  color?: string;      // 字体颜色
  highlight?: string;  // 背景高亮色
  bold: boolean;       // 是否粗体
  italic: boolean;     // 是否斜体
  underline: boolean;  // 是否下划线
}

/** 从一组 marks 中提取 inline 格式（忽略 link，避免把 URL 刷到别的文字上） */
export function snapshotFromMarks(marks: readonly MarkLike[]): TextFormatSnapshot {
  const snapshot: TextFormatSnapshot = {
    bold: false,
    italic: false,
    underline: false,
  };
  for (const mark of marks) {
    switch (mark.type.name) {
      case "bold":
        snapshot.bold = true;
        break;
      case "italic":
        snapshot.italic = true;
        break;
      case "underline":
        snapshot.underline = true;
        break;
      case "textStyle": {
        const fontSize = mark.attrs.fontSize;
        const color = mark.attrs.color;
        if (typeof fontSize === "string" && fontSize) snapshot.fontSize = fontSize;
        if (typeof color === "string" && color) snapshot.color = color;
        break;
      }
      case "highlight": {
        const color = mark.attrs.color;
        if (typeof color === "string" && color) snapshot.highlight = color;
        break;
      }
      default:
        break;
    }
  }
  return snapshot;
}

const snapshotEquals = (a: TextFormatSnapshot, b: TextFormatSnapshot) =>
  a.fontSize === b.fontSize &&
  a.color === b.color &&
  a.highlight === b.highlight &&
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.underline === b.underline;

/**
 * 格式刷 Hook（Word / WPS 交互）：
 * - 选中源文字 → 单击按钮：进入 once，选中目标文字自动应用后退出
 * - 双击按钮：进入 locked，可连续刷多段，Esc 或再次点击退出
 * - 源为混合格式时：使用选区起始位置第一段有效文本的样式并提示
 */
export function useFormatPainter(editor: Editor | null) {
  const t = useTranslations("richEditor");
  const [mode, setMode] = useState<FormatPainterMode>("off");
  const snapshotRef = useRef<TextFormatSnapshot | null>(null);
  /** 源选区范围：避免刚捕获时对源选区自身重复应用 */
  const sourceRangeRef = useRef<{ from: number; to: number } | null>(null);
  /** 应用事务进行中：防止 selectionUpdate 回环 */
  const applyingRef = useRef(false);

  const deactivate = useCallback(() => {
    setMode("off");
    snapshotRef.current = null;
    sourceRangeRef.current = null;
  }, []);

  /** 通过 Tiptap Selection + Marks 读取源格式（不操作 DOM） */
  const capture = useCallback((): boolean => {
    if (!editor) return false;
    const { doc, selection } = editor.state;
    if (selection.empty) {
      toast.info(t("formatPainterNoSelection"));
      return false;
    }

    // 收集选区内所有文本节点的格式快照
    const snapshots: TextFormatSnapshot[] = [];
    doc.nodesBetween(selection.from, selection.to, (node) => {
      if (node.isText && node.text?.trim()) {
        snapshots.push(snapshotFromMarks(node.marks));
      }
    });

    if (!snapshots.length) {
      toast.info(t("formatPainterNoSelection"));
      return false;
    }

    // 混合格式：使用起始位置第一段有效文本的样式
    const first = snapshots[0];
    const mixed = snapshots.some((item) => !snapshotEquals(item, first));
    if (mixed) {
      toast.info(t("formatPainterMixed"));
    }

    snapshotRef.current = first;
    sourceRangeRef.current = { from: selection.from, to: selection.to };
    return true;
  }, [editor, t]);

  /** 单击：off → 捕获并进入 once；once/locked → 退出 */
  const activateOnce = useCallback(() => {
    if (mode !== "off") {
      deactivate();
      return;
    }
    if (capture()) setMode("once");
  }, [mode, capture, deactivate]);

  /** 双击：捕获并进入 locked */
  const activateLocked = useCallback(() => {
    if (capture()) setMode("locked");
  }, [capture]);

  /** 将快照应用到目标选区（单个 chain = 单个 transaction = 一步撤销） */
  const applyTo = useCallback(
    (from: number, to: number) => {
      const snapshot = snapshotRef.current;
      if (!editor || !snapshot) return;

      applyingRef.current = true;
      try {
        const chain = editor.chain().focus().setTextSelection({ from, to });
        if (snapshot.bold) chain.setBold();
        else chain.unsetBold();
        if (snapshot.italic) chain.setItalic();
        else chain.unsetItalic();
        if (snapshot.underline) chain.setUnderline();
        else chain.unsetUnderline();
        if (snapshot.fontSize) chain.setFontSize(snapshot.fontSize);
        else chain.unsetFontSize();
        if (snapshot.color) chain.setColor(snapshot.color);
        else chain.unsetColor();
        if (snapshot.highlight) chain.setHighlight({ color: snapshot.highlight });
        else chain.unsetHighlight();
        chain.run();
      } finally {
        // 等本次 transaction 的 selectionUpdate 事件循环结束后再解锁
        requestAnimationFrame(() => {
          applyingRef.current = false;
        });
      }
    },
    [editor],
  );

  /** 监听选区变化：模式开启且用户选中了新目标 → 自动应用 */
  useEffect(() => {
    if (!editor || mode === "off") return;

    const onSelectionUpdate = () => {
      if (applyingRef.current || !snapshotRef.current) return;
      const { selection } = editor.state;
      if (selection.empty) return;
      const source = sourceRangeRef.current;
      // 跳过源选区自身
      if (source && selection.from === source.from && selection.to === source.to) {
        return;
      }
      applyTo(selection.from, selection.to);
      if (mode === "once") {
        deactivate();
      }
    };

    editor.on("selectionUpdate", onSelectionUpdate);
    return () => {
      editor.off("selectionUpdate", onSelectionUpdate);
    };
  }, [editor, mode, applyTo, deactivate]);

  /** Esc 退出（监听编辑器 DOM，锁定与单次都生效） */
  useEffect(() => {
    if (!editor || mode === "off") return;
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        deactivate();
      }
    };
    dom.addEventListener("keydown", onKeyDown);
    return () => {
      dom.removeEventListener("keydown", onKeyDown);
    };
  }, [editor, mode, deactivate]);

  /** 编辑器卸载时重置 */
  useEffect(() => {
    if (!editor) deactivate();
  }, [editor, deactivate]);

  return { mode, activateOnce, activateLocked, deactivate };
}
