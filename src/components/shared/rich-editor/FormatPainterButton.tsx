import { Paintbrush } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFormatPainter } from "./useFormatPainter";

/**
 * 格式刷按钮：
 * - 单击：捕获当前选区格式 → 选中目标文字自动应用一次后退出
 * - 双击：锁定格式刷，可连续刷多段，Esc 或再次点击退出
 * 锁定状态下按钮明显高亮。
 */
export default function FormatPainterButton({ editor }: { editor: Editor }) {
  const t = useTranslations("richEditor");
  const { mode, activateOnce, activateLocked } = useFormatPainter(editor);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={mode === "locked" ? t("formatPainterLocked") : t("formatPainter")}
      title={mode === "locked" ? t("formatPainterLocked") : t("formatPainter")}
      // 阻止 mousedown 夺走编辑器焦点，保证捕获时选区仍然有效
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        activateOnce();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        activateLocked();
      }}
      className={cn(
        "h-9 w-9 p-0 rounded-md transition-all duration-200 hover:scale-105",
        mode === "locked"
          ? "bg-primary text-primary-foreground ring-2 ring-primary/40 hover:bg-primary/90"
          : mode === "once"
            ? "bg-primary/15 text-primary hover:bg-primary/25"
            : "hover:bg-primary/5 dark:hover:bg-neutral-800",
      )}
    >
      <Paintbrush className="h-5 w-5" />
    </Button>
  );
}
