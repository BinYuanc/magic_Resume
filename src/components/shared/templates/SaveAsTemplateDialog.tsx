/**
 * 「保存当前排版为模板」弹窗。
 *
 * 收集：模板名称 / 说明 / 分类 / 标签 + 三项内容勾选（主题色 / 字号 / 间距）。
 * 保存的只有 Presentation —— 简历内容绝不入库（templateSave 层有反向体检兜底）。
 */
import React, { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useResumeStore } from "@/store/useResumeStore";
import { useCustomTemplateStore } from "@/store/useCustomTemplateStore";
import { buildTemplateFromResume } from "@/lib/templateSave";
import { findPersonalContent } from "@/lib/templateSchema";

interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 保存成功后回调（可用来切换到「我的模板」tab） */
  onSaved?: (templateId: string) => void;
}

const SaveAsTemplateDialog: React.FC<SaveAsTemplateDialogProps> = ({
  open,
  onOpenChange,
  onSaved,
}) => {
  const t = useTranslations("dashboard.templates.saveAsTemplate");
  const activeResume = useResumeStore((state) => state.activeResume);
  const addTemplate = useCustomTemplateStore((state) => state.addTemplate);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("professional");
  const [tagsInput, setTagsInput] = useState("");
  const [includeColors, setIncludeColors] = useState(true);
  const [includeFonts, setIncludeFonts] = useState(true);
  const [includeSpacing, setIncludeSpacing] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setCategory("professional");
    setTagsInput("");
    setIncludeColors(true);
    setIncludeFonts(true);
    setIncludeSpacing(true);
  };

  const handleSave = () => {
    if (!activeResume) {
      toast.error(t("noResume"));
      return;
    }
    if (!name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const definition = buildTemplateFromResume(activeResume, {
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        tags: tagsInput
          .split(/[,，\s]+/)
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 10),
        includeColors,
        includeFonts,
        includeSpacing,
      });

      // 双保险：即使上游逻辑有漏洞，个人信息也绝不允许进入模板库
      const leaks = findPersonalContent(definition);
      if (leaks.length > 0) {
        toast.error(t("leakBlocked", { detail: leaks.join("；") }));
        return;
      }

      addTemplate(definition);
      toast.success(t("success", { name: definition.name }));
      onSaved?.(definition.id);
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">{t("name")}</Label>
            <Input
              id="template-name"
              value={name}
              maxLength={60}
              placeholder={t("namePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-description">{t("descriptionField")}</Label>
            <Textarea
              id="template-description"
              value={description}
              rows={2}
              maxLength={300}
              placeholder={t("descriptionPlaceholder")}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("category")}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">{t("categories.professional")}</SelectItem>
                  <SelectItem value="technology">{t("categories.technology")}</SelectItem>
                  <SelectItem value="simple">{t("categories.simple")}</SelectItem>
                  <SelectItem value="creative">{t("categories.creative")}</SelectItem>
                  <SelectItem value="ats">{t("categories.ats")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-tags">{t("tags")}</Label>
              <Input
                id="template-tags"
                value={tagsInput}
                placeholder={t("tagsPlaceholder")}
                onChange={(event) => setTagsInput(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="include-colors">{t("includeColors")}</Label>
              <Switch
                id="include-colors"
                checked={includeColors}
                onCheckedChange={setIncludeColors}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="include-fonts">{t("includeFonts")}</Label>
              <Switch
                id="include-fonts"
                checked={includeFonts}
                onCheckedChange={setIncludeFonts}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="include-spacing">{t("includeSpacing")}</Label>
              <Switch
                id="include-spacing"
                checked={includeSpacing}
                onCheckedChange={setIncludeSpacing}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t("privacyNote")}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={submitting || !name.trim()}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveAsTemplateDialog;
