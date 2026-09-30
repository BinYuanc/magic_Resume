import type { CSSProperties } from "react";
import type { ResumeTextStyle } from "@/types/resume";

/**
 * 三级样式解析工具
 *
 * fallback 链（优先级从高到低）：
 *   局部样式（local） → 模块样式（预留） → globalSettings（global） → 模板默认值（fallback）
 *
 * 所有模板统一从这里取样式，不再各自写 `globalSettings?.subheaderSize || 16`。
 */

/**
 * 解析字号：返回带 px 单位的 CSS 值。
 * @param local    局部字号（如 project.nameStyle.fontSize）
 * @param global   全局字号（如 globalSettings.subheaderSize）
 * @param fallback 模板默认字号
 */
export function resolveFontSize(
  local?: number,
  global?: number,
  fallback = 16,
): string {
  return `${local ?? global ?? fallback}px`;
}

/**
 * 解析数值：返回数字（用于间距等场景）。
 */
export function resolveNumber(
  local?: number,
  global?: number,
  fallback = 0,
): number {
  return local ?? global ?? fallback;
}

/**
 * 将 ResumeTextStyle 解析为 CSSProperties。
 * 只输出存在的字段，缺失字段完全交给上层继承（CSS 层 / 全局样式）。
 *
 * @param local      局部样式（如 project.nameStyle）
 * @param globalSize 全局字号（如 globalSettings.subheaderSize）
 * @param fallbackSize 模板默认字号
 */
export function resolveTextStyle(
  local: ResumeTextStyle | undefined,
  globalSize?: number,
  fallbackSize = 16,
): CSSProperties {
  const style: CSSProperties = {
    fontSize: resolveFontSize(local?.fontSize, globalSize, fallbackSize),
  };
  if (local?.color) style.color = local.color;
  if (local?.bold !== undefined) style.fontWeight = local.bold ? 700 : 400;
  if (local?.italic) style.fontStyle = "italic";
  if (local?.underline) style.textDecoration = "underline";
  return style;
}
