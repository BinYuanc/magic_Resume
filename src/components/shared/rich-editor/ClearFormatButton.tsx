import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Eraser } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 清除格式按钮：
 * 只清除选区内的 fontSize / color / highlight / bold / italic / underline，
 * 不删除文字，不碰 link（避免误删 URL）。单个 chain = 一步撤销。
 */
export default function ClearFormatButton({ editor }: { editor: Editor }) {
  const t = useTranslations("richEditor");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(!editor.state.selection.empty);
    sync();
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor]);

  const clearFormat = () => {
    if (!enabled) return;
    editor
      .chain()
      .focus()
      .unsetFontSize()
      .unsetColor()
      .unsetHighlight()
      .unsetBold()
      .unsetItalic()
      .unsetUnderline()
      .run();
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={t("clearFormat")}
      title={enabled ? t("clearFormat") : t("clearFormatSelectText")}
      disabled={!enabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        clearFormat();
      }}
      className={cn(
        "h-9 w-9 p-0 rounded-md transition-all duration-200 hover:scale-105",
        "hover:bg-primary/5 dark:hover:bg-neutral-800",
        !enabled && "opacity-50",
      )}
    >
      <Eraser className="h-5 w-5" />
    </Button>
  );
}
