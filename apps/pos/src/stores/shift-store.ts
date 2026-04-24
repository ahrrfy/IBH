import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ShiftState {
  id: string;
  shiftNumber: string;
  cashierId: string;
  posDeviceId: string;
  openingCashIqd: number;
  openedAt: string;
}

interface ShiftStore {
  shift: ShiftState | null;
  open: (s: ShiftState) => void;
  reset: () => void;
}

export const useShiftStore = create<ShiftStore>()(
  persist(
    (set) => ({
      shift: null,
      open: (s) => set({ shift: s }),
      reset: () => set({ shift: null }),
    }),
    { name: 'al-ruya-pos-shift', storage: createJSONStorage(() => localStorage) },
  ),
);
