import type { GameEventBus } from '../core/events';
import { MAP_BIN, type StoryState } from '../story/StoryState';
import type { Terrain } from '../world/Terrain';
import { LOCATIONS, PLAYABLE, REGIONS, RIVERS, SEA_Y } from '../world/WorldDef';
import { h, ICONS, show } from './dom';

const REGION_INK: Record<string, string> = { frost: '#c9d6e2', woods: '#7fa05c', city: '#a19b8e', coast: '#c9b98b' };

/** Explored-strip map: terrain profile, regions, landmarks, objective and player marker. */
export class MapScreen {
  readonly el: HTMLElement;
  private canvas = h('canvas', { class: 'map__canvas' }) as HTMLCanvasElement;
  private legend = h('div', { class: 'map__legend' });
  private profile: Float32Array | null = null;
  onClose: () => void = () => {};

  constructor(
    root: HTMLElement,
    private events: GameEventBus,
    private terrain: () => Terrain,
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

  open(story: StoryState, playerX: number, objective: { text: string; x: number } | null): void {
    show(this.el, true);
    this.events.emit('ui:sound', { kind: 'page' });
    requestAnimationFrame(() => this.draw(story, playerX, objective));
  }

  close(): void {
    if (!this.visible) return;
    show(this.el, false);
    this.events.emit('ui:sound', { kind: 'close' });
    this.onClose();
  }

  private draw(story: StoryState, px: number, objective: { text: string; x: number } | null): void {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const x0 = PLAYABLE.min;
    const x1 = PLAYABLE.max;
    const sx = (x: number) => ((x - x0) / (x1 - x0)) * (W - 40) + 20;
    const t = this.terrain();
    if (!this.profile) {
      this.profile = new Float32Array(Math.ceil((x1 - x0) / 4));
      for (let i = 0; i < this.profile.length; i++) this.profile[i] = t.heightAt(x0 + i * 4);
    }
    const base = H * 0.62;
    const sy = (y: number) => base - y * 5;
    g.clearRect(0, 0, W, H);
    // Paper
    g.fillStyle = '#e4d9bf';
    g.fillRect(0, 0, W, H);
    // Region bands
    for (const r of REGIONS) {
      g.fillStyle = REGION_INK[r.id] + '33';
      g.fillRect(sx(Math.max(r.x0, x0)), 0, sx(Math.min(r.x1, x1)) - sx(Math.max(r.x0, x0)), H);
      g.fillStyle = '#4a3f30';
      g.font = `600 11px Inter, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText(r.name.replace('The ', '').toUpperCase(), (sx(Math.max(r.x0, x0)) + sx(Math.min(r.x1, x1))) / 2, 22);
    }
    // Sea
    g.fillStyle = '#7fa0ad88';
    g.fillRect(sx(1100), sy(SEA_Y), sx(x1) - sx(1100), H - sy(SEA_Y));
    // Terrain profile, revealed only where explored
    const prof = this.profile;
    g.lineWidth = 2;
    for (let i = 0; i < prof.length - 1; i++) {
      const x = x0 + i * 4;
      const seen = story.explored.has(Math.floor(x / MAP_BIN));
      const reg = REGIONS.find((r) => x >= r.x0 && x < r.x1) ?? REGIONS[1];
      g.strokeStyle = seen ? '#3d3427' : '#3d342722';
      g.beginPath();
      g.moveTo(sx(x), sy(prof[i]));
      g.lineTo(sx(x + 4), sy(prof[i + 1]));
      g.stroke();
      if (seen) {
        g.fillStyle = REGION_INK[reg.id] + 'aa';
        g.fillRect(sx(x), sy(prof[i]), sx(x + 4) - sx(x) + 0.5, H - sy(prof[i]));
      }
    }
    // Rivers
    for (const r of RIVERS) {
      if (!story.explored.has(Math.floor(r.x / MAP_BIN))) continue;
      g.fillStyle = r.frozen ? '#d9e7f0' : '#5d8fa8';
      g.fillRect(sx(r.x - r.width / 2), sy(t.riverWaterY(r)), sx(r.x + r.width / 2) - sx(r.x - r.width / 2), 6);
    }
    // Underground passages (known once discovered)
    g.setLineDash([4, 4]);
    g.strokeStyle = '#3d342799';
    for (const [a, b, id] of [
      [752, 893, 'metro'],
      [1500, 1548, 'sea-caves'],
      [-852, -774, 'halcyon-station'],
    ] as const) {
      if (!story.locations.has(id)) continue;
      g.beginPath();
      g.moveTo(sx(a), H - 40);
      g.lineTo(sx(b), H - 40);
      g.stroke();
    }
    g.setLineDash([]);
    // Landmarks
    g.textAlign = 'center';
    for (const l of LOCATIONS) {
      if (!story.locations.has(l.id)) continue;
      const lx = (l.x0 + l.x1) / 2;
      const ly = sy(t.heightAt(lx));
      g.fillStyle = '#2b241b';
      g.beginPath();
      g.arc(sx(lx), ly - 8, l.landmark ? 3.5 : 2.5, 0, Math.PI * 2);
      g.fill();
      if (l.landmark) {
        g.save();
        g.translate(sx(lx), ly - 16);
        g.rotate(-Math.PI / 4);
        g.font = `500 11px 'Cormorant Garamond', Georgia, serif`;
        g.textAlign = 'left';
        g.fillText(l.name, 0, 0);
        g.restore();
      }
    }
    // Objective
    if (objective) {
      const ox = sx(objective.x);
      g.strokeStyle = '#b5532f';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(ox, sy(t.heightAt(objective.x)) - 8, 9, 0, Math.PI * 2);
      g.stroke();
    }
    // Player
    const pX = sx(px);
    const pY = sy(t.heightAt(px)) - 8;
    g.fillStyle = '#e8a24a';
    g.strokeStyle = '#2b241b';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(pX, pY - 10);
    g.lineTo(pX + 6, pY);
    g.lineTo(pX - 6, pY);
    g.closePath();
    g.fill();
    g.stroke();
    const explored = Math.round((story.explored.size * MAP_BIN * 100) / (x1 - x0));
    this.legend.innerHTML = `<span><i class="map__dot is-you"></i>You</span><span><i class="map__dot is-goal"></i>${objective ? objective.text : 'No current objective'}</span><span>${Math.min(100, explored)}% explored · ${story.locations.size} places found</span>`;
  }
}
