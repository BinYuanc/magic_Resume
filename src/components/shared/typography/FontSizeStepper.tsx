import { useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FontSizeStepperProps {
  value?: number;          // 当前局部字号；undefined 表示继承上级
  fallbackValue: number;   // 当前继承到的字号（用于展示与 step 基准）
  min?: number;            // 最小字号
  max?: number;            // 最大字号
  step?: number;           // 每次步进值
  onChange: (value?: number) => void; // undefined = 恢复默认（清除局部样式）
  label?: string;          // aria-label 前缀（如“项目名称字号”）
  className?: string;
}

/**
 * 通用字号步进器：▲/▼ 步进 + 直接输入 + 恢复默认。
 * 项目名称 / 项目角色 / 公司名称 / 职位等均可复用。
 */
export default function FontSizeStepper({
  value,
  fallbackValue,
  min = 10,
  max = 40,
  step = 1,
  onChange,
  label,
  className,
}: FontSizeStepperProps) {
  const t = useTranslations("typography.fontSizeStepper");
  const current = value ?? fallbackValue;
  // 输入框本地状态：允许输入中间态（如空字符串），失焦/回车时提交
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (size: number) => Math.max(min, Math.min(max, size));

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isNaN(parsed)) {
      const next = clamp(parsed);
      // 与继承值一致时视为清除局部样式（恢复继承）
      onChange(next === fallbackValue ? undefined : next);
    }
    setDraft(null);
  };

  const stepBy = (delta: number) => {
    const next = clamp(current + delta);
    onChange(next === fallbackValue ? undefined : next);
  };

  const reset = () => onChange(undefined);

  return (
    <div
      className={cn("relative flex w-[66px] shrink-0 items-center", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center rounded-md border border-input bg-background shadow-sm">
        <Input
          type="text"
          inputMode="numeric"
          value={draft ?? String(current)}
          aria-label={label ? `${label} ${t("input")}` : t("input")}
          title={t("input")}
          onChange={(e) => {
            const text = e.target.value.replace(/[^\d]/g, "").slice(0, 2);
            setDraft(text);
          }}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            } else if (e.key === "Escape") {
              setDraft(null);
            }
          }}
          className="h-8 w-10 border-0 px-1 text-center text-xs shadow-none focus-visible:ring-0"
        />
        <div className="flex flex-col border-l border-input">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("increase")}
            title={t("increase")}
            disabled={current >= max}
            onClick={() => stepBy(step)}
            className="h-4 w-6 rounded-none rounded-tr-md p-0 hover:bg-primary/10"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("decrease")}
            title={t("decrease")}
            disabled={current <= min}
            onClick={() => stepBy(-step)}
            className="h-4 w-6 rounded-none rounded-br-md p-0 hover:bg-primary/10"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("reset")}
          title={t("reset")}
          onClick={reset}
          disabled={value === undefined}
          tabIndex={value === undefined ? -1 : 0}
          className={cn(
            "absolute -top-7 right-0 h-6 w-6 p-0 text-muted-foreground hover:text-foreground",
            value === undefined && "invisible pointer-events-none",
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
    </div>
  );
}
