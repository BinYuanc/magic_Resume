import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { CalendarIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import TurndownService from "turndown";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import RichTextEditor from "../shared/rich-editor/RichEditor";
import AIOptimizeDialog from "../shared/ai/AIOptimizeDialog";
import { useAIConfiguration } from "@/hooks/useAIConfiguration";
import type { AIOptimizeRequest, RichEditorAPI } from "@/types/ai-resume";
import { UnifiedDateInput } from "../ui/unified-date-input";
import { UnifiedDateRangeInput } from "../ui/unified-date-range-input";

// turndown 实例，用于将字段 HTML 转换为 Markdown 发给 AI
const turndownService = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
});

interface FieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "textarea" | "date" | "editor" | "date-range";
  placeholder?: string;
  required?: boolean;
  className?: string;
  showPresentSwitch?: boolean;
  /** 正文块小标题排版（仅正文块使用）：stacked = 标题独占一行，inline = 标题与正文同行 */
  bodyTitleMode?: "stacked" | "inline";
  onToggleBodyTitleMode?: () => void;
}

const Field = ({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  className,
  showPresentSwitch,
  bodyTitleMode,
  onToggleBodyTitleMode,
}: FieldProps) => {
  const [yearInput, setYearInput] = useState("");
  const [displayMonth, setDisplayMonth] = useState<Date>(new Date());
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  // AI 优化请求（含任务类型与选区快照），非空时打开优化弹窗
  const [optimizeRequest, setOptimizeRequest] = useState<AIOptimizeRequest | null>(null);
  // RichEditor 暴露的选区替换能力
  const editorApiRef = useRef<RichEditorAPI | null>(null);
  const { checkConfiguration } = useAIConfiguration();
  const t = useTranslations();

  const currentDate = useMemo(
    () => (value ? new Date(value) : undefined),
    [value]
  );

  useEffect(() => {
    if (type === "date" && value) {
      const date = new Date(value);
      setYearInput(date.getFullYear().toString());
      setDisplayMonth(date);
    }
  }, [type, value]);

  useEffect(() => {
    if (type === "date") {
      if (!currentDate && fromDate) {
        setFromDate(undefined);
      } else if (
        currentDate &&
        (!fromDate || currentDate.getTime() !== fromDate.getTime())
      ) {
        setFromDate(currentDate);
      }
    }
  }, [type, currentDate, fromDate]);

  const isPresentValue = useMemo(() => {
    return value === t("field.toPresent") || value.endsWith(` - ${t("field.toPresent")}`);
  }, [value, t]);

  const handlePresentToggle = (checked: boolean) => {
    if (type === "date") {
      onChange(checked ? t("field.toPresent") : "");
    } else if (type === "date-range") {
      const [start] = value.split(" - ");
      onChange(
        checked
          ? [start, t("field.toPresent")].filter(Boolean).join(" - ")
          : start || ""
      );
    }
  };

  const renderLabel = () => {
    if (!label) return null;
    return (
      <div className="flex items-center justify-between mb-1.5 font-medium">
        <span className="text-sm text-foreground">
          {label}
        </span>
        {showPresentSwitch && (
          <div className="flex items-center gap-2">
            <Switch
              checked={isPresentValue}
              onCheckedChange={handlePresentToggle}
            />
            <span className="text-xs text-muted-foreground">
              {t("field.toPresent")}
            </span>
          </div>
        )}
      </div>
    );
  };

  const inputStyles = cn(
    "block w-full rounded-md border-0 py-1.5 px-3",
    "text-foreground bg-background",
    "shadow-sm ring-1 ring-inset ring-input",
    "placeholder:text-muted-foreground",
    "focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary",
    "sm:text-sm sm:leading-6",
    className
  );

  if (type === "date") {
    return (
      <div className="block">
        {renderLabel()}
        <UnifiedDateInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          isRequired={required}
          className={className}
        />
      </div>
    );
  }

  if (type === "date-range") {
    return (
      <div className="block">
        {renderLabel()}
        <UnifiedDateRangeInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={className}
        />
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <label className="block">
        {renderLabel()}
        <motion.textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputStyles}
          required={required}
          rows={4}
          whileHover={{ scale: 1.005 }}
          whileTap={{ scale: 0.995 }}
        />
      </label>
    );
  }

  if (type === "editor") {
    return (
      <motion.div className="block">
        {renderLabel()}
        <div className="mt-1.5">
          <RichTextEditor
            content={value || ""}
            onChange={onChange}
            placeholder={placeholder}
            editorApiRef={editorApiRef}
            bodyTitleMode={bodyTitleMode}
            onToggleBodyTitleMode={onToggleBodyTitleMode}
            onAIOptimize={(request) => {
              if (checkConfiguration()) {
                setOptimizeRequest(request);
              }
            }}
          />
        </div>

        <AIOptimizeDialog
          open={!!optimizeRequest}
          onOpenChange={(open) => {
            if (!open) setOptimizeRequest(null);
          }}
          task={optimizeRequest?.task ?? "polish"}
          content={
            optimizeRequest?.selection
              ? optimizeRequest.selection.text
              : turndownService.turndown(value || "")
          }
          selectionMode={!!optimizeRequest?.selection}
          onApply={({ html, plainText }) => {
            const selection = optimizeRequest?.selection;
            // 选中文字模式：只替换选区范围，其他内容保持不变
            if (selection && editorApiRef.current) {
              editorApiRef.current.replaceSelection(
                selection.from,
                selection.to,
                html,
                plainText,
              );
            } else {
              // 整段模式：替换整个字段内容
              onChange(html);
            }
          }}
        />
      </motion.div>
    );
  }

  return (
    <label className="block">
      {renderLabel()}
      <motion.input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputStyles}
        required={required}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
      />
    </label>
  );
};

export default Field;
