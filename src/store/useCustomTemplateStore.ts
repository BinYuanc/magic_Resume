/**
 * 用户模板库 Store。
 *
 * 与简历数据一样走 localStorage（不引入后端），但**独立 store、独立 key**，
 * 这样模板资产和个人简历内容物理隔离：
 *   resume-storage        → 简历内容
 *   custom-templates      → 用户模板（纯展示资产，可被导出分享）
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import type { TemplateDefinition } from "@/types/templateDefinition";

/**
 * 与 resume store 一致的「安全 storage」：
 * localStorage 写满（尤其是带预览图的大包）时不能整页崩，只降级为内存态并告警。
 */
const createSafeLocalStorage = (): StateStorage => ({
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      console.warn(`[template-store] Failed to persist "${name}".`, error);
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
});

interface CustomTemplateState {
  templates: TemplateDefinition[];
  /** 新增模板（ID 冲突由调用方处理） */
  addTemplate: (template: TemplateDefinition) => void;
  /** 覆盖同名模板（重新导入时用） */
  upsertTemplate: (template: TemplateDefinition) => void;
  removeTemplate: (id: string) => void;
  renameTemplate: (id: string, name: string) => void;
  updateTemplate: (id: string, patch: Partial<TemplateDefinition>) => void;
  duplicateTemplate: (id: string, newId: string, newName: string) => TemplateDefinition | undefined;
  getTemplate: (id: string) => TemplateDefinition | undefined;
  hasTemplate: (id: string) => boolean;
}

/**
 * 生成一个不冲突的新模板 id。
 * 超出 40 字符一律截断（模板 id 的合法长度上限，见 templateSchema.validateId），
 * 否则「复制一个长 id 模板」会产出无法再导出/保存的 id。
 */
export function makeUniqueTemplateId(baseId: string, existing: { id: string }[]): string {
  const taken = new Set(existing.map((item) => item.id));
  const fit = (candidate: string) => candidate.slice(0, 40);
  const direct = fit(baseId);
  if (!taken.has(direct)) return direct;
  let index = 2;
  while (taken.has(`${direct.slice(0, 40 - String(index).length - 1)}-${index}`)) index++;
  return `${direct.slice(0, 40 - String(index).length - 1)}-${index}`;
}

export const useCustomTemplateStore = create<CustomTemplateState>()(
  persist(
    (set, get) => ({
      templates: [],

      addTemplate: (template) =>
        set((state) => ({ templates: [...state.templates, template] })),

      upsertTemplate: (template) =>
        set((state) => {
          const index = state.templates.findIndex((item) => item.id === template.id);
          if (index < 0) return { templates: [...state.templates, template] };
          const next = [...state.templates];
          next[index] = { ...template, updatedAt: new Date().toISOString() };
          return { templates: next };
        }),

      removeTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter((item) => item.id !== id),
        })),

      renameTemplate: (id, name) =>
        set((state) => ({
          templates: state.templates.map((item) =>
            item.id === id ? { ...item, name, updatedAt: new Date().toISOString() } : item
          ),
        })),

      updateTemplate: (id, patch) =>
        set((state) => ({
          templates: state.templates.map((item) =>
            item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
          ),
        })),

      duplicateTemplate: (id, newId, newName) => {
        const source = get().templates.find((item) => item.id === id);
        if (!source) return undefined;
        const copy: TemplateDefinition = {
          ...source,
          id: newId,
          name: newName,
          source: "custom-schema",
          builtinLayout: source.savedPresentation?.renderer, // 保存排版的副本沿用原始渲染布局
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ templates: [...state.templates, copy] }));
        return copy;
      },

      getTemplate: (id) => get().templates.find((item) => item.id === id),
      hasTemplate: (id) => get().templates.some((item) => item.id === id),
    }),
    {
      name: "custom-templates",
      storage: createJSONStorage<Pick<CustomTemplateState, "templates">>(createSafeLocalStorage),
      partialize: (state) => ({ templates: state.templates }),
    }
  )
);
