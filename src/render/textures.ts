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
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Weathered horizontal planks. One texture unit = one metre. */
export const plankTexture = (): THREE.Texture =>
  cached('planks', () =>
    canvasTexture(
      256,
      (g, rng) => {
        const planks = 5;
        const ph = 256 / planks;
        for (let i = 0; i < planks; i++) {
          const base = 0.82 + rng.range(-0.1, 0.1);
          g.fillStyle = `rgb(${Math.round(150 * base)},${Math.round(112 * base)},${Math.round(78 * base)})`;
          g.fillRect(0, i * ph, 256, ph);
          for (let k = 0; k < 14; k++) {
            g.strokeStyle = `rgba(60,38,22,${rng.range(0.05, 0.18)})`;
            g.lineWidth = rng.range(0.5, 1.6);
            g.beginPath();
            const y = i * ph + rng.range(3, ph - 3);
            g.moveTo(0, y);
            for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + rng.range(-1.4, 1.4));
            g.stroke();
          }
          g.fillStyle = 'rgba(30,18,10,0.55)';
          g.fillRect(0, i * ph, 256, 2);
          const seam = rng.range(40, 220);
          g.fillRect(seam, i * ph, 2, ph);
          for (const nx of [seam - 6, seam + 6]) {
            g.fillStyle = 'rgba(40,40,40,0.6)';
            g.fillRect(nx, i * ph + 5, 2, 2);
            g.fillRect(nx, i * ph + ph - 7, 2, 2);
          }
        }
      },
      11,
    ),
  );

/** Whitewashed planks for cottages and the lighthouse. */
export const paintedPlankTexture = (): THREE.Texture =>
  cached('planks-painted', () =>
    canvasTexture(
      256,
      (g, rng) => {
        const planks = 5;
        const ph = 256 / planks;
        for (let i = 0; i < planks; i++) {
          const v = 0.9 + rng.range(-0.05, 0.05);
          g.fillStyle = `rgb(${Math.round(236 * v)},${Math.round(232 * v)},${Math.round(222 * v)})`;
          g.fillRect(0, i * ph, 256, ph);
          for (let k = 0; k < 10; k++) {
            g.fillStyle = `rgba(120,110,95,${rng.range(0.04, 0.12)})`;
            g.fillRect(rng.range(0, 256), i * ph + rng.range(2, ph - 4), rng.range(10, 60), rng.range(1, 3));
          }
          g.fillStyle = 'rgba(70,60,50,0.35)';
          g.fillRect(0, i * ph + ph - 3, 256, 3);
        }
      },
      13,
    ),
  );

export const shingleTexture = (): THREE.Texture =>
  cached('shingles', () =>
    canvasTexture(
      256,
      (g, rng) => {
        g.fillStyle = '#3b3430';
        g.fillRect(0, 0, 256, 256);
        const rows = 8;
        const rh = 256 / rows;
        for (let r = 0; r < rows; r++) {
          let x = r % 2 ? -16 : 0;
          while (x < 256) {
            const w = rng.range(22, 38);
            const v = rng.range(0.75, 1.1);
            g.fillStyle = `rgb(${Math.round(78 * v)},${Math.round(66 * v)},${Math.round(60 * v)})`;
            g.fillRect(x + 1, r * rh + 1, w - 2, rh - 2);
            g.fillStyle = 'rgba(0,0,0,0.35)';
            g.fillRect(x, r * rh + rh - 4, w, 4);
            if (rng.chance(0.25)) {
              g.fillStyle = `rgba(80,110,50,${rng.range(0.2, 0.5)})`; // moss
              g.fillRect(x + rng.range(0, w - 8), r * rh + rng.range(2, rh - 8), rng.range(4, 12), rng.range(3, 6));
            }
            x += w;
          }
        }
      },
      23,
    ),
  );

export const stoneTexture = (): THREE.Texture =>
  cached('stone', () =>
    canvasTexture(
      256,
      (g, rng) => {
        g.fillStyle = '#4a4744';
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 70; i++) {
          const v = rng.range(0.7, 1.15);
          g.fillStyle = `rgb(${Math.round(120 * v)},${Math.round(116 * v)},${Math.round(108 * v)})`;
          const x = rng.range(0, 256);
          const y = rng.range(0, 256);
          const w = rng.range(26, 56);
          const h = rng.range(18, 34);
          g.beginPath();
          g.ellipse(x, y, w / 2, h / 2, rng.range(-0.3, 0.3), 0, Math.PI * 2);
          g.fill();
        }
      },
      37,
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
