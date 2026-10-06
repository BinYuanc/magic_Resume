import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { IndentDecrease, IndentIncrease } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useTranslations } from "@/i18n/compat/client";
import { MAX_INDENT, selectedIndentBlocks } from "./Indent";

const readIndent = (editor: Editor) => {
  const values = Array.from(selectedIndentBlocks(editor.state).values());
  return { values, value: new Set(values).size > 1 ? "mixed" : String(values[0] ?? 0) };
};

export default function IndentControls({ editor }: { editor: Editor }) {
  const t = useTranslations("richEditor");
  const [selection, setSelection] = useState(() => readIndent(editor));
  const savedState = useRef(editor.state);
  useEffect(() => {
    const sync = () => setSelection(readIndent(editor));
    sync();
    editor.on("transaction", sync);
    return () => { editor.off("transaction", sync); };
  }, [editor]);
  return (
    <div className="flex items-center gap-0.5">
      {([-1, 1] as const).map((direction) => {
        const label = t(direction < 0 ? "decreaseIndent" : "increaseIndent");
        const Icon = direction < 0 ? IndentDecrease : IndentIncrease;
        const disabled = !selection.values.some((value) => direction < 0 ? value > 0 : value < MAX_INDENT);
        return <Button key={direction} type="button" variant="ghost" size="sm"
          className="h-9 w-9 rounded-md p-0 hover:bg-primary/5 dark:hover:bg-neutral-800"
          aria-label={label} title={label} disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => direction < 0 ? editor.chain().focus().decreaseIndent().run() : editor.chain().focus().increaseIndent().run()}>
          <Icon className="h-5 w-5" />
        </Button>;
      })}
      <Select value={selection.value} disabled={!selection.values.length}
        onOpenChange={(open) => { if (open) savedState.current = editor.state; }}
        onValueChange={(value) => {
          const saved = savedState.current;
          if (!editor.state.doc.eq(saved.doc)) return;
          editor.chain().focus().setTextSelection({ from: saved.selection.from, to: saved.selection.to }).setIndent(Number(value)).run();
        }}>
        <SelectTrigger className="h-8 w-28 text-xs" aria-label={t("paragraphIndent")}>
          <span>{selection.value === "mixed" ? t("indentMixed") : selection.value === "0" ? t("indentNone") : t("indentChars", { count: selection.value })}</span>
        </SelectTrigger>
        <SelectContent onCloseAutoFocus={(event) => { event.preventDefault(); editor.commands.focus(); }}>
          {Array.from({ length: MAX_INDENT + 1 }, (_, value) => <SelectItem key={value} value={String(value)}>
            {value === 0 ? t("indentNone") : t("indentChars", { count: value })}
          </SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
