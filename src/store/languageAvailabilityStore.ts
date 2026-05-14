import { create } from "zustand";

type LanguageAvailabilityState = {
  learnMnUnavailable: boolean;
  eventsMnUnavailable: boolean;
  setLearnMnUnavailable: (value: boolean) => void;
  setEventsMnUnavailable: (value: boolean) => void;
  clearMnUnavailable: () => void;
};

export const useLanguageAvailabilityStore = create<LanguageAvailabilityState>(
  (set) => ({
    learnMnUnavailable: false,
    eventsMnUnavailable: false,
    setLearnMnUnavailable: (value) => set({ learnMnUnavailable: !!value }),
    setEventsMnUnavailable: (value) => set({ eventsMnUnavailable: !!value }),
    clearMnUnavailable: () =>
      set({ learnMnUnavailable: false, eventsMnUnavailable: false }),
  }),
);

