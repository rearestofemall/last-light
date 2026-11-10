import * as THREE from 'three';
import { Rng } from '../core/rng';

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, rng: Rng) => void, seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, new Rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Textures that tile across surfaces; the surface pass maps these in world space. */
export const TILING = new Set<THREE.Texture>();
function tiling(t: THREE.Texture): THREE.Texture {
  TILING.add(t);
  return t;
}

/** Smooth tileable value noise (period `cells` across `size` pixels), in [0, 1]. */
function noiseField(size: number, cells: number, rng: Rng): (x: number, y: number) => number {
  const grid = Array.from({ length: cells * cells }, () => rng.float());
  const at = (i: number, j: number) => grid[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  return (x, y) => {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    return a + (b - a) * sv;
  };
}

/** Multiply the canvas by layered noise (grime, mottling). */
function mottle(g: CanvasRenderingContext2D, size: number, rng: Rng, amount: number, scales: number[] = [4, 12, 40]): void {
  const fields = scales.map((c) => noiseField(size, c, rng));
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      let w = 0;
      fields.forEach((f, k) => {
        const wk = 1 / (k + 1);
        n += f(x, y) * wk;
        w += wk;
      });
      const m = 1 + (n / w - 0.5) * 2 * amount;
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, d[i] * m);
      d[i + 1] = Math.min(255, d[i + 1] * m);
      d[i + 2] = Math.min(255, d[i + 2] * m);
    }
  }
  g.putImageData(img, 0, 0);
}

const rgb = (r: number, gg: number, b: number, k = 1, a = 1) => `rgba(${Math.round(r * k)},${Math.round(gg * k)},${Math.round(b * k)},${a})`;

/** Weathered horizontal planks with grain, knots, seams and nails. One repeat = 1.2 m. */
export const plankTexture = (): THREE.Texture =>
  cached('planks', () =>
    tiling(
      canvasTexture(
        512,
        (g, rng) => {
          const planks = 5;
          const ph = 512 / planks;
          for (let i = 0; i < planks; i++) {
            const y0 = i * ph;
            const k = 0.78 + rng.range(-0.12, 0.12);
            const tone = rng.pick([
              [152, 113, 78],
              [140, 104, 72],
              [160, 124, 88],
              [131, 98, 70],
            ]);
            g.fillStyle = rgb(tone[0], tone[1], tone[2], k);
            g.fillRect(0, y0, 512, ph);
            // Grain: long wavy lines.
            const phase = rng.range(0, 10);
            for (let l = 0; l < 26; l++) {
              const y = y0 + rng.range(2, ph - 2);
              g.strokeStyle = rng.chance(0.5) ? `rgba(70,44,26,${rng.range(0.08, 0.22)})` : `rgba(210,170,120,${rng.range(0.05, 0.14)})`;
              g.lineWidth = rng.range(0.6, 2.2);
              g.beginPath();
              for (let x = 0; x <= 512; x += 16) {
                const yy = y + Math.sin(x * 0.012 + phase + l) * rng.range(0.5, 2.2);
                if (x === 0) g.moveTo(x, yy);
                else g.lineTo(x, yy);
              }
              g.stroke();
            }
            // Knots with rings.
            for (let n = 0; n < rng.int(0, 2); n++) {
              const kx = rng.range(30, 480);
              const ky = y0 + rng.range(12, ph - 12);
              for (let r = 9; r > 1; r -= 2) {
                g.strokeStyle = `rgba(60,36,20,${0.12 + (9 - r) * 0.05})`;
                g.lineWidth = 1.2;
                g.beginPath();
                g.ellipse(kx, ky, r * 1.9, r * 0.8, 0, 0, Math.PI * 2);
                g.stroke();
              }
              g.fillStyle = 'rgba(45,26,14,0.75)';
              g.beginPath();
              g.ellipse(kx, ky, 3.5, 2, 0, 0, Math.PI * 2);
              g.fill();
            }
            // Gaps, butt joints and nails.
            g.fillStyle = 'rgba(25,15,8,0.7)';
            g.fillRect(0, y0, 512, 3);
            g.fillStyle = 'rgba(255,230,190,0.12)';
            g.fillRect(0, y0 + 3, 512, 2);
            const seam = rng.range(60, 450);
            g.fillStyle = 'rgba(25,15,8,0.65)';
            g.fillRect(seam, y0, 3, ph);
            for (const nx of [seam - 10, seam + 12, rng.range(20, 500)]) {
              g.fillStyle = 'rgba(35,35,38,0.8)';
              g.fillRect(nx, y0 + 10, 3, 3);
              g.fillRect(nx, y0 + ph - 13, 3, 3);
              g.fillStyle = 'rgba(110,60,30,0.25)';
              g.fillRect(nx - 1, y0 + 13, 4, rng.range(6, 20));
            }
          }
          mottle(g, 512, rng, 0.14);
        },
        11,
      ),
    ),
  );

/** Whitewashed planks with chipped paint and dirt rising from the ground. */
export const paintedPlankTexture = (): THREE.Texture =>
  cached('planks-painted', () =>
    tiling(
      canvasTexture(
        512,
        (g, rng) => {
          const planks = 5;
          const ph = 512 / planks;
          for (let i = 0; i < planks; i++) {
            const v = 0.92 + rng.range(-0.05, 0.04);
            g.fillStyle = rgb(236, 232, 222, v);
            g.fillRect(0, i * ph, 512, ph);
            for (let k = 0; k < 18; k++) {
              g.fillStyle = `rgba(120,110,95,${rng.range(0.04, 0.12)})`;
              g.fillRect(rng.range(0, 512), i * ph + rng.range(2, ph - 4), rng.range(20, 120), rng.range(1, 3));
            }
            // Paint chips showing the wood beneath.
            for (let k = 0; k < rng.int(2, 6); k++) {
              g.fillStyle = `rgba(130,96,64,${rng.range(0.5, 0.85)})`;
              g.beginPath();
              const cx = rng.range(0, 512);
              const cy = i * ph + rng.range(4, ph - 4);
              g.moveTo(cx, cy);
              for (let a = 0; a < 6; a++) g.lineTo(cx + Math.cos(a) * rng.range(3, 14), cy + Math.sin(a) * rng.range(2, 7));
              g.fill();
            }
            g.fillStyle = 'rgba(70,60,50,0.4)';
            g.fillRect(0, i * ph + ph - 4, 512, 4);
            g.fillStyle = 'rgba(255,255,255,0.35)';
            g.fillRect(0, i * ph, 512, 2);
          }
          mottle(g, 512, rng, 0.08);
        },
        13,
      ),
    ),
  );

/** Overlapping roof shingles with bevelled edges, moss and the odd cracked tile. */
export const shingleTexture = (): THREE.Texture =>
  cached('shingles', () =>
    tiling(
      canvasTexture(
        512,
        (g, rng) => {
          g.fillStyle = '#2b2522';
          g.fillRect(0, 0, 512, 512);
          const rows = 10;
          const rh = 512 / rows;
          for (let r = 0; r < rows; r++) {
            let x = r % 2 ? -22 : 0;
            while (x < 512) {
              const w = rng.range(34, 58);
              const v = rng.range(0.72, 1.12);
              const y = r * rh;
              g.fillStyle = rgb(84, 71, 64, v);
              g.fillRect(x + 1.5, y + 1, w - 3, rh - 1);
              const grad = g.createLinearGradient(0, y, 0, y + rh);
              grad.addColorStop(0, 'rgba(0,0,0,0.25)');
              grad.addColorStop(0.7, 'rgba(255,255,255,0.05)');
              grad.addColorStop(1, 'rgba(255,255,255,0.18)');
              g.fillStyle = grad;
              g.fillRect(x + 1.5, y + 1, w - 3, rh - 1);
              g.fillStyle = 'rgba(0,0,0,0.5)';
              g.fillRect(x, y + rh - 3, w, 3);
              if (rng.chance(0.08)) {
                g.strokeStyle = 'rgba(20,15,12,0.7)';
                g.lineWidth = 1.2;
                g.beginPath();
                g.moveTo(x + rng.range(5, w - 5), y + 2);
                g.lineTo(x + rng.range(5, w - 5), y + rh - 4);
                g.stroke();
              }
              if (rng.chance(0.22)) {
                g.fillStyle = `rgba(86,112,52,${rng.range(0.25, 0.6)})`;
                g.beginPath();
                g.ellipse(x + rng.range(6, w - 6), y + rng.range(rh * 0.5, rh - 4), rng.range(4, 12), rng.range(2, 5), 0, 0, Math.PI * 2);
                g.fill();
              }
              x += w;
            }
          }
          mottle(g, 512, rng, 0.12);
        },
        23,
      ),
    ),
  );

/** Fieldstone wall: rounded stones of varied size, lit from above, in dark mortar. */
export const stoneTexture = (): THREE.Texture =>
  cached('stone', () =>
    tiling(
      canvasTexture(
        512,
        (g, rng) => {
          g.fillStyle = '#3f3b37';
          g.fillRect(0, 0, 512, 512);
          // Rows of stones, wrapped horizontally so the texture tiles.
          let y = 0;
          while (y < 512) {
            const rowH = rng.range(34, 60);
            let x = rng.range(-30, 0);
            while (x < 512) {
              const w = rng.range(40, 90);
              const cx = x + w / 2;
              const cy = y + rowH / 2;
              const v = rng.range(0.7, 1.12);
              const hue = rng.pick([
                [128, 122, 112],
                [118, 116, 110],
                [136, 126, 110],
                [110, 106, 100],
              ]);
              for (const ox of [0, 512, -512]) {
                const grad = g.createRadialGradient(cx + ox - w * 0.15, cy - rowH * 0.2, 2, cx + ox, cy, w * 0.6);
                grad.addColorStop(0, rgb(hue[0], hue[1], hue[2], v * 1.15));
                grad.addColorStop(1, rgb(hue[0], hue[1], hue[2], v * 0.78));
                g.fillStyle = grad;
                g.beginPath();
                g.ellipse(cx + ox, cy, w / 2 - 3, rowH / 2 - 3, rng.range(-0.08, 0.08), 0, Math.PI * 2);
                g.fill();
              }
              x += w - rng.range(0, 6);
            }
            y += rowH - 4;
          }
          mottle(g, 512, rng, 0.16);
        },
        37,
      ),
    ),
  );

/** Running-bond brick with mortar, soot and chipped corners. */
export const brickTexture = (): THREE.Texture =>
  cached('brick', () =>
    tiling(
      canvasTexture(
        512,
        (g, rng) => {
          g.fillStyle = '#8f877b';
          g.fillRect(0, 0, 512, 512);
          const rows = 16;
          const rh = 512 / rows;
          const bw = 64;
          for (let r = 0; r < rows; r++) {
            for (let c = -1; c < 512 / bw + 1; c++) {
              const x = c * bw + (r % 2 ? bw / 2 : 0);
              const v = rng.range(0.78, 1.12);
              const base = rng.pick([
                [168, 92, 68],
                [150, 78, 58],
                [178, 104, 76],
                [132, 70, 54],
              ]);
              g.fillStyle = rgb(base[0], base[1], base[2], v);
              g.fillRect(x + 2, r * rh + 2, bw - 4, rh - 4);
              g.fillStyle = 'rgba(255,220,190,0.12)';
              g.fillRect(x + 2, r * rh + 2, bw - 4, 2);
              g.fillStyle = 'rgba(0,0,0,0.18)';
              g.fillRect(x + 2, r * rh + rh - 4, bw - 4, 2);
              if (rng.chance(0.15)) {
                g.fillStyle = '#8f877b';
                g.fillRect(x + (rng.chance(0.5) ? 2 : bw - 9), r * rh + 2, 7, 5);
              }
            }
          }
          mottle(g, 512, rng, 0.2, [3, 8, 32]);
        },
        41,
      ),
    ),
  );

/** Weathered concrete: mottled, with formwork lines, cracks and rain stains. */
export const concreteTexture = (): THREE.Texture =>
  cached('concrete', () =>
    tiling(
      canvasTexture(
        512,
        (g, rng) => {
          g.fillStyle = '#a19e96';
          g.fillRect(0, 0, 512, 512);
          for (let k = 0; k < 2200; k++) {
            g.fillStyle = rng.chance(0.5) ? `rgba(60,58,54,${rng.range(0.05, 0.2)})` : `rgba(230,228,220,${rng.range(0.05, 0.18)})`;
            g.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(1, 3), rng.range(1, 3));
          }
          g.fillStyle = 'rgba(60,58,54,0.25)';
          g.fillRect(0, 255, 512, 2);
          for (let k = 0; k < 6; k++) {
            const x = rng.range(0, 512);
            const grad = g.createLinearGradient(0, 0, 0, 512);
            grad.addColorStop(0, 'rgba(50,48,44,0.2)');
            grad.addColorStop(1, 'rgba(50,48,44,0)');
            g.fillStyle = grad;
            g.fillRect(x, 0, rng.range(8, 30), rng.range(120, 400));
          }
          for (let k = 0; k < 3; k++) {
            g.strokeStyle = 'rgba(40,38,35,0.55)';
            g.lineWidth = 1;
            g.beginPath();
            let x = rng.range(0, 512);
            let y = rng.range(0, 512);
            g.moveTo(x, y);
            for (let s = 0; s < 8; s++) {
              x += rng.range(-18, 18);
              y += rng.range(6, 22);
              g.lineTo(x, y);
            }
            g.stroke();
          }
          mottle(g, 512, rng, 0.14);
        },
        43,
      ),
    ),
  );

/** Cracked asphalt with fine aggregate. */
export const asphaltTexture = (): THREE.Texture =>
  cached('asphalt', () =>
    tiling(
      canvasTexture(
        512,
        (g, rng) => {
          g.fillStyle = '#3c3c3e';
          g.fillRect(0, 0, 512, 512);
          for (let k = 0; k < 9000; k++) {
            const v = rng.range(0.6, 1.6);
            g.fillStyle = rgb(62, 62, 64, v, rng.range(0.3, 0.8));
            g.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(1, 2.5), rng.range(1, 2.5));
          }
          for (let k = 0; k < 5; k++) {
            g.strokeStyle = 'rgba(15,15,16,0.7)';
            g.lineWidth = rng.range(1, 2);
            g.beginPath();
            let x = rng.range(0, 512);
            let y = rng.range(0, 512);
            g.moveTo(x, y);
            for (let s = 0; s < 10; s++) {
              x += rng.range(-25, 25);
              y += rng.range(-25, 25);
              g.lineTo(x, y);
            }
            g.stroke();
          }
          mottle(g, 512, rng, 0.12);
        },
        47,
      ),
    ),
  );

/** Corrugated sheet metal with rust runs. */
export const metalTexture = (): THREE.Texture =>
  cached('metal', () =>
    tiling(
      canvasTexture(
        512,
        (g, rng) => {
          for (let x = 0; x < 512; x++) {
            const v = 0.78 + Math.sin((x / 512) * Math.PI * 2 * 16) * 0.16;
            g.fillStyle = rgb(170, 174, 178, v);
            g.fillRect(x, 0, 1, 512);
          }
          for (let k = 0; k < 14; k++) {
            const x = rng.range(0, 512);
            const y = rng.range(0, 400);
            const grad = g.createLinearGradient(0, y, 0, y + rng.range(60, 200));
            grad.addColorStop(0, `rgba(130,70,38,${rng.range(0.4, 0.7)})`);
            grad.addColorStop(1, 'rgba(130,70,38,0)');
            g.fillStyle = grad;
            g.fillRect(x, y, rng.range(4, 16), 220);
          }
          g.fillStyle = 'rgba(40,40,42,0.6)';
          for (const y of [4, 256]) for (let x = 8; x < 512; x += 32) g.fillRect(x, y, 3, 3);
          mottle(g, 512, rng, 0.12);
        },
        53,
      ),
    ),
  );

/** Square floor tiles with grout and wear. */
export const tileTexture = (): THREE.Texture =>
  cached('tile', () =>
    tiling(
      canvasTexture(
        512,
        (g, rng) => {
          g.fillStyle = '#6f6b64';
          g.fillRect(0, 0, 512, 512);
          const n = 8;
          const s = 512 / n;
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
              const v = rng.range(0.85, 1.05);
              g.fillStyle = rgb(214, 210, 198, v);
              g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
              if (rng.chance(0.06)) {
                g.strokeStyle = 'rgba(60,58,54,0.6)';
                g.beginPath();
                g.moveTo(i * s + rng.range(4, s - 4), j * s + 3);
                g.lineTo(i * s + rng.range(4, s - 4), j * s + s - 3);
                g.stroke();
              }
            }
          }
          mottle(g, 512, rng, 0.12);
        },
        59,
      ),
    ),
  );

export const paperTexture = (): THREE.Texture =>
  cached('paper', () =>
    canvasTexture(
      64,
      (g, rng) => {
        g.fillStyle = '#e8dfc8';
        g.fillRect(0, 0, 64, 64);
        g.strokeStyle = 'rgba(60,60,80,0.5)';
        for (let y = 10; y < 58; y += 6) {
          g.beginPath();
          g.moveTo(8, y);
          g.lineTo(rng.range(36, 56), y);
          g.stroke();
        }
      },
      41,
    ),
  );

/**
 * Box geometry whose UVs are scaled to world size, so textures tile at a constant density.
 * `unit` = metres per texture repeat.
 */
export function worldUvBox(w: number, h: number, d: number, unit = 1.2): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / unit, (uv.getY(i) * dims[f][1]) / unit);
    }
  }
  return geo;
}
