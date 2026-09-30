import React, { useState } from "react";
import { ImageIcon, Layout, PanelsLeftBottom } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations, useLocale } from "@/i18n/compat/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet-no-overlay";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { findTemplateView, isCustomTemplateId, listTemplateViews } from "@/lib/templateCatalog";
import { useResumeStore } from "@/store/useResumeStore";
import { useCustomTemplateStore } from "@/store/useCustomTemplateStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTemplateSnapshots } from "@/hooks/useTemplateSnapshots";

type TemplateItem = ReturnType<typeof listTemplateViews>[number];

interface TemplatePreviewProps {
  template: TemplateItem;
  isActive: boolean;
  snapshotSrc: string | null;
  previewImage?: string;
  onSelect: (templateId: string) => void;
}

const TemplatePreview = ({
  template,
  isActive,
  snapshotSrc,
  previewImage,
  onSelect,
}: TemplatePreviewProps) => {
  return (
    <button
      onClick={() => onSelect(template.id)}
      className={cn(
        "relative group rounded-lg overflow-hidden border-2 transition-all duration-200 hover:scale-[1.02] text-left",
        isActive
          ? "border-primary dark:border-primary shadow-lg dark:shadow-primary/30"
          : "border-gray-100 hover:border-gray-200 dark:border-neutral-800 dark:hover:border-neutral-700"
      )}
    >
      <div className="relative aspect-[210/297] w-full overflow-hidden bg-gray-50 dark:bg-gray-900">
        {snapshotSrc || previewImage ? (
          <img
            src={snapshotSrc || previewImage}
            alt={template.name}
            className="h-full w-full object-cover object-top"
            loading="eager"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-gray-50 to-gray-100 text-gray-500 dark:from-neutral-900 dark:to-neutral-950 dark:text-neutral-400">
            <ImageIcon className="h-8 w-8" />
            <span className="px-4 text-center text-sm font-medium">
              {template.name}
            </span>
          </div>
        )}
      </div>
      <div className="px-2 py-1 text-xs text-gray-600 dark:text-neutral-300 truncate">
        {template.name}
      </div>
      {isActive && (
        <motion.div
          layoutId="template-selected"
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/10 dark:bg-black/40 pointer-events-none"
        >
          <Layout className="h-8 w-8 text-primary shadow-sm" />
        </motion.div>
      )}
    </button>
  );
};

const TemplateSheet = () => {
  const t = useTranslations("templates");
  const locale = useLocale();
  const { activeResume, setTemplate } = useResumeStore();
  const customTemplates = useCustomTemplateStore((state) => state.templates);
  const { snapshotMap } = useTemplateSnapshots(locale);

  const allTemplates = listTemplateViews(customTemplates);
  const currentTemplate = findTemplateView(activeResume?.templateId, customTemplates);

  /** 待切换目标 + 排版处理策略 */
  const [pending, setPending] = useState<{
    templateId: string;
    templateName: string;
  } | null>(null);
  const [preserveOverrides, setPreserveOverrides] = useState(false);

  const handleSelect = (templateId: string) => {
    const template = allTemplates.find((item) => item.id === templateId);
    if (!template || template.id === currentTemplate.id) return;
    setPreserveOverrides(false);
    setPending({ templateId, templateName: template.name });
  };

  const confirmSwitch = () => {
    if (!pending) return;
    // preserveOverrides=true → 只改 templateId；false → 重置展示层，但 ResumeData 内容始终不变
    setTemplate(pending.templateId, { preserveOverrides });
    setPending(null);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <PanelsLeftBottom size={20} />
      </SheetTrigger>
      <SheetContent side="left" forceMount className="w-1/2 sm:max-w-1/2">
        <SheetHeader>
          <SheetTitle>{t("switchTemplate")}</SheetTitle>
        </SheetHeader>
        <SheetDescription />

        <div className="mt-4 h-[calc(100vh-8rem)]">
          <ScrollArea className="h-full w-full pr-4">
            <div className="grid grid-cols-4 gap-4 pb-8">
              {allTemplates.map((template) => (
                <TemplatePreview
                  key={template.id}
                  template={template}
                  isActive={template.id === currentTemplate.id}
                  snapshotSrc={snapshotMap[template.id] ?? null}
                  previewImage={
                    isCustomTemplateId(template.id, customTemplates)
                      ? customTemplates.find((item) => item.id === template.id)?.previewImage
                      : undefined
                  }
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>

      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("switchTemplateDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("switchTemplateDialog.description", {
                template: pending?.templateName ?? "",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40">
              <input
                type="radio"
                name="template-switch-mode"
                className="mt-1"
                checked={!preserveOverrides}
                onChange={() => setPreserveOverrides(false)}
              />
              <span>
                <span className="block text-sm font-medium">
                  {t("switchTemplateDialog.useTemplateDefault")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("switchTemplateDialog.useTemplateDefaultHint")}
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40">
              <input
                type="radio"
                name="template-switch-mode"
                className="mt-1"
                checked={preserveOverrides}
                onChange={() => setPreserveOverrides(true)}
              />
              <span>
                <span className="block text-sm font-medium">
                  {t("switchTemplateDialog.keepOverrides")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("switchTemplateDialog.keepOverridesHint")}
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              {t("switchTemplateDialog.cancel")}
            </Button>
            <Button onClick={confirmSwitch}>{t("switchTemplateDialog.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
};

export default TemplateSheet;
