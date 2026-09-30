import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useResumeStore } from "@/store/useResumeStore";
import { useCustomTemplateStore } from "@/store/useCustomTemplateStore";
import { resolveTemplateDefinition } from "@/lib/templateResolver";
import { resolveResumeStyle } from "@/lib/resumeStyle";

/** 字号档位（与 FontSizeSelect 下拉保持一致） */
export const FONT_SIZE_STEPS = [
  10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32,
] as const;

/** 拿不到简历默认字号时的兜底锚点 */
const DEFAULT_STEP_ANCHOR = 14;

/**
 * 步进锚点：选区没有显式字号（=「默认」）时，用**简历当前生效的默认字号**作为基准，
 * 这样默认 16px 的简历点 A+ 得到 18px，而不是从写死的 14px 出发得到 15px。
 */
export function resolveStepAnchor(explicitPx: number | null, defaultPx: number): number {
  if (explicitPx !== null) return explicitPx;
  return Number.isFinite(defaultPx) && defaultPx > 0 ? defaultPx : DEFAULT_STEP_ANCHOR;
}

/** 读取选区字号状态：enabled 是否可操作；px 显式字号（null = 默认字号）；mixed 是否混合 */
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
  if (sizes.size === 0) return { enabled: false, px: null, mixed: false };
  if (sizes.size > 1) return { enabled: false, px: null, mixed: true };
  const value = sizes.values().next().value as string;
  const parsed = Number.parseInt(value, 10);
  return {
    enabled: true,
    px: Number.isNaN(parsed) ? null : parsed,
    mixed: false,
  };
}

/** 简历当前生效的默认正文字号（模板默认 + 用户全局覆盖 + 旧字段） */
function useDefaultBodyFontSize(): number {
  const activeResume = useResumeStore((state) => state.activeResume);
  const customTemplates = useCustomTemplateStore((state) => state.templates);
  const templateId = activeResume?.templateId;
  const legacyBase = activeResume?.globalSettings?.baseFontSize;
  const overrideBase = activeResume?.styleOverrides?.global?.baseFontSize;
  return useMemo(() => {
    const definition = resolveTemplateDefinition(templateId, customTemplates);
    return resolveResumeStyle(
      definition,
      overrideBase === undefined ? undefined : { global: { baseFontSize: overrideBase } },
      legacyBase === undefined ? undefined : { baseFontSize: legacyBase }
    ).baseFontSize;
  }, [templateId, legacyBase, overrideBase, customTemplates]);
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
  const defaultBodyFontSize = useDefaultBodyFontSize();
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
    // 「默认」时以简历当前生效的默认字号为基准，而不是写死的 14px
    const anchor = resolveStepAnchor(state.px, defaultBodyFontSize);
    const next = nextFontSizeStep(anchor, direction);
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
