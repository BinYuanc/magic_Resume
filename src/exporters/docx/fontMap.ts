/**
 * 浏览器字体 → Word 字体映射（方案第二十三节）。
 *
 * 原则：映射不到也不允许让导出失败 —— 一律回退到 Word 各平台都有的字体，
 * 中文优先 Microsoft YaHei（Word/WPS 全平台内置）。
 */

const FONT_MAP: { pattern: RegExp; word: string }[] = [
  // 注意顺序：更具体的必须排在更泛的前面（否则 "Microsoft YaHei" 会被 /hei/ 误伤）
  { pattern: /microsoft yahei|微软雅黑/i, word: "Microsoft YaHei" },
  { pattern: /inter|roboto|helvetica|arial/i, word: "Arial" },
  { pattern: /system-ui|-apple-system|segoe ui/i, word: "Arial" },
  { pattern: /times|georgia|serif/i, word: "Times New Roman" },
  { pattern: /思源黑体|source han sans|noto sans/i, word: "Microsoft YaHei" },
  { pattern: /思源宋体|source han serif|noto serif|宋体|songti/i, word: "SimSun" },
  { pattern: /黑体|(^|[^a-z])hei($|[^a-z])/i, word: "SimHei" },
  { pattern: /楷体|kai/i, word: "KaiTi" },
  { pattern: /jetbrains|fira code|consolas|source code|mono/i, word: "Consolas" },
];

/**
 * 把 CSS font-family 串（可能含 fallback 列表）映射成 Word 字体名。
 * 中文简历最常见的情况是整串映射不到 → 回退雅黑，保证不因字体缺失而导出失败。
 */
export function mapFontToWord(cssFontFamily: string | undefined): string {
  if (!cssFontFamily) return "Microsoft YaHei";
  const first = cssFontFamily.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  if (!first) return "Microsoft YaHei";
  for (const entry of FONT_MAP) {
    if (entry.pattern.test(first)) return entry.word;
  }
  // 含 CJK 字符的原始字体名可直接用（Word 装了就认）
  if (/[\u4e00-\u9fa5]/.test(first)) return first;
  return "Arial";
}

/** 判断字体是否含 CJK（决定 w:rFonts 的 eastAsia 属性） */
export function isCjkFont(wordFont: string): boolean {
  return /[\u4e00-\u9fa5]/.test(wordFont) || /YaHei|SimSun|SimHei|KaiTi/i.test(wordFont);
}
