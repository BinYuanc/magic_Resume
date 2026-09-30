import { ClipboardList, RotateCcw } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResumeAISettingsStore } from "@/store/useResumeAISettingsStore";
import { cn } from "@/lib/utils";

const inputClass = cn(
  "h-10 rounded-lg",
  "bg-background",
  "border-border",
  "focus:ring-2 focus:ring-primary/20",
);

/**
 * 简历优化设置区块
 * 配置会持久化到 LocalStorage，并在每次 AI 优化时注入 Prompt。
 */
export function ResumeAISettingsSection() {
  const t = useTranslations("resumeAISettings");
  const { settings, setSettings, resetSettings } = useResumeAISettingsStore();

  return (
    <section className="mt-6 rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <ClipboardList className="h-5 w-5 text-primary" />
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            {t("description")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={resetSettings}
          className="shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("reset")}
        </Button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="rai-target-role">{t("targetRole")}</Label>
          <Input
            id="rai-target-role"
            value={settings.targetRole}
            onChange={(e) => setSettings({ targetRole: e.target.value })}
            placeholder={t("targetRolePlaceholder")}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rai-years">{t("yearsOfExperience")}</Label>
          <Input
            id="rai-years"
            value={settings.yearsOfExperience}
            onChange={(e) => setSettings({ yearsOfExperience: e.target.value })}
            placeholder={t("yearsOfExperiencePlaceholder")}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rai-tech-focus">{t("technicalFocus")}</Label>
          <Input
            id="rai-tech-focus"
            value={settings.technicalFocus}
            onChange={(e) => setSettings({ technicalFocus: e.target.value })}
            placeholder={t("technicalFocusPlaceholder")}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rai-writing-style">{t("writingStyle")}</Label>
          <Input
            id="rai-writing-style"
            value={settings.writingStyle}
            onChange={(e) => setSettings({ writingStyle: e.target.value })}
            placeholder={t("writingStylePlaceholder")}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label>{t("language")}</Label>
          <Select
            value={settings.language}
            onValueChange={(value) => setSettings({ language: value })}
          >
            <SelectTrigger className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh">{t("languageZh")}</SelectItem>
              <SelectItem value="en">{t("languageEn")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rai-max-bullet">{t("maxBulletLength")}</Label>
          <Input
            id="rai-max-bullet"
            type="number"
            min={0}
            max={500}
            value={settings.maxBulletLength}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              setSettings({
                maxBulletLength: Number.isNaN(parsed)
                  ? 0
                  : Math.max(0, Math.min(500, parsed)),
              });
            }}
            placeholder={t("maxBulletLengthPlaceholder")}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-3.5 py-2.5">
          <Label htmlFor="rai-prefer-metrics" className="text-sm font-normal">
            {t("preferMetrics")}
          </Label>
          <Switch
            id="rai-prefer-metrics"
            checked={settings.preferMetrics}
            onCheckedChange={(checked) => setSettings({ preferMetrics: checked })}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-3.5 py-2.5">
          <Label htmlFor="rai-prefer-business" className="text-sm font-normal">
            {t("preferBusinessValue")}
          </Label>
          <Switch
            id="rai-prefer-business"
            checked={settings.preferBusinessValue}
            onCheckedChange={(checked) =>
              setSettings({ preferBusinessValue: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-3.5 py-2.5">
          <Label htmlFor="rai-prefer-tech" className="text-sm font-normal">
            {t("preferTechnicalDepth")}
          </Label>
          <Switch
            id="rai-prefer-tech"
            checked={settings.preferTechnicalDepth}
            onCheckedChange={(checked) =>
              setSettings({ preferTechnicalDepth: checked })
            }
          />
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="rai-custom-prompt">{t("customPrompt")}</Label>
        <Textarea
          id="rai-custom-prompt"
          value={settings.customPrompt}
          onChange={(e) => setSettings({ customPrompt: e.target.value })}
          placeholder={t("customPromptPlaceholder")}
          rows={3}
          className="resize-none rounded-lg bg-background border-border"
        />
      </div>
    </section>
  );
}
