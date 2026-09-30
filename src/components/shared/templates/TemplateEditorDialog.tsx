/**
 * 模板编辑器 V1（结构化表单，不是自由画布）。
 *
 * 开放的能力（对应方案第三十一节）：
 *   页面布局：单栏 / 双栏
 *   模块顺序：上移 / 下移
 *   左右栏分配（双栏时）
 *   页面边距 / 模块间距 / 条目间距
 *   字体 / 正文字号 / 一级标题 / 二级标题 / 行高
 *   主题色 / 文字色
 *   Section Header 样式：加粗 / 分隔线 / 对齐
 *
 * 明确不做（第三十二节）：拖任意元素到任意坐标。
 */
import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  ColumnKey,
  TemplateDefinition,
  TemplateSectionKey,
} from "@/types/templateDefinition";
import { TEMPLATE_SECTION_KEYS } from "@/types/templateDefinition";
import { useCustomTemplateStore } from "@/store/useCustomTemplateStore";
import { findPersonalContent, buildTemplatePackage, parseTemplatePackage } from "@/lib/templateSchema";

interface TemplateEditorDialogProps {
  definition: TemplateDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 可在编辑器里排序的模块（basic 固定在最前） */
const ORDERABLE_KEYS = TEMPLATE_SECTION_KEYS.filter((key) => key !== "basic") as TemplateSectionKey[];

const TemplateEditorDialog: React.FC<TemplateEditorDialogProps> = ({
  definition,
  open,
  onOpenChange,
}) => {
  const t = useTranslations("dashboard.templates.editor");
  const updateTemplate = useCustomTemplateStore((state) => state.updateTemplate);

  const [draft, setDraft] = useState<TemplateDefinition | null>(null);

  // 打开时把 definition 复制成草稿，取消不落库
  React.useEffect(() => {
    if (open && definition) {
      setDraft(structuredClone(definition));
    }
    if (!open) setDraft(null);
  }, [open, definition]);

  const patch = (partial: Partial<TemplateDefinition>) => {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  };

  const patchLayout = (partial: Partial<TemplateDefinition["layout"]>) => {
    setDraft((current) =>
      current ? { ...current, layout: { ...current.layout, ...partial } } : current
    );
  };

  const patchTypography = (partial: Partial<TemplateDefinition["typography"]>) => {
    setDraft((current) =>
      current ? { ...current, typography: { ...current.typography, ...partial } } : current
    );
  };

  const order = useMemo(() => {
    const current = draft?.layout.order ?? ORDERABLE_KEYS;
    // 保证集合完整且无重复
    const seen = new Set<string>(["basic"]);
    return current.filter((key) => {
      if (seen.has(key) || !TEMPLATE_SECTION_KEYS.includes(key)) return false;
      seen.add(key);
      return true;
    });
  }, [draft?.layout.order]);

  const move = (key: TemplateSectionKey, direction: -1 | 1) => {
    const index = order.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    patchLayout({ order: next });
  };

  const assignColumn = (key: TemplateSectionKey, column: ColumnKey) => {
    const current = { ...(draft?.layout.columnAssignment ?? {}) };
    current[key] = column;
    patchLayout({ columnAssignment: current });
  };

  const handleSave = () => {
    if (!draft) return;
    const leaks = findPersonalContent(draft);
    if (leaks.length > 0) {
      toast.error(t("leakBlocked", { detail: leaks.join("；") }));
      return;
    }
    try {
      const pkg = buildTemplatePackage(draft);
      const validated = parseTemplatePackage({ manifest: JSON.stringify(pkg.manifest), layout: JSON.stringify(pkg.layout), theme: JSON.stringify(pkg.theme) });
      updateTemplate(draft.id, { ...validated, previewImage: draft.previewImage, createdAt: draft.createdAt });
    } catch (error) { toast.error((error as Error).message); return; }
    toast.success(t("saved"));
    onOpenChange(false);
  };

  if (!draft) return null;
  const twoColumn = draft.layout.layout === "two-column";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title", { name: draft.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] pr-3">
          <div className="space-y-6 py-2">
            {/* 布局 */}
            <section className="space-y-3">
              <h4 className="text-sm font-medium">{t("layout.title")}</h4>
              <div className="flex gap-2">
                {(["single-column", "two-column"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => patchLayout({ layout: mode })}
                    className={cn(
                      "flex-1 rounded-lg border p-3 text-sm transition-colors",
                      draft.layout.layout === mode
                        ? "border-primary bg-primary/5 font-medium"
                        : "hover:bg-muted/40"
                    )}
                  >
                    {mode === "single-column" ? t("layout.single") : t("layout.two")}
                  </button>
                ))}
              </div>
              {twoColumn ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("layout.mainWeight")}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      value={draft.layout.columns?.main ?? 2}
                      onChange={(event) =>
                        patchLayout({
                          columns: {
                            main: Number(event.target.value) || 2,
                            side: draft.layout.columns?.side ?? 1,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("layout.sideWeight")}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      value={draft.layout.columns?.side ?? 1}
                      onChange={(event) =>
                        patchLayout({
                          columns: {
                            main: draft.layout.columns?.main ?? 2,
                            side: Number(event.target.value) || 1,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              ) : null}
            </section>

            {/* 模块顺序 + 栏位 */}
            <section className="space-y-2">
              <h4 className="text-sm font-medium">{t("order.title")}</h4>
              {order.map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="text-sm">{sectionLabel(t, key)}</span>
                  <div className="flex items-center gap-1">
                    {twoColumn && key !== "basic" ? (
                      <Select
                        value={draft.layout.columnAssignment?.[key] ?? (key === "skills" ? "side" : "main")}
                        onValueChange={(value) => assignColumn(key, value as ColumnKey)}
                      >
                        <SelectTrigger className="h-8 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="main">{t("layout.main")}</SelectItem>
                          <SelectItem value="side">{t("layout.side")}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                    {key !== "basic" ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={t("order.up")}
                          onClick={() => move(key, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={t("order.down")}
                          onClick={() => move(key, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("order.fixed")}</span>
                    )}
                  </div>
                </div>
              ))}
            </section>

            {/* 字体 */}
            <section className="space-y-3">
              <h4 className="text-sm font-medium">{t("typography.title")}</h4>
              <div className="space-y-1.5">
                <Label>{t("typography.fontFamily")}</Label>
                <Input
                  value={draft.typography.fontFamily ?? ""}
                  placeholder="Inter, system-ui, sans-serif"
                  onChange={(event) => patchTypography({ fontFamily: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <NumberField
                  label={t("typography.baseFontSize")}
                  value={draft.typography.baseFontSize}
                  min={8}
                  max={24}
                  onChange={(value) => patchTypography({ baseFontSize: value })}
                />
                <NumberField
                  label={t("typography.headerSize")}
                  value={draft.typography.headerSize}
                  min={8}
                  max={40}
                  onChange={(value) => patchTypography({ headerSize: value })}
                />
                <NumberField
                  label={t("typography.subheaderSize")}
                  value={draft.typography.subheaderSize}
                  min={8}
                  max={32}
                  onChange={(value) => patchTypography({ subheaderSize: value })}
                />
                <NumberField
                  label={t("typography.lineHeight")}
                  value={draft.typography.lineHeight}
                  min={0.8}
                  max={3}
                  step={0.05}
                  onChange={(value) => patchTypography({ lineHeight: value })}
                />
              </div>
            </section>

            {/* 间距 */}
            <section className="space-y-3">
              <h4 className="text-sm font-medium">{t("spacing.title")}</h4>
              <SliderField
                label={t("spacing.pagePadding")}
                value={draft.spacing.contentPadding ?? 32}
                min={0}
                max={80}
                onChange={(value) => patch({ spacing: { ...draft.spacing, contentPadding: value } })}
              />
              <SliderField
                label={t("spacing.sectionGap")}
                value={draft.spacing.sectionGap ?? 10}
                min={0}
                max={60}
                onChange={(value) => patch({ spacing: { ...draft.spacing, sectionGap: value } })}
              />
              <SliderField
                label={t("spacing.itemGap")}
                value={draft.spacing.itemGap ?? 12}
                min={0}
                max={40}
                onChange={(value) => patch({ spacing: { ...draft.spacing, itemGap: value } })}
              />
            </section>

            {/* 颜色 */}
            <section className="space-y-3">
              <h4 className="text-sm font-medium">{t("colors.title")}</h4>
              <div className="grid grid-cols-2 gap-4">
                <ColorField
                  label={t("colors.primary")}
                  value={draft.colors.primary}
                  onChange={(value) => patch({ colors: { ...draft.colors, primary: value } })}
                />
                <ColorField
                  label={t("colors.text")}
                  value={draft.colors.text}
                  onChange={(value) => patch({ colors: { ...draft.colors, text: value } })}
                />
              </div>
            </section>

            {/* Section Header 样式（全局级，作用于所有模块标题） */}
            <section className="space-y-3">
              <h4 className="text-sm font-medium">{t("sectionHeader.title")}</h4>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="header-border">{t("sectionHeader.border")}</Label>
                <Switch
                  id="header-border"
                  checked={Boolean(draft.sectionStyles?.default?.border)}
                  onCheckedChange={(checked) =>
                    patch({
                      sectionStyles: {
                        ...(draft.sectionStyles ?? {}),
                        default: {
                          ...(draft.sectionStyles?.default ?? {}),
                          border: checked,
                        },
                      },
                    })
                  }
                />
              </div>
            </section>

            <p className="text-xs text-muted-foreground">{t("privacyNote")}</p>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function sectionLabel(
  t: ReturnType<typeof useTranslations>,
  key: TemplateSectionKey
): string {
  const labels: Record<TemplateSectionKey, string> = {
    basic: t("sections.basic"),
    summary: t("sections.summary"),
    skills: t("sections.skills"),
    experience: t("sections.experience"),
    projects: t("sections.projects"),
    education: t("sections.education"),
    certificates: t("sections.certificates"),
    custom: t("sections.custom"),
  };
  return labels[key];
}

const NumberField: React.FC<{
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 1, onChange }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value ?? ""}
      onChange={(event) => {
        const numeric = Number(event.target.value);
        if (Number.isFinite(numeric)) onChange(numeric);
      }}
    />
  </div>
);

const SliderField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <span className="text-xs tabular-nums text-muted-foreground">{value}px</span>
    </div>
    <Slider
      value={[value]}
      min={min}
      max={max}
      step={1}
      onValueChange={(values) => onChange(values[0] ?? value)}
    />
  </div>
);

const ColorField: React.FC<{
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={label}
        className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
        value={/^#[0-9a-fA-F]{6}$/.test(value ?? "") ? value : "#000000"}
        onChange={(event) => onChange(event.target.value)}
      />
      <Input
        value={value ?? ""}
        placeholder="#000000"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  </div>
);

export default TemplateEditorDialog;
