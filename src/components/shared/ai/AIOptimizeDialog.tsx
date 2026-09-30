import { useEffect, useState, useRef } from "react";
import { Loader2, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { createMarkdownExit } from "markdown-exit";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { useResumeAISettingsStore } from "@/store/useResumeAISettingsStore";
import { pdfImportErrorMessage } from "@/lib/pdf-import-client";
import { ResumeImportError } from "@/lib/resume-import-schema";
import { getTaskModel, isModelConfigured, toAIConnection } from "@/config/ai-models";
import type { ResumeAITask } from "@/types/ai-resume";
import { cn } from "@/lib/utils";

interface AIOptimizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 本次优化任务 */
  task: ResumeAITask;
  /** 待优化内容（整段 = 字段 Markdown；选区 = 选中的纯文本） */
  content: string;
  /** 是否为局部选区优化（影响 UI 提示与服务端 Prompt） */
  selectionMode?: boolean;
  /** 用户点击「替换原文」：html 用于整段替换，plainText 用于选区内联替换 */
  onApply: (result: { html: string; plainText: string }) => void;
}

// markdown-exit 实例，用于将 AI 返回的 Markdown 转换为 Tiptap 兼容的 HTML
const md = createMarkdownExit({
  html: true,       // 允许 HTML 标签透传
  breaks: true,     // 将换行符转换为 <br>
  linkify: false,   // 简历内容不需要自动识别链接
});

/** 将 Markdown 结果退化为纯文本（用于选区内联替换，不破坏句子结构） */
const markdownToPlainText = (markdown: string) =>
  markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

export default function AIOptimizeDialog({
  open,
  onOpenChange,
  task,
  content,
  selectionMode = false,
  onApply,
}: AIOptimizeDialogProps) {
  const t = useTranslations("aiOptimize");
  const allTranslations = useTranslations();
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishedContent, setPolishedContent] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const aiConfig = useAIConfigStore();
  const resumeAISettings = useResumeAISettingsStore((state) => state.settings);
  const abortControllerRef = useRef<AbortController | null>(null);
  const polishedContentRef = useRef<HTMLDivElement>(null);
  /** 递增序号，丢弃过期的流式响应（重新生成 / 快捷操作覆盖旧请求） */
  const runSeqRef = useRef(0);

  const getOptimizeErrorMessage = async (response: Response) => {
    const fallback = `${t("dialog.error.optimizeFailed")} (${response.status})`;

    try {
      const contentType = response.headers.get("content-type") || "";
      const rawText = await response.text();

      if (!rawText) {
        return fallback;
      }

      if (contentType.includes("application/json") || rawText.startsWith("{")) {
        const data = JSON.parse(rawText) as {
          code?: string;
          error?: string | { message?: string };
          message?: string;
        };

        if (data.code) {
          return pdfImportErrorMessage(new ResumeImportError(data.code), allTranslations);
        }
        if (typeof data.error === "string" && data.error.trim()) {
          return data.error.trim();
        }
        if (typeof data.error === "object" && data.error?.message?.trim()) {
          return data.error.message.trim();
        }
        if (data.message?.trim()) {
          return data.message.trim();
        }
      } else if (rawText.trim()) {
        return rawText.trim();
      }
    } catch {
      // 忽略解析错误，走兜底文案
    }

    return fallback;
  };

  /**
   * 发起一次优化请求。
   * @param requestTask 覆盖任务（快捷操作用）
   * @param requestContent 覆盖内容（快捷操作基于上一轮结果继续优化）
   * @param extraInstruction 附加指令
   */
  const handleOptimize = async (
    requestTask: ResumeAITask = task,
    requestContent: string = content,
    extraInstruction?: string,
  ) => {
    try {
      const model = getTaskModel(aiConfig, "text");
      if (!isModelConfigured(model)) {
        toast.error(t("dialog.error.configRequired"));
        return;
      }
      if (!requestContent.trim()) {
        toast.error(t("dialog.error.emptyContent"));
        return;
      }

      const runSeq = ++runSeqRef.current;

      // 中断旧请求，避免流式结果互相覆盖
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setIsPolishing(true);
      setPolishedContent("");

      // 快捷操作传入附加指令；否则使用输入框中的自定义要求
      const finalInstruction =
        extraInstruction ?? (customInstructions.trim() || undefined);

      const response = await fetch("/api/polish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: requestContent,
          connection: toAIConnection(model),
          customInstructions: finalInstruction,
          resumeTask: requestTask,
          resumeSettings: resumeAISettings,
          selectionMode,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorMessage = await getOptimizeErrorMessage(response);
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (runSeqRef.current !== runSeq) return;
        setPolishedContent((prev) => prev + chunk);
      }
      const tail = decoder.decode();
      if (tail) {
        if (runSeqRef.current !== runSeq) return;
        setPolishedContent((prev) => prev + tail);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("AI optimize error:", error);
      toast.error(error instanceof Error ? error.message : t("dialog.error.optimizeFailed"));
    } finally {
      setIsPolishing(false);
    }
  };

  /** 打开弹窗时自动开始优化（自定义任务等用户填完指令再点「开始优化」） */
  useEffect(() => {
    if (open && task !== "custom") {
      handleOptimize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 自动滚动到底部
  useEffect(() => {
    if (polishedContent && polishedContentRef.current) {
      const container = polishedContentRef.current;
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [polishedContent]);

  useEffect(() => {
    if (!open) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      runSeqRef.current += 1;
      setPolishedContent("");
      setCustomInstructions("");
    }
  }, [open]);

  const handleClose = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    runSeqRef.current += 1;
    onOpenChange(false);
    setPolishedContent("");
  };

  const handleApply = () => {
    const trimmed = polishedContent.trim();
    if (!trimmed) return;
    onApply({
      html: md.render(trimmed),
      plainText: markdownToPlainText(trimmed),
    });
    handleClose();
    toast.success(t("dialog.applied"));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isPolishing) {
      onOpenChange(nextOpen);
    }
  };

  /** 快捷操作：基于当前结果继续迭代优化 */
  const quickActions: Array<{
    key: "shorter" | "professional" | "technical" | "business";
    task: ResumeAITask;
  }> = [
    { key: "shorter", task: "shorten" },
    { key: "professional", task: "polish" },
    { key: "technical", task: "technical" },
    { key: "business", task: "business" },
  ];

  const handleQuickAction = (quickTask: ResumeAITask) => {
    if (!polishedContent.trim()) return;
    handleOptimize(
      quickTask,
      polishedContent,
      t("dialog.quickActionInstruction"),
    );
  };

  /** 恢复原文：把结果区重置为原始内容（不发起 AI 请求） */
  const handleRestoreOriginal = () => {
    abortControllerRef.current?.abort();
    setIsPolishing(false);
    setPolishedContent(content);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-[1000px]",
          "bg-white dark:bg-neutral-900",
          "border-neutral-200 dark:border-neutral-800",
          "rounded-2xl shadow-2xl dark:shadow-none",
        )}
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader className="pb-4">
          <DialogTitle
            className={cn(
              "flex items-center gap-2 text-2xl",
              "text-neutral-800 dark:text-neutral-100",
            )}
          >
            <Sparkles
              className={cn(
                "h-6 w-6 text-primary animate-pulse",
                "dark:text-primary-400",
              )}
            />
            {t("dialog.title")}
            <Badge variant="secondary" className="ml-1 text-xs font-normal">
              {t(`tasks.${task}`)}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal">
              {selectionMode ? t("dialog.modeSelection") : t("dialog.modeFull")}
            </Badge>
          </DialogTitle>
          <DialogDescription
            className={cn(
              "text-base",
              "text-neutral-600 dark:text-neutral-400",
            )}
          >
            {isPolishing
              ? t("dialog.description.optimizing")
              : polishedContent
                ? t("dialog.description.finished")
                : t("dialog.description.ready")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label
            htmlFor="ai-optimize-custom-instructions"
            className={cn(
              "text-sm font-medium",
              "text-neutral-600 dark:text-neutral-400",
            )}
          >
            {t("dialog.customInstructions")}
          </Label>
          <Textarea
            id="ai-optimize-custom-instructions"
            placeholder={
              task === "custom"
                ? t("dialog.customInstructionsRequired")
                : t("dialog.customInstructionsPlaceholder")
            }
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            disabled={isPolishing}
            rows={2}
            className={cn(
              "resize-none rounded-xl border",
              "bg-neutral-50 dark:bg-neutral-800/50",
              "border-neutral-200 dark:border-neutral-800",
              "text-neutral-700 dark:text-neutral-300",
              "placeholder:text-neutral-400 dark:placeholder:text-neutral-500",
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  "bg-neutral-500 dark:bg-neutral-600",
                )}
              ></div>
              <span
                className={cn(
                  "text-sm font-medium",
                  "text-neutral-600 dark:text-neutral-400",
                )}
              >
                {t("dialog.content.original")}
              </span>
            </div>
            <div
              className={cn(
                "relative rounded-xl border",
                "bg-neutral-50 dark:bg-neutral-800/50",
                "border-neutral-200 dark:border-neutral-800",
                "p-6 h-[400px] overflow-auto shadow-sm",
              )}
            >
              <Streamdown
                className={cn(
                  "prose dark:prose-invert max-w-none",
                  "text-neutral-700 dark:text-neutral-300",
                )}
              >
                {content}
              </Streamdown>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  "bg-primary animate-pulse",
                )}
              ></div>
              <span
                className={cn(
                  "text-sm font-medium",
                  "text-primary dark:text-primary-400",
                )}
              >
                {t("dialog.content.optimized")}
              </span>
            </div>
            <div
              ref={polishedContentRef}
              className={cn(
                "relative rounded-xl border",
                "bg-primary/[0.03] dark:bg-primary/[0.1]",
                "border-primary/20 dark:border-primary/30",
                "p-6 h-[400px] overflow-auto shadow-sm scroll-smooth",
              )}
            >
              <Streamdown
                animated
                isAnimating={isPolishing}
                className={cn(
                  "prose dark:prose-invert max-w-none",
                  "text-neutral-800 dark:text-neutral-200",
                )}
              >
                {polishedContent}
              </Streamdown>
            </div>
          </div>
        </div>

        {/* 快捷操作：基于当前结果继续迭代（恢复原文不请求 AI） */}
        <div className="flex flex-wrap items-center gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.key}
              type="button"
              variant="outline"
              size="sm"
              disabled={isPolishing || !polishedContent.trim()}
              onClick={() => handleQuickAction(action.task)}
              className="h-8 text-xs"
            >
              {t(`dialog.quick.${action.key}`)}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPolishing || !polishedContent.trim()}
            onClick={handleRestoreOriginal}
            className="h-8 text-xs gap-1"
          >
            <Undo2 className="h-3 w-3" />
            {t("dialog.quick.restore")}
          </Button>
        </div>

        <DialogFooter className="mt-4 flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            className="h-11 px-6"
          >
            {t("dialog.button.cancel")}
          </Button>

          <Button
            onClick={() => handleOptimize()}
            disabled={isPolishing || (task === "custom" && !customInstructions.trim())}
            className="flex-1 bg-gradient-to-r from-[#9333EA] to-[#EC4899] hover:opacity-90 text-white border-none h-11 shadow-lg shadow-purple-500/20"
          >
            {isPolishing ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("dialog.button.generating")}
              </div>
            ) : !polishedContent ? (
              t("dialog.button.start")
            ) : (
              t("dialog.button.regenerate")
            )}
          </Button>

          <Button
            onClick={handleApply}
            disabled={!polishedContent.trim() || isPolishing}
            className="flex-1 bg-primary hover:bg-primary/90 text-white h-11 shadow-lg shadow-primary/20"
          >
            {t("dialog.button.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
