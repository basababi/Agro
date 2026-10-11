import { create } from 'zustand';

export type Mode = 'overview' | 'walk';

/** Phones and tablets: no shadows, lower pixel ratio, touch controls. */
export const isTouchDevice =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

interface AppState {
  /** Model download progress, 0–100. */
  progress: number;
  modelReady: boolean;
  /** False while the start screen is showing. */
  started: boolean;
  mode: Mode;
  setProgress: (progress: number) => void;
  setModelReady: () => void;
  start: (mode: Mode) => void;
  setMode: (mode: Mode) => void;
}

export const useStore = create<AppState>((set) => ({
  progress: 0,
  modelReady: false,
  started: false,
  mode: 'overview',
  setProgress: (progress) => set({ progress }),
  setModelReady: () => set({ modelReady: true }),
  start: (mode) => set({ started: true, mode }),
  setMode: (mode) => set({ mode }),
}));
