// Procedural textures, drawn on canvases at load time so the site needs no image downloads.
// Every texture tiles seamlessly and stands for a known size in metres. The building's UVs are in
// metres, so a texture's repeat is simply one over its size (set here).

import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/** Phones get smaller canvases. */
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const BASE = COARSE ? 512 : 1024;

type Random = () => number;
type Draw = (g: CanvasRenderingContext2D, w: number, h: number, random: Random) => void;

/** A small seeded generator (mulberry32), so the textures look the same on every visit. */
function seeded(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make(width: number, height: number, metres: [number, number], draw: Draw, seed: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (g) draw(g, width, height, seeded(seed));
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.repeat.set(1 / metres[0], 1 / metres[1]);
  return texture;
}

/** Calls `draw` at x, y and at the copies one canvas over, so shapes crossing an edge wrap. */
function wrapped(w: number, h: number, x: number, y: number, size: number, draw: (x: number, y: number) => void) {
  for (const dx of [-w, 0, w]) {
    for (const dy of [-h, 0, h]) {
      const px = x + dx;
      const py = y + dy;
      if (px + size < 0 || px - size > w || py + size < 0 || py - size > h) continue;
      draw(px, py);
    }
  }
}

const grey = (v: number, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

/** Soft blotches and fine grain around white: multiplied with a material's own colour. */
function mottle(g: CanvasRenderingContext2D, w: number, h: number, random: Random, blotches: number, contrast: number, grain: number) {
  g.fillStyle = grey(244);
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < blotches; i++) {
    const r = (0.02 + random() * 0.08) * w;
    const v = 244 + (random() - 0.5) * 2 * contrast;
    wrapped(w, h, random() * w, random() * h, r, (x, y) => {
      const gradient = g.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, grey(v, 0.35));
      gradient.addColorStop(1, grey(v, 0));
      g.fillStyle = gradient;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    });
  }
  for (let i = 0; i < grain * w; i++) {
    g.fillStyle = grey(random() < 0.5 ? 225 : 255, 0.25);
    g.fillRect(random() * w, random() * h, 1, 1);
  }
}

// ---- Building ------------------------------------------------------------------------------------

/** Oak floor boards, 2.4 m square: rows 0.16 m wide, boards of mixed length, staggered joints. */
function woodFloor(): Texture {
  const size = BASE;
  return make(size, size, [2.4, 2.4], (g, w, h, random) => {
    const rows = 15;
    const rowH = h / rows;
    const perMetre = w / 2.4;
    for (let row = 0; row < rows; row++) {
      const y = row * rowH;
      let x = random() * w;
      const end = x + w;
      while (x < end) {
        const length = Math.min((0.7 + random() * 1.5) * perMetre, end - x);
        const light = 56 + random() * 8;
        const hue = 31 + random() * 5;
        const saturation = 30 + random() * 7;
        // grain: long, faint, slightly wavy lines along the board (drawn the same in every copy)
        const grain = Array.from({ length: 9 }, () => ({
          y: 2 + random() * (rowH - 4),
          light: light - 10 - random() * 10,
          width: 0.6 + random() * 1.2,
          waves: 2 + random() * 3,
          amp: random() * 1.6,
        }));
        const knot = random() < 0.15 ? { x: random() * length, rx: 2 + random() * 3, ry: 1.5 + random() * 2 } : null;
        wrapped(w, h, x, y, length, (px, py) => {
          if (px > w || px + length < 0) return;
          g.fillStyle = hsl(hue, saturation, light);
          g.fillRect(px, py, length, rowH);
          for (const line of grain) {
            g.strokeStyle = hsl(hue - 4, 32, line.light, 0.18);
            g.lineWidth = line.width;
            g.beginPath();
            g.moveTo(px, py + line.y);
            for (let s = 1; s <= 12; s++) g.lineTo(px + (length * s) / 12, py + line.y + Math.sin((s / 12) * Math.PI * line.waves) * line.amp);
            g.stroke();
          }
          if (knot) {
            g.fillStyle = hsl(hue - 6, 45, light - 22, 0.6);
            g.beginPath();
            g.ellipse(px + knot.x, py + rowH / 2, knot.rx, knot.ry, 0, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = 'rgba(60,40,25,0.55)';
          g.fillRect(px, py, 1.2, rowH);
        });
        x += length;
      }
      g.fillStyle = 'rgba(55,38,24,0.6)';
      g.fillRect(0, y, w, 1.2);
    }
  }, 11);
}

/** Wood grain for furniture, doors and stair treads, 1 m square, running along U. */
function woodGrain(): Texture {
  const size = BASE / 2;
  return make(size, size, [1, 1], (g, w, h, random) => {
    g.fillStyle = hsl(32, 40, 58);
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 140; k++) {
      const y = random() * h;
      g.strokeStyle = hsl(28 + random() * 6, 42, 40 + random() * 20, 0.18 + random() * 0.15);
      g.lineWidth = 0.5 + random() * 1.5;
      const waves = 1 + random() * 2;
      const amp = 1 + random() * 3;
      wrapped(w, h, 0, y, amp + 2, (_, py) => {
        g.beginPath();
        for (let s = 0; s <= 24; s++) g.lineTo((w * s) / 24, py + Math.sin((s / 24) * Math.PI * 2 * Math.round(waves)) * amp);
        g.stroke();
      });
    }
  }, 12);
}

/** Ceramic floor tiles 0.6 m with grout; 1.2 m square (2 × 2 tiles). */
function tiles(): Texture {
  const size = BASE / 2;
  return make(size, size, [1.2, 1.2], (g, w, h, random) => {
    const n = 2;
    const t = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        g.fillStyle = grey(236 + (random() - 0.5) * 10);
        g.fillRect(i * t, j * t, t, t);
      }
    }
    for (let k = 0; k < w * 6; k++) {
      g.fillStyle = grey(random() < 0.5 ? 205 : 255, 0.3);
      g.fillRect(random() * w, random() * h, 1.5, 1.5);
    }
    g.fillStyle = grey(170);
    for (let i = 0; i < n; i++) {
      g.fillRect(i * t, 0, 2, h);
      g.fillRect(0, i * t, w, 2);
    }
  }, 13);
}

/** Speckled sheet vinyl for the laboratory, 2 m square. */
function vinyl(): Texture {
  const size = BASE / 2;
  return make(size, size, [2, 2], (g, w, h, random) => {
    mottle(g, w, h, random, 40, 6, 4);
    for (let k = 0; k < w * 10; k++) {
      g.fillStyle = random() < 0.6 ? grey(150, 0.35) : 'rgba(110,130,120,0.3)';
      g.fillRect(random() * w, random() * h, 1 + random() * 1.5, 1 + random() * 1.5);
    }
  }, 14);
}

/** Interior plaster: barely visible clouding, 2 m square. */
function plaster(): Texture {
  return make(BASE / 2, BASE / 2, [2, 2], (g, w, h, random) => mottle(g, w, h, random, 60, 7, 2), 15);
}

/** Exterior render: a little more texture than the plaster, 3 m square. */
function render(): Texture {
  return make(BASE / 2, BASE / 2, [3, 3], (g, w, h, random) => mottle(g, w, h, random, 90, 12, 8), 16);
}

/** Stone plinth: coursed blocks 0.3 m high, 2.4 × 1.2 m. */
function stoneCourses(): Texture {
  const w = BASE / 2;
  const h = BASE / 4;
  return make(w, h, [2.4, 1.2], (g, w, h, random) => {
    const rows = 4;
    const rowH = h / rows;
    const perMetre = w / 2.4;
    for (let row = 0; row < rows; row++) {
      let x = random() * w;
      const end = x + w;
      while (x < end) {
        const length = Math.min((0.45 + random() * 0.6) * perMetre, end - x);
        const v = 205 + (random() - 0.5) * 50;
        wrapped(w, h, x, row * rowH, length, (px, py) => {
          if (px > w || px + length < 0) return;
          g.fillStyle = `rgb(${v + 6},${v},${v - 8})`;
          g.fillRect(px, py, length, rowH);
          for (let k = 0; k < 40; k++) {
            g.fillStyle = grey(random() < 0.5 ? v - 30 : v + 25, 0.25);
            g.fillRect(px + random() * length, py + random() * rowH, 2, 2);
          }
          g.fillStyle = grey(95, 0.9);
          g.fillRect(px, py, 2, rowH);
        });
        x += length;
      }
      g.fillStyle = grey(95, 0.9);
      g.fillRect(0, row * rowH, w, 2);
    }
  }, 17);
}

/** Concrete pavers 0.6 × 0.3 m in running bond, 2.4 m square. */
function paving(): Texture {
  const size = BASE / 2;
  return make(size, size, [2.4, 2.4], (g, w, h, random) => {
    const cols = 4;
    const rows = 8;
    const pw = w / cols;
    const ph = h / rows;
    for (let r = 0; r < rows; r++) {
      const shift = (r % 2) * (pw / 2);
      for (let c = -1; c < cols; c++) {
        const x = c * pw + shift;
        const v = 228 + (random() - 0.5) * 22;
        wrapped(w, h, x, r * ph, pw, (px, py) => {
          g.fillStyle = grey(v);
          g.fillRect(px, py, pw, ph);
        });
      }
    }
    for (let k = 0; k < w * 8; k++) {
      g.fillStyle = grey(random() < 0.5 ? 190 : 255, 0.25);
      g.fillRect(random() * w, random() * h, 1.5, 1.5);
    }
    g.fillStyle = grey(150);
    for (let r = 0; r < rows; r++) {
      g.fillRect(0, r * ph, w, 2);
      const shift = (r % 2) * (pw / 2);
      for (let c = 0; c <= cols; c++) g.fillRect((c * pw + shift) % w, r * ph, 2, ph);
    }
  }, 18);
}

/** Board-marked concrete for the retaining wall, 3 m square: 0.15 m boards and tie holes. */
function boardConcrete(): Texture {
  const size = BASE / 2;
  return make(size, size, [3, 3], (g, w, h, random) => {
    mottle(g, w, h, random, 50, 14, 6);
    const boards = 20;
    const bh = h / boards;
    for (let b = 0; b < boards; b++) {
      g.fillStyle = grey(244 + (random() - 0.5) * 22, 0.45);
      g.fillRect(0, b * bh, w, bh);
      g.fillStyle = grey(170, 0.5);
      g.fillRect(0, b * bh, w, 1);
    }
    g.fillStyle = grey(120, 0.8);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      g.beginPath();
      g.arc((i + 0.5) * (w / 5), (j + 0.5) * (h / 3), 3, 0, Math.PI * 2);
      g.fill();
    }
  }, 19);
}

/** Sedum mat for the green roof, 3 m square. */
function sedum(): Texture {
  const size = BASE / 2;
  return make(size, size, [3, 3], (g, w, h, random) => {
    g.fillStyle = hsl(80, 30, 34);
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < w * 12; k++) {
      const pick = random();
      const colour = pick < 0.55 ? hsl(80 + random() * 25, 35 + random() * 20, 28 + random() * 18) : pick < 0.8 ? hsl(55 + random() * 15, 35, 38 + random() * 12) : hsl(10 + random() * 15, 35, 32 + random() * 10);
      const r = 1 + random() * 2.5;
      wrapped(w, h, random() * w, random() * h, r, (x, y) => {
        g.fillStyle = colour;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      });
    }
  }, 20);
}

/** Book spines and box files for shelves: stripes along U, 1 m square. */
function books(): Texture {
  const size = BASE / 4;
  return make(size, size, [1, 1], (g, w, h, random) => {
    const colours = [hsl(4, 50, 38), hsl(210, 35, 35), hsl(140, 25, 32), hsl(40, 55, 50), hsl(25, 30, 70), hsl(200, 10, 85), hsl(0, 0, 25), hsl(95, 30, 45)];
    let x = 0;
    while (x < w) {
      const width = Math.max(2, (0.015 + random() * 0.05) * w);
      g.fillStyle = colours[(random() * colours.length) | 0];
      g.fillRect(x, 0, width, h);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x, 0, 1, h);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x + 1, h * 0.15, Math.max(1, width - 3), h * 0.08);
      x += width;
    }
  }, 21);
}

/**
 * The lobby's timeline wall: pictures above and below a line with year marks, no text (the
 * exhibition content is the team's to write). Mapped once over the whole panel.
 */
function timeline(): Texture {
  const texture = make(BASE * 2, BASE / 2, [1, 1], (g, w, h, random) => {
    g.fillStyle = hsl(40, 25, 93);
    g.fillRect(0, 0, w, h);
    const tones = [hsl(95, 30, 45), hsl(140, 30, 35), hsl(30, 35, 45), hsl(200, 35, 50), hsl(45, 45, 60), hsl(80, 25, 60)];
    g.fillStyle = hsl(150, 30, 22);
    g.fillRect(0, h * 0.52, w, h * 0.012);
    const marks = 12;
    for (let i = 0; i < marks; i++) {
      const x = ((i + 0.5) * w) / marks;
      g.beginPath();
      g.arc(x, h * 0.526, h * 0.025, 0, Math.PI * 2);
      g.fill();
      const above = i % 2 === 0;
      const pw = (w / marks) * (0.7 + random() * 0.2);
      const ph = h * (0.28 + random() * 0.08);
      const py = above ? h * 0.47 - ph : h * 0.58;
      g.fillStyle = tones[(random() * tones.length) | 0];
      g.fillRect(x - pw / 2, py, pw, ph);
      // a picture: hills and sky in the frame
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.moveTo(x - pw / 2, py + ph * 0.7);
      g.quadraticCurveTo(x, py + ph * (0.3 + random() * 0.3), x + pw / 2, py + ph * 0.75);
      g.lineTo(x + pw / 2, py + ph);
      g.lineTo(x - pw / 2, py + ph);
      g.fill();
      // caption lines
      g.fillStyle = 'rgba(40,50,45,0.35)';
      const cy = above ? py - h * 0.05 : py + ph + h * 0.03;
      g.fillRect(x - pw / 2, cy, pw * 0.8, h * 0.012);
      g.fillRect(x - pw / 2, cy + h * 0.025, pw * 0.55, h * 0.012);
      g.fillStyle = hsl(150, 30, 22);
    }
  }, 22);
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

/**
 * Soft contact shadow: black, its alpha falling off towards the edges. Stretched over a piece of
 * furniture's footprint (plus a margin) on the floor, it stands in for the ambient occlusion that
 * real-time lighting does not give.
 */
function softShadow(): Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const image = g.createImageData(size, size);
    const ramp = (t: number) => {
      const x = Math.min(1, Math.max(0, t / 0.4));
      return x * x * (3 - 2 * x);
    };
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const u = (i + 0.5) / size;
        const v = (j + 0.5) / size;
        image.data[(j * size + i) * 4 + 3] = Math.round(255 * ramp(Math.min(u, 1 - u)) * ramp(Math.min(v, 1 - v)));
      }
    }
    g.putImageData(image, 0, 0);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

// ---- Site -----------------------------------------------------------------------------------------

/** Meadow grass, 4 m square; its average matches the model's grass colour (#93A35C). */
function grass(): Texture {
  const size = BASE;
  return make(size, size, [4, 4], (g, w, h, random) => {
    g.fillStyle = '#93a35c';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const r = (0.04 + random() * 0.12) * w;
      const tone = random() < 0.5 ? hsl(75 + random() * 15, 30, 40, 0.25) : hsl(65 + random() * 10, 32, 58, 0.22);
      wrapped(w, h, random() * w, random() * h, r, (x, y) => {
        const gradient = g.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, tone);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gradient;
        g.fillRect(x - r, y - r, 2 * r, 2 * r);
      });
    }
    // blades: short strokes in many greens, a few straw-coloured
    for (let k = 0; k < w * 26; k++) {
      const x = random() * w;
      const y = random() * h;
      const length = 3 + random() * 7;
      const angle = random() * Math.PI * 2;
      const dry = random() < 0.12;
      g.strokeStyle = dry ? hsl(48 + random() * 10, 35, 62 + random() * 10, 0.5) : hsl(72 + random() * 22, 30 + random() * 15, 30 + random() * 26, 0.45);
      g.lineWidth = 0.8 + random() * 0.8;
      wrapped(w, h, x, y, length, (px, py) => {
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(angle) * length, py + Math.sin(angle) * length);
        g.stroke();
      });
    }
  }, 23);
}

const makers = {
  woodFloor,
  woodGrain,
  tiles,
  vinyl,
  plaster,
  render,
  stoneCourses,
  paving,
  boardConcrete,
  sedum,
  books,
  timeline,
  softShadow,
  grass,
};

export type TextureName = keyof typeof makers;

const cache = new Map<TextureName, Texture>();

/** One shared texture per name, drawn on first use. */
export function texture(name: TextureName): Texture {
  let t = cache.get(name);
  if (!t) cache.set(name, (t = makers[name]()));
  return t;
}
