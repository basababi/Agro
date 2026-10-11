// Camera presets, spawn point and guided tour route (CLAUDE.md, Appendix B).
// All positions are three.js coordinates: Y-up, metres, north = -Z.

export type Vec3 = [number, number, number];

export interface View {
  pos: Vec3;
  target: Vec3;
}

export interface Preset extends View {
  label: string;
}

export const presets = {
  aerial: { label: 'Агаараас', pos: [-4.24, 34, -41.01], target: [-1.41, 0, -2.83] },
  entrance: { label: 'Хаалга', pos: [-11.31, -3.98, -19.09], target: [3.89, 4.77, -1.06] },
  courtyard: { label: 'Хашаа', pos: [-7.57, 0.18, -5.44], target: [6.36, 3.77, -0.71] },
  lobby: { label: 'Лобби', pos: [5.33, 2.92, -0.55], target: [6.4, 2.67, 5.86] },
  soil_exhibit: { label: 'Хөрсний үзмэр', pos: [7.41, 2.92, -4.26], target: [11.22, 2.47, 0.78] },
  greenhouse: { label: 'Хүлэмж', pos: [-8.84, 2.92, 8.41], target: [-4.6, 2.07, 18.03] },
  lab_floor2: { label: 'Лаборатори (2 давхар)', pos: [3.02, 6.82, 1.25], target: [9.81, 6.17, 2.01] },
  pond: { label: 'Цөөрөм', pos: [-7.71, -2.65, -16.05], target: [-0.71, -3.89, -17.68] },
} satisfies Record<string, Preset>;

export type PresetId = keyof typeof presets;

export const spawn: View = { pos: [-12.37, -4.38, -20.15], target: [3.89, 4.27, -1.06] };

// Guided tour: gate → main path → courtyard → lobby → soil & biodiversity exhibits → back → VR, classroom, DIY → greenhouse
export const tourRoute: Vec3[] = [
  [-13.08, -4.78, -20.86],
  [-8.84, -3.15, -16.62],
  [-4.88, -1.83, -12.8],
  [-1.27, -0.23, -8.63],
  [1.41, 1.38, -4.81],
  [3.39, 2.72, -1.7],
  [5.57, 2.92, 0.37],
  [8.07, 2.92, -0.57],
  [8.91, 2.92, -2.19],
  [9.49, 2.92, -3.91],
  [9.79, 2.92, -5.71],
  [9.49, 2.92, -3.91],
  [8.07, 2.92, -0.57],
  [6.14, 2.92, 1.77],
  [4.38, 2.92, 3.12],
  [3.23, 2.92, 3.75],
  [2.01, 2.92, 4.25],
  [0.64, 2.92, 4.63],
  [-0.76, 2.92, 4.84],
  [-2.17, 2.92, 4.88],
  [-3.98, 2.92, 4.67],
  [-6.27, 2.92, 6.75],
  [-7.35, 2.92, 7.21],
  [-8.91, 2.92, 8.63],
  [-7.95, 2.92, 11.49],
  [-3.71, 2.92, 15.73],
];
