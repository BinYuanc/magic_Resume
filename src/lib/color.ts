/**
 * CSS 常见颜色 → OOXML 所需的六位 RGB。
 *
 * 约定：
 * - 合法颜色一律返回六位 RGB（校验用），透明度无法在 Word 中表达，因此单独用
 *   isTransparentColor 判断；渲染方（docxBuilder）据此决定「不填充」而不是画出黑块。
 * - 非法颜色返回 undefined，由调用方报错或回退。
 */
export function colorToHex(value: string): string | undefined {
  const text = value.trim();
  if (/^#[\da-f]{3,4}$/i.test(text)) return text.slice(1, 4).split("").map((c) => c + c).join("").toUpperCase();
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(text)) return text.slice(1, 7).toUpperCase();
  const rgb = text.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/i);
  if (!rgb) return undefined;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((n) => n < 0 || n > 255)) return undefined;
  return channels.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * 判断一个合法颜色是否「完全透明」（alpha = 0）。
 * 这类颜色在 Word 里的正确表现是「不画」：既不填充背景，也不画边框颜色。
 */
export function isTransparentColor(value: string): boolean {
  const text = value.trim();
  if (/^#[\da-f]{4}$/i.test(text) && text[4] === "0") return true;
  if (/^#[\da-f]{8}$/i.test(text) && text.slice(7, 9) === "00") return true;
  const alpha = text.match(/^rgba\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*(0(?:\.0+)?)\s*\)$/i);
  return alpha?.[1] !== undefined;
}
