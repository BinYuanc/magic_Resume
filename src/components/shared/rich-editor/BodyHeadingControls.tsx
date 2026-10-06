import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Heading3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslations } from "@/i18n/compat/client";
import { toast } from "sonner";
import { bodyHeadingInsertion } from "./bodyHeading";

export default function BodyHeadingControls({ editor }: { editor: Editor }) {
  const t = useTranslations("richEditor");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const saved = useRef(editor.state);
  const restore = () => {
    if (!editor.state.doc.eq(saved.current.doc)) {
      toast.info(t("headingContentChanged"));
      setOpen(false);
      return false;
    }
    editor.commands.setTextSelection({ from: saved.current.selection.from, to: saved.current.selection.to });
    return true;
  };
  const insert = (text: string) => {
    if (!text.trim() || !restore()) return;
    const insertion = bodyHeadingInsertion(editor.state, text);
    if (!insertion) return;
    editor.chain().focus().insertContentAt(insertion.range, insertion.content)
      .setTextSelection(insertion.cursor).unsetAllMarks().run();
    setTitle("");
    setOpen(false);
  };
  const format = (heading: boolean) => {
    if (!restore()) return;
    const chain = editor.chain().focus();
    // 将列表中的当前段落移出列表，标题不带项目符号。
    if (heading) {
      const selection = editor.state.selection;
      for (let depth = selection.$from.depth; depth > 0; depth--) {
        if (selection.$from.node(depth).type.name === "listItem") chain.liftListItem("listItem");
      }
      chain.setHeading({ level: 3 });
    } else chain.setParagraph();
    chain.run();
    setOpen(false);
  };
  return <Popover open={open} onOpenChange={(next) => {
    if (next) saved.current = editor.state;
    setOpen(next);
  }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs"
        aria-label={t("bodyHeading")} onMouseDown={(event) => event.preventDefault()}>
        <Heading3 className="h-4 w-4" />{t("bodyHeading")}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] space-y-3" align="start"
      onCloseAutoFocus={(event) => { event.preventDefault(); editor.commands.focus(); }}>
      <div className="text-sm font-medium">{t("customHeading")}</div>
      <div className="flex gap-2">
        <Input value={title} onChange={(event) => setTitle(event.target.value)}
          placeholder={t("headingPlaceholder")} aria-label={t("headingText")}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); insert(title); } }} />
        <Button type="button" size="sm" disabled={!title.trim()} onClick={() => insert(title)}>{t("insertHeading")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("headingInsertHint")}</p>
      <div className="flex flex-wrap gap-1.5">
        {["headingOwner", "headingOverview", "headingTech", "headingChallenges", "headingResults"].map((key) =>
          <Button key={key} type="button" variant="outline" size="sm" className="h-auto whitespace-normal px-2 py-1 text-xs" onClick={() => insert(t(key))}>{t(key)}</Button>)}
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => format(true)}>{t("formatHeading")}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => format(false)}>{t("formatParagraph")}</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
