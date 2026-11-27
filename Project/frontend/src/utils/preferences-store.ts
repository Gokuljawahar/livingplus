import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AssistantLanguage = 'en' | 'ta' | 'hi' | string;

interface PreferencesState {
  assistantLanguage: AssistantLanguage;
  setAssistantLanguage: (language: AssistantLanguage) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      assistantLanguage: 'en',
      setAssistantLanguage: (assistantLanguage) => set({ assistantLanguage })
    }),
    {
      name: 'lp_preferences_v1',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        try {
          const legacy = localStorage.getItem('assistantLanguage');
          if (legacy && state.assistantLanguage === 'en') {
            state.setAssistantLanguage(legacy);
          }
        } catch {
          /* ignore */
        }
      }
    }
  )
);
