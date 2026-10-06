import React, { useEffect, useMemo } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { useTranslations } from "@/i18n/compat/client";
import StarterKit from "@tiptap/starter-kit";
import { ListKit } from "@tiptap/extension-list";
import TextAlign from "@tiptap/extension-text-align";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import FontSizeSelect from "./FontSizeSelect";
import FontSizeStepButton from "./FontSizeStepButtons";
import FormatPainterButton from "./FormatPainterButton";
import ClearFormatButton from "./ClearFormatButton";
import Underline from "@tiptap/extension-underline";
import Color from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Undo,
  Redo,
  PaintBucket,
  Highlighter,
  Wand2,
  Link2,
  Unlink,
  ArrowRightToLine,
  CornerDownLeft,
} from "lucide-react";
import Highlight from "@tiptap/extension-highlight";
import { cn } from "@/lib/utils";
import {
  hasMeaningfulRichTextContent,
  normalizeLinkHref,
  stripLegacyRichTextClasses,
  stripTrailingListParagraph,
} from "@/lib/richText";
import type {
  AIOptimizeRequest,
  ResumeAITask,
  RichEditorAPI,
} from "@/types/ai-resume";
import { plainTextToParagraphs, sanitizePastedHtml } from "@/lib/pasteSanitize";
import AIOptimizeMenu from "../ai/AIOptimizeMenu";
import { BetterSpace } from "./BetterSpace";
import { Indent } from "./Indent";
import IndentControls from "./IndentControls";
import { toast } from "sonner";
import "@/styles/tiptap.scss";

interface RichTextEditorProps {
  content?: string;
  onChange: (content: string) => void;
  placeholder?: string;
  onPolish?: () => void;
  /** AI 优化助手：传入后替换旧的 AI 润色按钮为「AI 优化 ▼」菜单 */
  onAIOptimize?: (request: AIOptimizeRequest) => void;
  /** 向上层暴露选区替换能力（仅替换选中文字时使用） */
  editorApiRef?: React.MutableRefObject<RichEditorAPI | null>;
  /**
   * 正文块小标题的排版：stacked = 标题独占一行，inline = 标题与正文同一行。
   * 仅正文块（BodySectionsField）传入；不传时不显示该按钮。
   */
  bodyTitleMode?: "stacked" | "inline";
  onToggleBodyTitleMode?: () => void;
}

interface ColorOption {
  label: string;
  value: string;
}

const normalizeEditorHtml = (value?: string) =>
  stripTrailingListParagraph(stripLegacyRichTextClasses(value));

const getColors = (t: any): ColorOption[] => [
  { label: t("colors.black"), value: "#000000" },
  { label: t("colors.darkGray"), value: "#333333" },
  { label: t("colors.gray"), value: "#666666" },
  { label: t("colors.red"), value: "#FF0000" },
  { label: t("colors.orange"), value: "#FF4D00" },
  { label: t("colors.orangeYellow"), value: "#FF9900" },
  { label: t("colors.yellow"), value: "#FFCC00" },
  { label: t("colors.yellowGreen"), value: "#33CC00" },
  { label: t("colors.green"), value: "#00CC00" },
  { label: t("colors.cyan"), value: "#00CCCC" },
  { label: t("colors.lightBlue"), value: "#0066FF" },
  { label: t("colors.blue"), value: "#0000FF" },
  { label: t("colors.purple"), value: "#6600FF" },
  { label: t("colors.magenta"), value: "#CC00FF" },
  { label: t("colors.pink"), value: "#FF00FF" },
];

const getBgColors = getColors;

interface MenuButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  tooltip?: string;
}

const MenuButton = ({
  onClick,
  isActive = false,
  disabled = false,
  children,
  className = "",
  tooltip,
}: MenuButtonProps) => {
  const [showTooltip, setShowTooltip] = React.useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <Button
        onMouseDown={(e) => e.preventDefault()}
        variant={isActive ? "secondary" : "ghost"}
        size="sm"
        className={cn(
          "h-9 w-9 rounded-md transition-all duration-200 hover:scale-105 p-0",
          isActive
            ? "bg-primary/10 text-primary hover:bg-primary/20 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            : "hover:bg-primary/5 dark:hover:bg-neutral-800",
          disabled ? "opacity-50" : "",
          className
        )}
        onClick={handleClick}
        disabled={disabled}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {children}
      </Button>
      {tooltip && showTooltip && (
        <div
          className={cn(
            "absolute -bottom-8 left-1/2 transform -translate-x-1/2",
            "px-2 py-1 text-xs rounded-md whitespace-nowrap z-50",
            "transition-opacity duration-200",
            "bg-secondary text-secondary-foreground dark:bg-neutral-800 dark:text-neutral-200"
          )}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
};

const TextColorButton = ({ editor }: { editor: Editor }) => {
  const [activeColor, setActiveColor] = React.useState<string | null>(null);
  const t = useTranslations("richEditor");
  const colors = getColors(t);

  React.useEffect(() => {
    const syncActiveColor = () => {
      const color = editor.getAttributes("textStyle").color;
      setActiveColor(typeof color === "string" ? color : null);
    };

    syncActiveColor();
    editor.on("selectionUpdate", syncActiveColor);
    editor.on("transaction", syncActiveColor);

    return () => {
      editor.off("selectionUpdate", syncActiveColor);
      editor.off("transaction", syncActiveColor);
    };
  }, [editor]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 rounded-md hover:scale-105 transition-all duration-200 hover:bg-primary/5 relative group"
        >
          <PaintBucket
            className="h-5 w-5"
            style={{
              color: activeColor || "currentColor",
              filter: activeColor
                ? "drop-shadow(0 1px 1px rgba(0,0,0,0.1))"
                : "none",
            }}
          />
          <span className="sr-only">{t("textColor")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 rounded-lg">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <PaintBucket className="h-4 w-4" />
            <span className="text-sm font-medium">{t("textColor")}</span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            <button
              className="h-8 w-8 rounded-md border border-border flex items-center justify-center hover:bg-muted"
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setActiveColor(null);
              }}
            >
              <span className="text-xl leading-none text-muted-foreground">
                /
              </span>
            </button>
            {colors.map((color: ColorOption) => (
              <button
                key={color.value}
                className={`h-8 w-8 rounded-md border hover:scale-110 transition-transform relative
                  ${
                    activeColor === color.value
                      ? "ring-2 ring-primary ring-offset-2"
                      : ""
                  }`}
                style={{
                  backgroundColor: color.value,
                  borderColor:
                    color.value === "#FFFFFF" ? "#E2E8F0" : color.value,
                }}
                onClick={() => {
                  editor.chain().focus().setColor(color.value).run();
                  setActiveColor(color.value);
                }}
                title={color.label}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const BackgroundColorButton = ({ editor }: { editor: Editor }) => {
  const [activeBgColor, setActiveBgColor] = React.useState<string | null>(null);
  const t = useTranslations("richEditor");
  const bgColors = getBgColors(t);

  useEffect(() => {
    const syncActiveBgColor = () => {
      const highlight = editor.getAttributes("highlight");
      const highlightColor =
        typeof highlight === "string"
          ? highlight
          : typeof highlight?.color === "string"
            ? highlight.color
            : null;
      setActiveBgColor(highlightColor);
    };

    syncActiveBgColor();
    editor.on("selectionUpdate", syncActiveBgColor);
    editor.on("transaction", syncActiveBgColor);

    return () => {
      editor.off("selectionUpdate", syncActiveBgColor);
      editor.off("transaction", syncActiveBgColor);
    };
  }, [editor]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 rounded-md hover:scale-105 transition-all duration-200 hover:bg-primary/5 relative group"
        >
          <div className="relative">
            <Highlighter
              className="h-5 w-5"
              style={{
                color: activeBgColor ? "currentColor" : "currentColor",
                filter: activeBgColor
                  ? "drop-shadow(0 1px 1px rgba(0,0,0,0.1))"
                  : "none",
              }}
            />
            {activeBgColor && (
              <div
                className="absolute -right-1 -bottom-1 w-2 h-2 rounded-full border border-white"
                style={{ backgroundColor: activeBgColor }}
              />
            )}
          </div>
          <span className="sr-only">{t("backgroundColor")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 rounded-lg">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Highlighter className="h-4 w-4" />
            <span className="text-sm font-medium">{t("backgroundColor")}</span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            <button
              className="h-8 w-8 rounded-md border border-border flex items-center justify-center hover:bg-muted"
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setActiveBgColor(null);
              }}
            >
              <span className="text-xl leading-none text-muted-foreground">
                /
              </span>
            </button>
            {bgColors.map((color: ColorOption) => (
              <button
                key={color.value}
                className={`h-8 w-8 rounded-md border hover:scale-110 transition-transform relative
                  ${
                    activeBgColor === color.value
                      ? "ring-2 ring-primary ring-offset-2"
                      : ""
                  }`}
                style={{
                  backgroundColor: color.value,
                  borderColor: "transparent",
                }}
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .setHighlight({ color: color.value })
                    .run();
                  setActiveBgColor(color.value);
                }}
                title={color.label}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const LinkButton = ({ editor }: { editor: Editor }) => {
  const [open, setOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");
  const t = useTranslations("richEditor");

  React.useEffect(() => {
    if (!open) return;
    setLinkUrl(editor.getAttributes("link").href || "");
  }, [editor, open]);

  const applyLink = () => {
    const normalizedHref = normalizeLinkHref(linkUrl);

    if (!normalizedHref) {
      toast.error(t("linkInvalid"));
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({
        href: normalizedHref,
        target: "_blank",
        rel: "noopener noreferrer",
      })
      .run();

    setLinkUrl(normalizedHref);
    setOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkUrl("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={editor.isActive("link") ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-9 w-9 p-0 rounded-md transition-all duration-200 hover:scale-105",
            editor.isActive("link")
              ? "bg-primary/10 text-primary hover:bg-primary/20 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              : "hover:bg-primary/5 dark:hover:bg-neutral-800"
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Link2 className="h-5 w-5" />
          <span className="sr-only">{t("link")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 rounded-lg" align="start">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            <span className="text-sm font-medium">{t("link")}</span>
          </div>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder={t("linkPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
          />
          <div className="flex items-center justify-end gap-2">
            {editor.isActive("link") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={removeLink}
              >
                <Unlink className="h-4 w-4 mr-1.5" />
                {t("linkRemove")}
              </Button>
            )}
            <Button type="button" size="sm" onClick={applyLink}>
              {t("linkApply")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const RichTextEditor = ({
  content = "",
  placeholder = "",
  onChange,
  onPolish,
  onAIOptimize,
  editorApiRef,
  bodyTitleMode,
  onToggleBodyTitleMode,
}: RichTextEditorProps) => {
  const t = useTranslations("richEditor");
  const initialContent = useMemo(
    () => normalizeEditorHtml(content),
    []
  );
  const lastSyncedContentRef = React.useRef(initialContent);
  const [isEditorEmpty, setIsEditorEmpty] = React.useState(
    !hasMeaningfulRichTextContent(content)
  );
  // Ctrl+Shift+V 纯文本粘贴标记 / editor 引用（editorProps 闭包内使用）
  const plainPasteRef = React.useRef(false);
  const editorRef = React.useRef<Editor | null>(null);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        link: false,
        underline: false,
        heading: {
          levels: [1, 2, 3],
        },
      }),
      ListKit.configure({
        bulletList: {},
        orderedList: {},
        listItem: {},
        listKeymap: {},
        taskItem: false,
        taskList: false,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      TextStyle,
      FontSize,
      Underline,
      Color,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
        isAllowedUri: (url, ctx) =>
          ctx.defaultValidate(url) && Boolean(normalizeLinkHref(url)),
        shouldAutoLink: (url) => Boolean(normalizeLinkHref(url)),
      }),
      Highlight.configure({ multicolor: true }),
      BetterSpace,
      Indent,
    ],
    []
  );

  const editorProps = useMemo(
    () => ({
      attributes: {
        class: cn(
          "tiptap max-w-none focus:outline-none min-h-[150px] px-4 py-3",
          "text-neutral-900 dark:text-neutral-200"
        ),
      },
      // 普通粘贴：净化外部 HTML（去 style/class/字体/颜色/背景/间距），
      // 保留 bold/italic/underline/list/link 等基础格式，继承当前简历样式
      transformPastedHTML: (html: string) => sanitizePastedHtml(html),
      handleDOMEvents: {
        // 记录 Ctrl+Shift+V，下一次 handlePaste 走纯文本粘贴
        keydown: (_view: unknown, event: KeyboardEvent) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === "v"
          ) {
            plainPasteRef.current = true;
          }
          return false;
        },
      },
      handlePaste: (_view: unknown, event: ClipboardEvent) => {
        if (!plainPasteRef.current) return false;
        plainPasteRef.current = false;
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return false;
        editorRef.current
          ?.chain()
          .focus()
          .insertContent(plainTextToParagraphs(text))
          .run();
        return true;
      },
    }),
    []
  );

  const editor = useEditor({
    extensions,
    content: initialContent,
    onUpdate: ({ editor }) => {
      const normalizedHtml = normalizeEditorHtml(editor.getHTML());
      setIsEditorEmpty(editor.isEmpty);

      if (normalizedHtml === lastSyncedContentRef.current) {
        return;
      }

      lastSyncedContentRef.current = normalizedHtml;
      onChange(normalizedHtml);
    },
    editorProps,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    const normalizedContent = normalizeEditorHtml(content);
    const normalizedEditorContent = normalizeEditorHtml(editor.getHTML());

    if (
      normalizedContent === lastSyncedContentRef.current ||
      normalizedContent === normalizedEditorContent
    ) {
      lastSyncedContentRef.current = normalizedContent;
      setIsEditorEmpty(editor.isEmpty);
      return;
    }

    editor.commands.setContent(normalizedContent, { emitUpdate: false });
    lastSyncedContentRef.current = normalizedContent;
    setIsEditorEmpty(editor.isEmpty);
  }, [content, editor]);

  /**
   * AI 优化菜单选择任务后：
   * 捕获当前 Tiptap Selection。选中了文字 → 只优化选中片段；
   * 未选中 → 优化整个字段。
   */
  const handleAITaskSelect = (task: ResumeAITask) => {
    if (!editor || !onAIOptimize) return;

    const { from, to, empty } = editor.state.selection;
    let selection: AIOptimizeRequest["selection"] = null;

    if (!empty) {
      const text = editor.state.doc.textBetween(from, to, "\n").trim();
      if (text) {
        selection = { from, to, text };
      }
    }

    onAIOptimize({ task, selection });
  };

  /**
   * 向上层暴露选区替换能力：
   * - 选区在同一个文本块内 → 插入纯文本（内联替换，不破坏句子结构）
   * - 跨块 → 插入解析后的 HTML
   */
  useEffect(() => {
    if (!editorApiRef || !editor) return;

    editorApiRef.current = {
      replaceSelection: (from, to, html, plainText) => {
        const docSize = editor.state.doc.content.size;
        const safeFrom = Math.max(0, Math.min(from, docSize));
        const safeTo = Math.max(safeFrom, Math.min(to, docSize));
        const $from = editor.state.doc.resolve(safeFrom);
        const $to = editor.state.doc.resolve(safeTo);
        const sameParent = $from.parent === $to.parent;

        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: safeFrom, to: safeTo },
            sameParent ? plainText : html,
          )
          .run();
      },
    };

    return () => {
      if (editorApiRef) {
        editorApiRef.current = null;
      }
    };
  }, [editor, editorApiRef]);

  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg overflow-hidden border shadow-sm",
        "bg-card border-gray-100 dark:bg-neutral-900/30 dark:border-neutral-800"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "border-b px-2 py-1.5 flex flex-wrap items-center gap-3",
          "bg-background dark:bg-neutral-900/50 dark:border-neutral-800"
        )}
      >
        <div className="flex flex-wrap items-center gap-0.5">
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            tooltip={t("bold")}
          >
            <Bold className="h-5 w-5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            tooltip={t("italic")}
          >
            <Italic className="h-5 w-5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive("underline")}
            tooltip={t("underline")}
          >
            <UnderlineIcon className="h-5 w-5" />
          </MenuButton>
          <LinkButton editor={editor} />
          <TextColorButton editor={editor} />
          <BackgroundColorButton editor={editor} />
          <FormatPainterButton editor={editor} />
          <FontSizeStepButton editor={editor} direction={-1} />
          <FontSizeSelect editor={editor} />
          <FontSizeStepButton editor={editor} direction={1} />
          <ClearFormatButton editor={editor} />
        </div>

        <div className={cn("h-5 w-px", "bg-border/60 dark:bg-neutral-800")} />

        <div className="flex items-center gap-0.5">
          <MenuButton
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            isActive={editor.isActive({ textAlign: "left" })}
            tooltip={t("alignLeft")}
          >
            <AlignLeft className="h-5 w-5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            isActive={editor.isActive({ textAlign: "center" })}
            tooltip={t("alignCenter")}
          >
            <AlignCenter className="h-5 w-5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            isActive={editor.isActive({ textAlign: "right" })}
            tooltip={t("alignRight")}
          >
            <AlignRight className="h-5 w-5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            isActive={editor.isActive({ textAlign: "justify" })}
            tooltip={t("alignJustify")}
          >
            <AlignJustify className="h-5 w-5" />
          </MenuButton>
        </div>

        <div className={cn("h-5 w-px", "bg-border/60 dark:bg-neutral-800")} />

        <div className="flex items-center gap-0.5">
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive("bulletList")}
            tooltip={t("bulletList")}
          >
            <List className="h-5 w-5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive("orderedList")}
            tooltip={t("orderedList")}
          >
            <ListOrdered className="h-5 w-5" />
          </MenuButton>
        </div>

        <div className={cn("h-5 w-px", "bg-border/60 dark:bg-neutral-800")} />

        <IndentControls editor={editor} />

        <div className="flex items-center space-x-1">
          <MenuButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            tooltip={t("undo")}
          >
            <Undo className="h-4 w-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            tooltip={t("redo")}
          >
            <Redo className="h-4 w-4" />
          </MenuButton>
          {onAIOptimize ? (
            <AIOptimizeMenu onSelect={handleAITaskSelect} />
          ) : (
            onPolish && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPolish();
                }}
                className="h-8 px-3 text-xs gap-1.5 ml-1 border-primary/20 hover:border-primary/40 text-primary hover:bg-primary/5 transition-all duration-300 group"
              >
                <Wand2 className="h-3 w-3 group-hover:rotate-12 transition-transform" />
                {t("aiPolish")}
              </Button>
            )
          )}
          {bodyTitleMode && onToggleBodyTitleMode && (
            // 正文块小标题的排版：标题独占一行 / 标题与正文同一行
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={bodyTitleMode === "inline"}
              aria-label={bodyTitleMode === "inline" ? t("bodySectionLayoutStackedHint") : t("bodySectionLayoutInlineHint")}
              title={bodyTitleMode === "inline" ? t("bodySectionLayoutStackedHint") : t("bodySectionLayoutInlineHint")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleBodyTitleMode();
              }}
              className="h-8 gap-1.5 px-3 text-xs ml-1"
            >
              {bodyTitleMode === "inline" ? <CornerDownLeft className="h-3.5 w-3.5" /> : <ArrowRightToLine className="h-3.5 w-3.5" />}
              {bodyTitleMode === "inline" ? t("bodySectionLayoutStacked") : t("bodySectionLayoutInline")}
            </Button>
          )}
        </div>
      </div>

      {/* Editor Content */}
      <div className="relative">
        {placeholder && isEditorEmpty && (
          <div className="pointer-events-none absolute left-4 top-3 text-muted-foreground text-sm">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* Bubble Menu */}
      {/* {editor && (
        <BubbleMenu
          className={cn(
            "flex items-center gap-0.5 p-1 rounded-md backdrop-blur border shadow-lg",
            theme === "dark"
              ? "bg-neutral-900/80 border-neutral-800"
              : "bg-background/80 border-gray-100"
          )}
          tippyOptions={{ duration: 100 }}
          editor={editor}
        >
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
          >
            <Bold className="h-5 w-5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
          >
            <Italic className="h-5 w-5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive("underline")}
          >
            <UnderlineIcon className="h-5 w-5" />
          </MenuButton>
          <TextColorButton editor={editor} />
          <BackgroundColorButton editor={editor} />
        </BubbleMenu>
      )} */}
    </div>
  );
};

export default RichTextEditor;
