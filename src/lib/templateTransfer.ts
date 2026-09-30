/**
 * 模板搬运：导入 .zip / .template.json，导出为 .zip。
 *
 * 关键安全策略：
 * - 只读取白名单文件名，ZIP 里出现其它文件一律忽略（不落地、不渲染）。
 * - 预览图只接受 image/*，超限拒绝；外部 URL 图片不内联抓取。
 * - 全流程不触碰任何代码求值能力。
 */
import type { TemplateDefinition } from "@/types/templateDefinition";
import {
  TEMPLATE_LIMITS,
  TemplateImportError,
  buildTemplatePackage,
  parseTemplatePackage,
} from "./templateSchema";
import { unzip, zipFiles } from "./templateZip";

const REQUIRED_FILES = ["manifest.json", "layout.json", "theme.json"] as const;

function normalizeEntryName(name: string): string {
  // 兼容解压后多包一层目录的情况（my-template/manifest.json）
  const parts = name.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? name;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** 单文件格式：manifest 字段平铺在根，layout / theme 作为子对象 */
interface SingleFileTemplate {
  schemaVersion?: number;
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  layout?: Record<string, unknown>;
  theme?: Record<string, unknown>;
}

/**
 * 导入模板文件。
 * @returns 解析成功的 TemplateDefinition（是否已存在同名由调用方处理）
 */
export async function importTemplateFile(file: File): Promise<TemplateDefinition> {
  if (file.size > TEMPLATE_LIMITS.zipBytes) {
    throw new TemplateImportError(
      "RESOURCE_TOO_LARGE",
      `模板文件超过 ${Math.round(TEMPLATE_LIMITS.zipBytes / 1024 / 1024)}MB`
    );
  }

  const isZip =
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";

  if (isZip) {
    const buffer = await file.arrayBuffer();
    let files;
    try {
      files = await unzip(buffer);
    } catch (error) {
      throw new TemplateImportError(
        "INVALID_ZIP",
        `压缩包无法解析：${(error as Error).message}`
      );
    }

    const byName = new Map<string, (typeof files)[number]>();
    for (const entry of files) {
      const name = normalizeEntryName(entry.name);
      if (byName.has(name)) throw new TemplateImportError("INVALID_ZIP", `压缩包包含重复文件 ${name}`);
      byName.set(name, entry);
    }
    const missing = REQUIRED_FILES.filter((name) => !byName.has(name));
    if (missing.length > 0) {
      throw new TemplateImportError(
        "MISSING_FILE",
        `压缩包缺少必要文件：${missing.join("、")}`
      );
    }

    // 白名单文件一次性读成字符串（体积已由上层限额挡住），避免重复解码
    const contents = new Map<string, string>();
    for (const name of REQUIRED_FILES) {
      const entry = byName.get(name);
      if (!entry) {
        throw new TemplateImportError("MISSING_FILE", `压缩包缺少 ${name}`);
      }
      try { contents.set(name, await entry.text(TEMPLATE_LIMITS.jsonBytes)); }
      catch (error) { throw new TemplateImportError(entry.size > TEMPLATE_LIMITS.jsonBytes ? "RESOURCE_TOO_LARGE" : "INVALID_ZIP", String((error as Error).message)); }
    }

    let previewBytes: Uint8Array | undefined;
    let previewMime: string | undefined;
    const previewEntry = files.find((entry) => {
      const lower = normalizeEntryName(entry.name).toLowerCase();
      return lower === "preview.png" || lower === "preview.jpg" || lower === "preview.jpeg";
    });
    if (previewEntry) {
      try { previewBytes = await previewEntry.bytes(TEMPLATE_LIMITS.imageBytes); }
      catch (error) { throw new TemplateImportError(previewEntry.size > TEMPLATE_LIMITS.imageBytes ? "RESOURCE_TOO_LARGE" : "INVALID_ZIP", String((error as Error).message)); }
      const lower = normalizeEntryName(previewEntry.name).toLowerCase();
      previewMime = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" : "image/png";
    }

    return parseTemplatePackage({
      manifest: contents.get("manifest.json")!,
      layout: contents.get("layout.json")!,
      theme: contents.get("theme.json")!,
      preview: previewBytes,
      previewMime,
    });
  }

  // 单文件 JSON
  const content = await file.text();
  let parsed: SingleFileTemplate;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new TemplateImportError("INVALID_JSON", "文件不是合法 JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new TemplateImportError("INVALID_JSON", "模板内容必须是 JSON 对象");
  }

  return parseTemplatePackage({
    manifest: JSON.stringify({
      schemaVersion: parsed.schemaVersion,
      id: parsed.id,
      name: parsed.name,
      description: parsed.description,
      category: parsed.category,
      tags: parsed.tags,
    }),
    layout: JSON.stringify(parsed.layout ?? {}),
    theme: JSON.stringify(parsed.theme ?? {}),
  });
}

/** 导出模板为 ZIP（只含展示资产，导出前会做个人信息体检） */
export async function exportTemplateZip(definition: TemplateDefinition): Promise<void> {
  const pkg = buildTemplatePackage(definition);
  const entries: { name: string; data: Uint8Array | string }[] = [
    { name: "manifest.json", data: JSON.stringify(pkg.manifest, null, 2) },
    { name: "layout.json", data: JSON.stringify(pkg.layout, null, 2) },
    { name: "theme.json", data: JSON.stringify(pkg.theme, null, 2) },
  ];

  if (pkg.preview?.startsWith("data:image/")) {
    const base64 = pkg.preview.split(",")[1] ?? "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const mime = pkg.preview.slice(5, pkg.preview.indexOf(";"));
    const ext = mime.includes("jpeg") ? "jpg" : "png";
    entries.push({ name: `preview.${ext}`, data: bytes });
  }

  const zipped = await zipFiles(entries);
  const blob = new Blob([zipped], { type: "application/zip" });
  downloadBlob(blob, `${definition.id}.zip`);
}

/** 把导入异常翻译成中文（含具体原因） */
export function describeImportError(error: unknown): string {
  if (error instanceof TemplateImportError) return error.message;
  return `导入失败：${(error as Error)?.message ?? "未知错误"}`;
}
