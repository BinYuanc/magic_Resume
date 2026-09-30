import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_RESUME_AI_SETTINGS,
  type ResumeAISettings,
} from "@/types/ai-resume";

/**
 * 简历优化设置 Store
 *
 * 独立于 useAIConfigStore 存储，避免影响其 partialize / migrate 逻辑。
 * 持久化 key：resume-ai-settings（LocalStorage）。
 */
interface ResumeAISettingsState {
  settings: ResumeAISettings;
  setSettings: (settings: Partial<ResumeAISettings>) => void;
  resetSettings: () => void;
}

export const useResumeAISettingsStore = create<ResumeAISettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_RESUME_AI_SETTINGS,
      setSettings: (settings) =>
        set((state) => ({
          settings: { ...state.settings, ...settings },
        })),
      resetSettings: () => set({ settings: DEFAULT_RESUME_AI_SETTINGS }),
    }),
    {
      name: "resume-ai-settings",
      merge: (persisted, current) => ({
        ...current,
        settings: {
          ...current.settings,
          ...((persisted as Partial<ResumeAISettingsState>)?.settings ?? {}),
        },
      }),
    },
  ),
);
