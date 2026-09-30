import type { DocxImage } from "./richTextToDocx";

/** Word 内嵌实际图片；不把整份简历截图。读取失败时显式终止导出。 */
export async function loadDocxImage(url: string, width: number, description: string, height?: number): Promise<DocxImage> {
  if (!/^(https?:|data:image\/|\/|\.\/)/i.test(url)) throw new Error(`${description} 图片地址不受支持`);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${description} 图片读取失败`);
  const limit = 5 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) throw new Error(`${description} 图片超过 5MB`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${description} 图片没有数据`);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > limit) { await reader.cancel(); throw new Error(`${description} 图片超过 5MB`); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  let bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216;
  let contentType: "image/png" | "image/jpeg" = png ? "image/png" : "image/jpeg";
  let naturalWidth = width, naturalHeight = height ?? width * 0.7;
  if (typeof createImageBitmap !== "undefined") {
    const bitmap = await createImageBitmap(new Blob([bytes]));
    naturalWidth = bitmap.width; naturalHeight = bitmap.height;
    if (!png && !jpeg) {
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d"); if (!ctx) { bitmap.close(); throw new Error("图片转换失败"); }
      ctx.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("图片转换失败")), "image/png"));
      if (blob.size > limit) { bitmap.close(); throw new Error(`${description} 转换后超过 5MB`); }
      bytes = new Uint8Array(await blob.arrayBuffer()); contentType = "image/png";
    }
    bitmap.close();
  } else if (!png && !jpeg) throw new Error(`${description} 需要 PNG/JPEG 图片`);
  else if (png && bytes.length >= 24) {
    const view = new DataView(bytes.buffer); naturalWidth = view.getUint32(16); naturalHeight = view.getUint32(20);
  }
  if (naturalWidth <= 0 || naturalHeight <= 0) throw new Error(`${description} 图片尺寸错误`);
  return { bytes, contentType, width, height: height ?? width * naturalHeight / naturalWidth, description };
}
