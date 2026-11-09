import type { GameEventBus } from '../core/events';
import { exploredKey, MAP_BIN, type StoryState } from '../story/StoryState';
import type { Poi } from '../world/sites/poi';
import { type Terrain, VALLEY_HALF } from '../world/Terrain';
import { LOCATIONS, PLAYABLE, REGIONS, RIVERS, SEA_Y } from '../world/WorldDef';
import { h, ICONS, show } from './dom';

const PX = 6; // metres per relief pixel

export interface MapPlayer {
  x: number;
  z: number;
  heading: number;
}

/** Top-down map: hill-shaded relief under a fog of war that clears as you explore. */
export class MapScreen {
  readonly el: HTMLElement;
  private canvas = h('canvas', { class: 'map__canvas' }) as HTMLCanvasElement;
  private legend = h('div', { class: 'map__legend' });
  private relief: HTMLCanvasElement | null = null;
  onClose: () => void = () => {};

  constructor(
    root: HTMLElement,
    private events: GameEventBus,
    private terrain: () => Terrain,
    private pois: () => Poi[],
  ) {
    this.el = h(
      'div',
      { class: 'overlay map', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Map' },
      h(
        'div',
        { class: 'panel map__panel' },
        h('header', { class: 'panel__head' }, h('h2', {}, 'Map'), h('button', { class: 'icon-btn', 'aria-label': 'Close', html: ICONS.close, onclick: () => this.close() })),
        h('div', { class: 'map__wrap' }, this.canvas),
        this.legend,
      ),
    );
    root.append(this.el);
  }

  get visible(): boolean {
    return this.el.classList.contains('is-visible');
  }

  open(story: StoryState, player: MapPlayer, objective: { text: string; x: number } | null): void {
    show(this.el, true);
    this.events.emit('ui:sound', { kind: 'page' });
    requestAnimationFrame(() => this.draw(story, player, objective));
  }

  close(): void {
    if (!this.visible) return;
    show(this.el, false);
    this.events.emit('ui:sound', { kind: 'close' });
    this.onClose();
  }

  /** Pre-render the whole land once: colour by region and height, shaded from the north-west. */
  private buildRelief(): HTMLCanvasElement {
    const t = this.terrain();
    const W = Math.ceil((PLAYABLE.max - PLAYABLE.min) / PX);
    const H = Math.ceil((VALLEY_HALF * 2) / PX);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, H);
    const hex = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (let py = 0; py < H; py++) {
      const z = -VALLEY_HALF + py * PX;
      for (let px = 0; px < W; px++) {
        const x = PLAYABLE.min + px * PX;
        const hgt = t.heightAt3(x, z);
        const reg = REGIONS.find((r) => x >= r.x0 && x < r.x1) ?? REGIONS[1];
        let [r, gg, b] = hex(reg.palette.grass);
        if (reg.id === 'frost') [r, gg, b] = [222, 228, 234];
        const shade = (t.heightAt3(x - 3, z - 3) - hgt) * 0.12;
        const k = Math.max(0.55, Math.min(1.35, 1 + shade + (hgt - 4) * 0.008));
        r *= k;
        gg *= k;
        b *= k;
        const water = RIVERS.some((rv) => t.riverFactor(rv, x, z) > 0.55) || hgt < SEA_Y;
        if (water) [r, gg, b] = RIVERS.some((rv) => rv.frozen && t.riverFactor(rv, x, z) > 0.55) ? [205, 222, 232] : [92, 132, 150];
        if (Math.abs(z) < 2.5 && !water) [r, gg, b] = [150, 120, 84];
        const i = (py * W + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = gg;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  private draw(story: StoryState, pl: MapPlayer, objective: { text: string; x: number } | null): void {
    if (!this.relief) this.relief = this.buildRelief();
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const worldW = PLAYABLE.max - PLAYABLE.min;
    const worldH = VALLEY_HALF * 2;
    const scale = Math.min((W - 24) / worldW, (H - 24) / worldH);
    const ox = (W - worldW * scale) / 2;
    const oy = (H - worldH * scale) / 2;
    const sx = (x: number) => ox + (x - PLAYABLE.min) * scale;
    const sy = (z: number) => oy + (z + VALLEY_HALF) * scale;
    g.fillStyle = '#d9cdb1';
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.relief, ox, oy, worldW * scale, worldH * scale);
    // Fog of war over unexplored cells.
    // Painted opaque into a low-res mask, then laid over once: no seams between cells.
    const cols = Math.ceil(worldW / MAP_BIN);
    const rows = Math.ceil(worldH / MAP_BIN);
    const fog = document.createElement('canvas');
    fog.width = cols;
    fog.height = rows;
    const fg = fog.getContext('2d')!;
    fg.fillStyle = '#d9cdb1';
    for (let ci = 0; ci < cols; ci++) {
      for (let cj = 0; cj < rows; cj++) {
        const x = PLAYABLE.min + ci * MAP_BIN;
        const z = -VALLEY_HALF + cj * MAP_BIN;
        if (!story.explored.has(exploredKey(x + 1, z + 1))) fg.fillRect(ci, cj, 1, 1);
      }
    }
    g.save();
    g.globalAlpha = 0.88;
    g.imageSmoothingEnabled = true;
    g.drawImage(fog, ox, oy, cols * MAP_BIN * scale, rows * MAP_BIN * scale);
    g.restore();
    // Region names
    g.fillStyle = '#3d3427';
    g.font = `600 11px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    for (const r of REGIONS) g.fillText(r.name.replace('The ', '').toUpperCase(), (sx(Math.max(r.x0, PLAYABLE.min)) + sx(Math.min(r.x1, PLAYABLE.max))) / 2, oy + 14);
    // Landmarks on the road
    for (const l of LOCATIONS) {
      if (!story.locations.has(l.id)) continue;
      const lx = sx((l.x0 + l.x1) / 2);
      const ly = sy(0);
      g.fillStyle = '#2b241b';
      g.beginPath();
      g.arc(lx, ly, l.landmark ? 3.5 : 2.5, 0, Math.PI * 2);
      g.fill();
      if (l.landmark) {
        g.save();
        g.translate(lx, ly - 7);
        g.rotate(-Math.PI / 5);
        g.font = `500 11px 'Cormorant Garamond', Georgia, serif`;
        g.textAlign = 'left';
        g.fillText(l.name, 0, 0);
        g.restore();
      }
    }
    // Discovered points of interest
    for (const p of this.pois()) {
      if (!story.locations.has(p.id)) continue;
      g.fillStyle = '#7a4b2a';
      g.save();
      g.translate(sx(p.x), sy(p.z));
      g.rotate(Math.PI / 4);
      g.fillRect(-3, -3, 6, 6);
      g.restore();
    }
    if (objective) {
      g.strokeStyle = '#b5532f';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(sx(objective.x), sy(0), 8, 0, Math.PI * 2);
      g.stroke();
    }
    // Player arrow
    g.save();
    g.translate(sx(pl.x), sy(pl.z));
    g.rotate(Math.PI - pl.heading);
    g.fillStyle = '#e8a24a';
    g.strokeStyle = '#2b241b';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 6);
    g.lineTo(0, 3);
    g.lineTo(-6, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    const total = Math.ceil(worldW / MAP_BIN) * Math.ceil(worldH / MAP_BIN);
    const pct = Math.round((story.explored.size * 100) / total);
    const found = this.pois().filter((p) => story.locations.has(p.id)).length;
    this.legend.innerHTML = `<span><i class="map__dot is-you"></i>You</span><span><i class="map__dot is-goal"></i>${objective ? objective.text : 'No current objective'}</span><span>${pct}% explored · ${found}/${this.pois().length} wild places found</span>`;
  }
}
