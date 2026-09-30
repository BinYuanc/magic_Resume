import {
  ChevronDown,
  Sparkles,
  Minimize2,
  Expand,
  Code2,
  Briefcase,
  Hash,
  ListOrdered,
  UserRound,
  BotMessageSquare,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RESUME_AI_TASKS, type ResumeAITask } from "@/types/ai-resume";

/** 各任务的菜单图标（Lucide，与项目现有风格一致） */
const TASK_ICONS: Record<ResumeAITask, LucideIcon> = {
  polish: Sparkles,
  shorten: Minimize2,
  expand: Expand,
  technical: Code2,
  business: Briefcase,
  metrics: Hash,
  star: ListOrdered,
  hr: UserRound,
  ai_engineer: BotMessageSquare,
  custom: PenLine,
};

interface AIOptimizeMenuProps {
  /** 用户选择任务后回调，由调用方捕获选区并打开优化弹窗 */
  onSelect: (task: ResumeAITask) => void;
  disabled?: boolean;
}

/**
 * AI 优化下拉菜单：「✨ AI 优化 ▼」
 * 10 种任务：润色表达 / 精简 / 扩写 / 技术 / 业务价值 / 量化结果 /
 * STAR 改写 / HR 友好 / AI 应用开发专项 / 自定义要求
 */
export default function AIOptimizeMenu({ onSelect, disabled }: AIOptimizeMenuProps) {
  const t = useTranslations("aiOptimize");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          // 阻止 mousedown 夺走编辑器焦点，保证选区在点击菜单时仍然有效
          onMouseDown={(e) => e.preventDefault()}
          className="h-8 px-3 text-xs gap-1.5 ml-1 border-primary/20 hover:border-primary/40 text-primary hover:bg-primary/5 transition-all duration-300 group"
        >
          <Sparkles className="h-3 w-3 group-hover:rotate-12 transition-transform" />
          {t("button")}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {RESUME_AI_TASKS.map((task) => {
          const Icon = TASK_ICONS[task];
          return (
            <div key={task}>
              {task === "custom" && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onSelect(task);
                }}
                className="gap-2.5 text-xs cursor-pointer"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{t(`tasks.${task}`)}</span>
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
