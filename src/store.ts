import { create } from 'zustand';

export type Mode = 'overview' | 'walk';
/** How walk mode is steered: mouse captured by the page, or on-screen joystick and dragging. */
export type ControlScheme = 'pointerlock' | 'touch';

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
  controlScheme: ControlScheme;
  /** Walk mode shows its menu and ignores input while paused. */
  walkPaused: boolean;
  /** True once the user has walked at least once. */
  walkBegun: boolean;
  flying: boolean;
  /** Run toggle of the touch controls (the keyboard uses Shift). */
  running: boolean;
  /** Incremented to send the walker back to the gate. */
  respawnCount: number;
  setProgress: (progress: number) => void;
  setModelReady: () => void;
  start: (mode: Mode) => void;
  setMode: (mode: Mode) => void;
  setControlScheme: (scheme: ControlScheme) => void;
  setWalkPaused: (paused: boolean) => void;
  toggleFlying: () => void;
  toggleRunning: () => void;
  respawn: () => void;
}

export const useStore = create<AppState>((set) => ({
  progress: 0,
  modelReady: false,
  started: false,
  mode: 'overview',
  controlScheme: isTouchDevice ? 'touch' : 'pointerlock',
  walkPaused: true,
  walkBegun: false,
  flying: false,
  running: false,
  respawnCount: 0,
  setProgress: (progress) => set({ progress }),
  setModelReady: () => set({ modelReady: true }),
  start: (mode) => set({ started: true, mode, walkPaused: true }),
  setMode: (mode) => set({ mode, walkPaused: true }),
  setControlScheme: (controlScheme) => set({ controlScheme }),
  setWalkPaused: (walkPaused) => set((s) => ({ walkPaused, walkBegun: s.walkBegun || !walkPaused })),
  toggleFlying: () => set((s) => ({ flying: !s.flying })),
  toggleRunning: () => set((s) => ({ running: !s.running })),
  respawn: () => set((s) => ({ respawnCount: s.respawnCount + 1, flying: false })),
}));
