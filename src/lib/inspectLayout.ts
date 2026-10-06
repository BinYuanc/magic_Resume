import type { ResumeData } from "@/types/resume";
import { A4_HEIGHT_PX } from "@/utils/resumeLayout";
import { readResumeSettings } from "./readResumeSettings";
export function inspectResumeLayout(resume: ResumeData, activeId: string | null) {
  if (typeof document === "undefined" || activeId !== resume.id) throw new Error("请先打开目标简历工作台");
  if (document.fonts?.status === "loading") throw new Error("字体仍在加载，请等待后重新检查");
  const root = document.getElementById("resume-preview");
  const content = root?.querySelector<HTMLElement>("[data-resume-content]");
  if (!root || !content || !content.offsetWidth) throw new Error("目标简历预览尚未渲染，请打开工作台后重试");
  const settings = readResumeSettings(resume);
  const available = A4_HEIGHT_PX - 2 * (settings.pagePadding ?? 32);
  const viewportScale = root.getBoundingClientRect().width / root.offsetWidth;
  const zoom = typeof getComputedStyle === "function" ? Number.parseFloat(getComputedStyle(content).getPropertyValue("zoom")) : 1;
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  if (available <= 0 || !Number.isFinite(scale) || scale <= 0) throw new Error("页面尺寸无法测量");
  const height = Math.max(content.scrollHeight, content.offsetHeight);
  const renderedHeight = height * scale;
  const pageCount = Math.max(1,Math.ceil(renderedHeight / available));
  const sections = Object.fromEntries(Array.from(content.querySelectorAll<HTMLElement>("[data-resume-section-id]")).map(el => [el.dataset.resumeSectionId!, { height: Math.round(el.getBoundingClientRect().height / (scale * viewportScale)), itemSpacing: settings.sectionStyles?.[el.dataset.resumeSectionId as "projects"]?.itemSpacing ?? settings.paragraphSpacing }]));
  const horizontalOverflowPixels = Math.max(0, content.scrollWidth - content.clientWidth);
  const warnings: string[] = [];
  const tail = renderedHeight % available;
  if (pageCount > 1 && tail > 0 && tail < 100) warnings.push("末页内容少于100px，可以适当调整间距");
  if (horizontalOverflowPixels > 1) warnings.push("存在横向溢出，请检查长链接、名称或栏宽");
  return { resumeId:resume.id, updatedAt:resume.updatedAt, measured:true, pageCount,
    overflow: pageCount > 1 || horizontalOverflowPixels > 1, overflowPixels:Math.max(0,Math.round(renderedHeight-available)),
    horizontalOverflowPixels, contentHeight:height, renderedContentHeight:Math.round(renderedHeight), scale, sections, warnings,
    note:"以当前 Web 预览测量；Word 分页受字体与排版引擎影响。" };
}
