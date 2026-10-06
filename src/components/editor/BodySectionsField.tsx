import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Plus, Trash2 } from "lucide-react";
import Field from "./Field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useTranslations } from "@/i18n/compat/client";

import { parseBodySections as parseSections, serializeBodySections as serializeSections, newBodySection as newSection, type BodySection } from "@/lib/bodySections";
const COLLAPSED_STORAGE_KEY = "magic-resume:body-section-collapsed";

export default function BodySectionsField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string;
}) {
  const t = useTranslations("richEditor");
  // 服务端和首次客户端渲染一致，挂载后再解析正文。
  const [sections, setSections] = useState<BodySection[]>([{ id: "initial", title: "", content: value, inline: false }]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  /** 收起的正文块（只显示标题行） */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /** 一键收起/展开的整体状态：也是「上次选择」的记忆值 */
  const [allCollapsed, setAllCollapsed] = useState(false);
  const allCollapsedRef = useRef(false);
  const lastHtml = useRef<string | null>(null);
  const sectionsRef = useRef(sections);
  const collapseAll = (next: BodySection[]) => Object.fromEntries(next.map(section => [section.id, true]));
  // 挂载后读取上次选择：收起 → 当前所有块都收起；展开 → 保持展开
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      const next = stored === "1";
      allCollapsedRef.current = next;
      setAllCollapsed(next);
      if (next) setCollapsed(collapseAll(sectionsRef.current));
    } catch {
      /* 隐私模式等场景读不到，保持默认展开 */
    }
  }, []);
  useEffect(() => {
    if (value === lastHtml.current) return;
    const next = parseSections(value);
    sectionsRef.current = next;
    setSections(next);
    lastHtml.current = value;
    // 切换条目时沿用「上次选择」的收起/展开
    setCollapsed(allCollapsedRef.current ? collapseAll(next) : {});
  }, [value]);
  const toggleAllCollapsed = () => {
    const next = !allCollapsed;
    allCollapsedRef.current = next;
    setAllCollapsed(next);
    setCollapsed(next ? collapseAll(sectionsRef.current) : {});
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* 写不进去也不影响本次使用 */
    }
  };
  const commit = (next: BodySection[]) => {
    sectionsRef.current = next;
    setSections(next);
    const html = serializeSections(next);
    lastHtml.current = html;
    onChange(html);
  };
  const update = (id: string, patch: Partial<BodySection>) => commit(sectionsRef.current.map(section => section.id === id ? { ...section, ...patch } : section));
  const add = (title = "") => {
    commit([...sectionsRef.current, newSection(title)]);
    setAdding(false);
  };
  const move = (id: string, direction: number) => {
    const next = [...sectionsRef.current];
    const index = next.findIndex(section => section.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };
  const toggleCollapsed = (id: string) => setCollapsed(previous => ({ ...previous, [id]: !previous[id] }));
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1 text-xs"
          onClick={toggleAllCollapsed}
          title={allCollapsed ? t("bodySectionExpandAll") : t("bodySectionCollapseAll")}
          aria-label={allCollapsed ? t("bodySectionExpandAll") : t("bodySectionCollapseAll")}>
          {allCollapsed ? <ChevronsDown className="h-4 w-4" /> : <ChevronsUp className="h-4 w-4" />}
          {allCollapsed ? t("bodySectionExpandAll") : t("bodySectionCollapseAll")}
        </Button>
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="gap-1 text-xs"><Plus className="h-4 w-4" />{t("addBodySection")}</Button></PopoverTrigger>
          <PopoverContent className="w-72 space-y-2" align="end">
            <Button type="button" className="w-full" onClick={() => add()}>{t("addCustomBodySection")}</Button>
            <p className="text-xs text-muted-foreground">{t("bodySectionHint")}</p>
            <div className="flex flex-wrap gap-1.5">
              {["headingOwner", "headingOverview", "headingTech", "headingChallenges", "headingResults"].map(key => <Button key={key} type="button" variant="outline" size="sm" className="h-auto whitespace-normal px-2 py-1 text-xs" onClick={() => add(t(key))}>{t(key)}</Button>)}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
    {sections.map((section, index) => {
      const isCollapsed = Boolean(collapsed[section.id]);
      return <div key={section.id} className="space-y-2 rounded-lg border bg-background/40 p-3">
        <div className="flex items-center gap-1">
          <Input value={section.title} onChange={event => update(section.id, { title: event.target.value })}
            placeholder={t("bodySectionTitlePlaceholder")} aria-label={t("bodySectionTitle", { number: index + 1 })} className="min-w-0 flex-1 font-medium" />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-7 shrink-0"
            title={isCollapsed ? t("bodySectionExpand") : t("bodySectionCollapse")}
            aria-label={isCollapsed ? t("bodySectionExpand") : t("bodySectionCollapse")}
            aria-expanded={!isCollapsed}
            onClick={() => toggleCollapsed(section.id)}>
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-7 shrink-0" disabled={index === 0} title={t("bodySectionUp")} aria-label={t("bodySectionUp")} onClick={() => move(section.id, -1)}><ArrowUp className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-7 shrink-0" disabled={index === sections.length - 1} title={t("bodySectionDown")} aria-label={t("bodySectionDown")} onClick={() => move(section.id, 1)}><ArrowDown className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-7 shrink-0 text-destructive" title={t("deleteBodySection")} aria-label={t("deleteBodySection")} onClick={() => setRemoving(section.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
        {!isCollapsed && <Field type="editor" value={section.content} onChange={content => update(section.id, { content })} placeholder={placeholder}
          bodyTitleMode={section.inline ? "inline" : "stacked"}
          onToggleBodyTitleMode={() => update(section.id, { inline: !section.inline })} />}
      </div>;
    })}
    <AlertDialog open={Boolean(removing)} onOpenChange={open => { if (!open) setRemoving(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t("deleteBodySection")}</AlertDialogTitle><AlertDialogDescription>{t("deleteBodySectionHint")}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t("bodySectionCancel")}</AlertDialogCancel><AlertDialogAction onClick={() => {
          const next = sectionsRef.current.filter(section => section.id !== removing);
          commit(next.length ? next : [newSection()]);
          setRemoving(null);
        }}>{t("deleteBodySection")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
