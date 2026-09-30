import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "@/i18n/compat/client";
import { motion } from "framer-motion";
import { useRouter } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { DEFAULT_TEMPLATES } from "@/config";
import { useResumeStore } from "@/store/useResumeStore";
import { useCustomTemplateStore, makeUniqueTemplateId } from "@/store/useCustomTemplateStore";
import { definitionToTemplateView, listTemplateViews } from "@/lib/templateCatalog";
import { describeImportError, exportTemplateZip, importTemplateFile } from "@/lib/templateTransfer";
import { getBuiltinDefinition } from "@/lib/templateResolver";
import SaveAsTemplateDialog from "@/components/shared/templates/SaveAsTemplateDialog";
import TemplateEditorDialog from "@/components/shared/templates/TemplateEditorDialog";
import type { TemplateDefinition } from "@/types/templateDefinition";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, FileUp, Pencil, Save, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ResumeTemplateComponent from "@/components/templates";
import { initialResumeState, initialResumeStateEn } from "@/config/initialResumeData";
import type { ResumeTemplate } from "@/types/template";
import { normalizeFontFamily } from "@/utils/fonts";

const A4_WIDTH_PX = 793.700787;
const PREVIEW_MODAL_SCALE = 0.529166667;

const PRESET_COLORS = [
  { name: "default", value: "" },
  { name: "blue", value: "#3b82f6" },
  { name: "green", value: "#10b981" },
  { name: "purple", value: "#8b5cf6" },
  { name: "orange", value: "#f97316" },
  { name: "red", value: "#ef4444" },
  { name: "slate", value: "#475569" },
  { name: "black", value: "#000000" },
];

const getTemplateKey = (templateId: string) =>
  templateId === "left-right" ? "leftRight" : templateId;

type TemplatePreviewBaseData =
  | typeof initialResumeState
  | typeof initialResumeStateEn;

/**
 * 模板预览固定使用的示例头像与照片设置（来自示例简历「宋哈娜」）。
 * 模板预览里的照片不参与用户自己的简历内容：无论「示例内容 / 我的真实内容」
 * 开关选哪一项，头像都保持示例照片，只有文字内容跟随开关。
 */
const TEMPLATE_PREVIEW_PHOTO = initialResumeState.basic.photo;
const TEMPLATE_PREVIEW_PHOTO_CONFIG = initialResumeState.basic.photoConfig;

const buildTemplatePreviewData = (
  baseData: TemplatePreviewBaseData,
  template: ResumeTemplate,
  selectedColor: string,
  mockId: string
) =>
({
  ...baseData,
  id: mockId,
  templateId: template.id,
  globalSettings: {
    ...baseData.globalSettings,
    themeColor: selectedColor || template.colorScheme.primary,
    sectionSpacing: template.spacing.sectionGap,
    paragraphSpacing: template.spacing.itemGap,
    pagePadding: template.spacing.contentPadding,
  },
  basic: {
    ...baseData.basic,
    layout: template.basic.layout,
    photo: TEMPLATE_PREVIEW_PHOTO,
    photoConfig: TEMPLATE_PREVIEW_PHOTO_CONFIG,
  },
} as any);

interface TemplateCardItemProps {
  index: number;
  template: ResumeTemplate;
  templateName: string;
  templateDescription: string;
  baseData: TemplatePreviewBaseData;
  selectedColor: string;
  onPreview: () => void;
  onUseTemplate: () => void;
  previewLabel: string;
  useTemplateLabel: string;
}

const TemplateCardItem = ({
  index,
  template,
  templateName,
  templateDescription,
  baseData,
  selectedColor,
  onPreview,
  onUseTemplate,
  previewLabel,
  useTemplateLabel,
}: TemplateCardItemProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.24);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      if (width > 0) {
        setScale(width / A4_WIDTH_PX);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const previewData = buildTemplatePreviewData(
    baseData,
    template,
    selectedColor,
    `template-preview-${template.id}`
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Card
        className={cn(
          "group border transition-all duration-200 aspect-[210/297] flex flex-col overflow-hidden",
          "hover:border-primary/40 hover:shadow-lg",
          "dark:hover:border-primary/40"
        )}
      >
        <CardContent
          className="p-0 flex-1 relative bg-gray-50 dark:bg-gray-900 overflow-hidden cursor-pointer"
          onClick={onPreview}
        >
          <div
            className="absolute inset-0 pb-6 flex items-center justify-center pointer-events-none transition-transform duration-300 group-hover:scale-[1.02] overflow-hidden"
            ref={containerRef}
          >
            <div className="w-full h-full relative origin-top bg-white">
              <div
                className="resume-preview absolute top-0 left-0 bg-white"
                style={{
                  width: "210mm",
                  height: "297mm",
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  padding: `${template.spacing.contentPadding}px`,
                  fontFamily: normalizeFontFamily(previewData.globalSettings?.fontFamily),
                }}
              >
                <ResumeTemplateComponent data={previewData} template={template} />
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 top-[60%] pointer-events-none bg-gradient-to-t from-white via-white/90 to-transparent dark:from-gray-950 dark:via-gray-950/90 z-0" />
          <div className="absolute inset-x-0 bottom-0 pt-12 pb-3 px-4 flex items-end border-t border-transparent z-10 transition-colors group-hover:bg-white/50 dark:group-hover:bg-gray-950/50">
            <div className="flex flex-col w-full">
              <span className="text-[15px] font-semibold truncate text-gray-900 dark:text-gray-100 drop-shadow-sm">
                {templateName}
              </span>
              <span className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5 font-medium truncate">
                {templateDescription}
              </span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="pt-2 pb-2 px-2 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 z-10">
          <div className="grid grid-cols-2 gap-2 w-full">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Button
                variant="outline"
                className="w-full text-sm hover:bg-gray-100 dark:border-primary/50 dark:hover:bg-primary/10"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview();
                }}
              >
                {previewLabel}
              </Button>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Button
                className="w-full text-sm"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onUseTemplate();
                }}
              >
                {useTemplateLabel}
              </Button>
            </motion.div>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
};

const TemplatesPage = () => {
  const t = useTranslations("dashboard.templates");
  const locale = useLocale();
  const router = useRouter();
  const createResume = useResumeStore((state) => state.createResume);
  const activeResume = useResumeStore((state) => state.activeResume);
  const customTemplates = useCustomTemplateStore((state) => state.templates);
  const {
    addTemplate: addCustomTemplate,
    removeTemplate: removeCustomTemplate,
    renameTemplate,
    duplicateTemplate,
  } = useCustomTemplateStore.getState();
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>(PRESET_COLORS[0].value);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 内置模板 / 我的模板 */
  const [tab, setTab] = useState<"builtin" | "mine">("builtin");
  /** 模板预览用示例内容还是我的真实简历内容 */
  const [contentSource, setContentSource] = useState<"sample" | "mine">("mine");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState<TemplateDefinition | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /** 保存当前排版为模板 */
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  /** 模板编辑器（V1） */
  const [editing, setEditing] = useState<TemplateDefinition | null>(null);

  const myTemplates = customTemplates;
  const allTemplateViews = listTemplateViews(myTemplates);

  useEffect(() => {
    let currentIndex = 0;
    autoPlayRef.current = setInterval(() => {
      currentIndex = (currentIndex + 1) % PRESET_COLORS.length;
      setSelectedColor(PRESET_COLORS[currentIndex].value);
    }, 3000);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
    };
  }, []);

  const handleColorSelect = (value: string) => {
    setSelectedColor(value);
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
  };

  /**
   * 预览数据源：优先展示用户自己的真实简历内容（第 29 节要求）。
   * 没有简历时才退回内置示例数据，避免“永远只看宋哈娜”。
   */
  const sampleBaseData = locale === "en" ? initialResumeStateEn : initialResumeState;
  const baseData: TemplatePreviewBaseData =
    contentSource === "mine" && activeResume
      ? (activeResume as unknown as TemplatePreviewBaseData)
      : sampleBaseData;

  const activePreviewTemplate =
    allTemplateViews.find((template) => template.id === previewTemplate) ?? null;

  const handleCreateResume = (templateId: string) => {
    const template = allTemplateViews.find((entry) => entry.id === templateId);
    if (!template) return;

    const resumeId = createResume(templateId);
    const { resumes, updateResume } = useResumeStore.getState();
    const resume = resumes[resumeId];

    if (resume) {
      updateResume(resumeId, {
        globalSettings: {
          ...resume.globalSettings,
          themeColor: selectedColor || template.colorScheme.primary,
          sectionSpacing: template.spacing.sectionGap,
          paragraphSpacing: template.spacing.itemGap,
          pagePadding: template.spacing.contentPadding,
        },
        basic: {
          ...resume.basic,
          layout: template.basic.layout,
        },
      });
    }

    router.push({ to: "/app/workbench/$id", params: { id: resumeId } });
  };

  /** 导入自定义模板：解析 → Schema 校验 → 安全扫描 → ID 冲突自动改名 → 落库 */
  const handleImportFile = async (file: File) => {
    try {
      const definition = await importTemplateFile(file);
      if (allTemplateViews.some((item) => item.id === definition.id)) {
        const newId = makeUniqueTemplateId(definition.id, allTemplateViews);
        const suffix = newId.slice(newId.lastIndexOf("-") + 1);
        // 名称同样受 60 字符限制：先去掉旧后缀再补新后缀，避免 "X (2) (2)" 且不越界
        const baseName = definition.name.replace(/\s*\(\d+\)$/, "").trim();
        definition.id = newId;
        definition.name = `${baseName.slice(0, Math.max(1, 60 - suffix.length - 3))} (${suffix})`;
        toast(t("import.conflictRenamed", { name: definition.name }));
      }
      addCustomTemplate(definition);
      setTab("mine");
      toast.success(t("import.success", { name: definition.name }));
    } catch (error) {
      toast.error(describeImportError(error));
    }
  };

  /** 内置模板 → 我的模板（只复制展示规则，之后可在编辑器里改字号/间距/颜色） */
  const handleDuplicateBuiltin = (templateId: string) => {
    const definition = getBuiltinDefinition(templateId);
    if (!definition) return;
    const newId = makeUniqueTemplateId(`${templateId}-custom`, customTemplates);
    const copy: TemplateDefinition = {
      ...definition,
      id: newId,
      name: `${definition.name}（我的）`,
      source: "custom-schema",
      builtinLayout: undefined,
      previewImage: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addCustomTemplate(copy);
    setTab("mine");
    toast.success(t("myTemplates.duplicated", { name: copy.name }));
  };

  const handleDuplicate = (id: string) => {
    const source = myTemplates.find((item) => item.id === id);
    if (!source) return;
    const newId = makeUniqueTemplateId(`${source.id}-copy`, myTemplates);
    duplicateTemplate(id, newId, `${source.name} 副本`);
    toast.success(t("myTemplates.duplicated", { name: `${source.name} 副本` }));
  };

  const handleExport = async (definition: TemplateDefinition) => {
    try {
      await exportTemplateZip(definition);
      toast.success(t("myTemplates.exported", { name: definition.name }));
    } catch (error) {
      toast.error(describeImportError(error));
    }
  };

  const handleDelete = (definition: TemplateDefinition) => {
    removeCustomTemplate(definition.id);
    toast.success(t("myTemplates.deleted", { name: definition.name }));
  };

  const submitRename = () => {
    if (!renaming || !renameValue.trim()) return;
    renameTemplate(renaming.id, renameValue.trim().slice(0, 60));
    toast.success(t("myTemplates.renamed"));
    setRenaming(null);
  };

  return (
    <ScrollArea className="h-[calc(100vh-2rem)] w-full">
      <div className="w-full max-w-[1600px] mx-auto py-8 px-4 sm:px-6">
        <div className="flex flex-col space-y-8">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 rounded-full border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 p-1">
                <button
                  type="button"
                  onClick={() => setTab("builtin")}
                  className={cn(
                    "px-4 py-1.5 text-sm rounded-full transition-colors",
                    tab === "builtin"
                      ? "bg-white dark:bg-neutral-800 shadow-sm font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {t("tabs.builtin")}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("mine")}
                  className={cn(
                    "px-4 py-1.5 text-sm rounded-full transition-colors",
                    tab === "mine"
                      ? "bg-white dark:bg-neutral-800 shadow-sm font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {t("tabs.mine")}
                  {myTemplates.length > 0 ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {myTemplates.length}
                    </span>
                  ) : null}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setContentSource("sample")}
                    className={cn(
                      "px-2 py-1 rounded-md transition-colors",
                      contentSource === "sample" ? "bg-muted font-medium" : "hover:bg-muted/60"
                    )}
                  >
                    {t("contentSource.sample")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setContentSource("mine")}
                    className={cn(
                      "px-2 py-1 rounded-md transition-colors",
                      contentSource === "mine" ? "bg-muted font-medium" : "hover:bg-muted/60"
                    )}
                  >
                    {t("contentSource.mine")}
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.json,application/zip,application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleImportFile(file);
                    event.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveAsOpen(true)}
                  disabled={!activeResume}
                  title={activeResume ? undefined : t("saveAsTemplate.noResume")}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {t("saveAsTemplate.button")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <FileUp className="mr-2 h-4 w-4" />
                  {t("import.button")}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-3xl font-bold tracking-tight">{t("title")}</h2>

            <div className="flex items-center space-x-2 bg-gray-50/50 dark:bg-gray-900/50 p-2 rounded-full border border-gray-100 dark:border-gray-800 backdrop-blur-sm self-start sm:self-auto overflow-x-auto">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => handleColorSelect(color.value)}
                  className={cn(
                    "relative w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-110",
                    selectedColor === color.value
                      ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-gray-950 scale-110"
                      : ""
                  )}
                  title={color.name === "default" ? "Default" : color.name}
                >
                  {color.value ? (
                    <div
                      className="w-full h-full rounded-full border border-black/10 dark:border-white/10 shadow-sm"
                      style={{ backgroundColor: color.value }}
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 border border-gray-300 dark:border-gray-700 shadow-sm flex items-center justify-center">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-tighter">
                        Tpl
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {tab === "builtin" ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
              {DEFAULT_TEMPLATES.map((template, index) => {
                const templateKey = getTemplateKey(template.id);
                return (
                  <div key={template.id} className="flex flex-col gap-2">
                    <TemplateCardItem
                      index={index}
                      template={template}
                      templateName={t(`${templateKey}.name`)}
                      templateDescription={t(`${templateKey}.description`)}
                      baseData={baseData}
                      selectedColor={selectedColor}
                      onPreview={() => setPreviewTemplate(template.id)}
                      onUseTemplate={() => handleCreateResume(template.id)}
                      previewLabel={t("preview")}
                      useTemplateLabel={t("useTemplate")}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      title={t("myTemplates.duplicateBuiltin")}
                      onClick={() => handleDuplicateBuiltin(template.id)}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      {t("myTemplates.duplicateBuiltin")}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {myTemplates.length === 0 ? (
                <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                  <p>{t("myTemplates.empty")}</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSaveAsOpen(true)}
                      disabled={!activeResume}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {t("saveAsTemplate.button")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <FileUp className="mr-2 h-4 w-4" />
                      {t("import.button")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
                  {myTemplates.map((definition, index) => {
                    const view = definitionToTemplateView(definition);
                    return (
                      <div key={definition.id} className="flex flex-col gap-2">
                        <TemplateCardItem
                          index={index}
                          template={view}
                          templateName={definition.name}
                          templateDescription={definition.description || t("myTemplates.custom")}
                          baseData={baseData}
                          selectedColor={selectedColor}
                          onPreview={() => setPreviewTemplate(definition.id)}
                          onUseTemplate={() => handleCreateResume(definition.id)}
                          previewLabel={t("preview")}
                          useTemplateLabel={t("useTemplate")}
                        />
                        <div className="flex items-center justify-between gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("editor.button")}
                            onClick={() => setEditing(definition)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("myTemplates.rename")}
                            onClick={() => {
                              setRenaming(definition);
                              setRenameValue(definition.name);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("myTemplates.duplicate")}
                            onClick={() => handleDuplicate(definition.id)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("myTemplates.export")}
                            onClick={() => void handleExport(definition)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("myTemplates.delete")}
                            onClick={() => handleDelete(definition)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Star className="h-3 w-3" />
                          <span className="truncate">
                            {definition.layout.layout === "two-column"
                              ? t("myTemplates.twoColumn")
                              : t("myTemplates.singleColumn")}
                          </span>
                          <span>·</span>
                          <span>{definition.docxCapability === "full" ? "DOCX OK" : "DOCX basic"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <SaveAsTemplateDialog
            open={saveAsOpen}
            onOpenChange={setSaveAsOpen}
            onSaved={(templateId) => {
              setTab("mine");
              void templateId;
            }}
          />

          <TemplateEditorDialog
            definition={editing}
            open={Boolean(editing)}
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
          />

          <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
            <DialogContent className="sm:max-w-sm">
              <DialogTitle>{t("myTemplates.rename")}</DialogTitle>
              <Input
                value={renameValue}
                maxLength={60}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitRename();
                }}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setRenaming(null)}>
                  {t("switchTemplateDialog.cancel")}
                </Button>
                <Button size="sm" onClick={submitRename}>
                  {t("myTemplates.renameConfirm")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={!!previewTemplate}
            onOpenChange={(open) => {
              if (!open) setPreviewTemplate(null);
            }}
          >
            {activePreviewTemplate && (
              <DialogContent className="max-w-[680px] p-0 overflow-hidden border-0 shadow-lg rounded-xl bg-white dark:bg-gray-900">
                <div className="flex flex-col">
                  <div className="border-b border-gray-100 dark:border-gray-800 px-4 py-4">
                    <DialogTitle className="text-lg font-medium">
                      {t(`${getTemplateKey(activePreviewTemplate.id)}.name`)}
                    </DialogTitle>
                  </div>
                  <div className="overflow-hidden flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-8 pointer-events-none">
                    <div
                      className="relative bg-white shadow-md ring-1 ring-gray-200/50 overflow-hidden"
                      style={{ width: "420px", height: "594px" }}
                    >
                      <div
                        className="resume-preview absolute top-0 left-0 bg-white"
                        style={{
                          width: "210mm",
                          height: "297mm",
                          transform: `scale(${PREVIEW_MODAL_SCALE})`,
                          transformOrigin: "top left",
                          padding: `${activePreviewTemplate.spacing.contentPadding}px`,
                          fontFamily: normalizeFontFamily(
                            buildTemplatePreviewData(
                              baseData,
                              activePreviewTemplate,
                              selectedColor,
                              "template-preview-modal"
                            ).globalSettings?.fontFamily
                          ),
                        }}
                      >
                        <ResumeTemplateComponent
                          data={buildTemplatePreviewData(
                            baseData,
                            activePreviewTemplate,
                            selectedColor,
                            "preview-mock-id-large"
                          )}
                          template={activePreviewTemplate}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="p-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex justify-center">
                    <Button
                      className="w-full"
                      onClick={() => {
                        const templateId = activePreviewTemplate.id;
                        setPreviewTemplate(null);
                        handleCreateResume(templateId);
                      }}
                    >
                      {t("useTemplate")}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            )}
          </Dialog>
        </div>
      </div>
    </ScrollArea>
  );
};

export const runtime = "edge";

export default TemplatesPage;
