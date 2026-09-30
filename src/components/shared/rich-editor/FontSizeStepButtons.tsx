import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 字号档位（与 FontSizeSelect 下拉保持一致） */
export const FONT_SIZE_STEPS = [
  10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32,
] as const;

/** 未显式设置字号时（default）的锚点档位：视为 14px */
const DEFAULT_STEP_ANCHOR = 14;

/** 读取选区字号状态：enabled 是否可操作；px 当前字号数字；mixed 是否混合 */
function readFontSizeState(editor: Editor) {
  const { doc, selection } = editor.state;
  const sizes = new Set<string>();
  if (!selection.empty) {
    doc.nodesBetween(selection.from, selection.to, (node) => {
      if (node.isText) {
        const style = node.marks.find((mark) => mark.type.name === "textStyle");
        sizes.add(style?.attrs.fontSize || "default");
      }
    });
  }
  if (sizes.size === 0) return { enabled: false, px: 0, mixed: false };
  if (sizes.size > 1) return { enabled: false, px: 0, mixed: true };
  const value = sizes.values().next().value as string;
  const parsed = Number.parseInt(value, 10);
  return {
    enabled: true,
    px: Number.isNaN(parsed) ? DEFAULT_STEP_ANCHOR : parsed,
    mixed: false,
  };
}

/** 沿档位阶梯取下一个 / 上一个档位（不做简单的 fontSize + 1） */
export function nextFontSizeStep(px: number, direction: 1 | -1): number {
  if (direction === 1) {
    const next = FONT_SIZE_STEPS.find((size) => size > px);
    return next ?? FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1];
  }
  const prev = [...FONT_SIZE_STEPS].reverse().find((size) => size < px);
  return prev ?? FONT_SIZE_STEPS[0];
}

/**
 * 正文字号 A- / A+ 单个按钮（direction 控制增大/减小）：
 * - 只作用于当前 Selection，选区为空或混合格式时禁用
 * - 通过 Tiptap transaction 执行，Ctrl+Z 可撤销
 */
export default function FontSizeStepButton({
  editor,
  direction,
}: {
  editor: Editor;
  direction: 1 | -1;
}) {
  const t = useTranslations("richEditor");
  const [state, setState] = useState(() => readFontSizeState(editor));

  useEffect(() => {
    const sync = () => setState(readFontSizeState(editor));
    sync();
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor]);

  const apply = () => {
    if (!state.enabled) return;
    const next = nextFontSizeStep(state.px, direction);
    editor.chain().focus().setFontSize(`${next}px`).run();
  };

  const label = direction === 1 ? t("fontSizeIncrease") : t("fontSizeDecrease");

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={state.enabled ? label : t("fontSizeSelectText")}
      disabled={!state.enabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        apply();
      }}
      className={cn(
        "h-8 w-8 p-0 rounded-md text-xs font-semibold transition-all duration-200",
        "hover:bg-primary/5 dark:hover:bg-neutral-800",
        !state.enabled && "opacity-50",
      )}
    >
      {direction === 1 ? "A+" : "A-"}
    </Button>
  );
}
