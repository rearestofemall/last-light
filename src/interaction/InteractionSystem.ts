import type { Input } from '../core/Input';
import type { GameEventBus } from '../core/events';

export interface Interactable {
  id: string;
  x: number;
  y: number;
  /** Depth position. When omitted, the object sits on the road band (|z| ≤ 4.5) and only x counts. */
  z?: number;
  /** Horizontal reach. */
  radius: number;
  /** Prompt verb, e.g. "Read", "Examine". */
  verb: string;
  label: string;
  /** Dynamic prompt; overrides verb + label when present. */
  prompt?: () => string;
  /** Secondary action on R. Return null to hide it. */
  altPrompt?: () => string | null;
  onAlt?: () => void;
  enabled?: () => boolean;
  /** Custom range test (e.g. rivers you can reach from the bank or while swimming). */
  inRange?: (px: number, py: number, pz: number) => boolean;
  /** Higher wins ties when several are in reach. */
  priority?: number;
  onInteract(): void;
}

/** Finds the closest interactable to the player and fires it on the interact/alt actions. */
export class InteractionSystem {
  private items: Interactable[] = [];
  private current: Interactable | null = null;
  private lastText = '';

  constructor(private events: GameEventBus) {}

  private near: Interactable[] = [];
  private nearDirty = true;
  private nearTimer = 0;
  private nearX = 0;
  private nearZ = 0;

  private refreshNear(px: number, pz: number): void {
    this.near.length = 0;
    for (const it of this.items) {
      if (it.inRange || (Math.abs(it.x - px) < it.radius + 12 && (it.z === undefined || Math.abs(it.z - pz) < it.radius + 12))) this.near.push(it);
    }
    this.nearDirty = false;
    this.nearTimer = 15;
    this.nearX = px;
    this.nearZ = pz;
  }

  add(i: Interactable): Interactable {
    this.nearDirty = true;
    this.items.push(i);
    return i;
  }

  remove(i: Interactable): void {
    this.nearDirty = true;
    const k = this.items.indexOf(i);
    if (k >= 0) this.items.splice(k, 1);
    if (this.current === i) this.setCurrent(null);
  }

  removeById(id: string): void {
    const it = this.items.find((i) => i.id === id);
    if (it) this.remove(it);
  }

  get focused(): Interactable | null {
    return this.current;
  }

  private test(it: Interactable, px: number, py: number, pz: number): number {
    if (it.inRange) {
      if (it.enabled && !it.enabled()) return Infinity;
      return it.inRange(px, py, pz) ? 0.5 - (it.priority ?? 0) : Infinity;
    }
    const dx = Math.abs(it.x - px);
    if (dx > it.radius + 0.5) return Infinity;
    let d: number;
    if (it.z === undefined) {
      if (Math.abs(pz) > 4.5) return Infinity;
      d = dx;
    } else {
      d = Math.hypot(dx, it.z - pz);
    }
    const dy = it.y - (py + 0.9);
    if (d > it.radius || Math.abs(dy) > 1.3) return Infinity;
    if (it.enabled && !it.enabled()) return Infinity;
    return d + Math.abs(dy) * 0.5 - (it.priority ?? 0);
  }

  update(px: number, py: number, pz: number, input: Input, enabled: boolean): void {
    let best: Interactable | null = null;
    let bestD = Infinity;
    if (enabled) {
      // Only things near the player are tested; the short list is refreshed a few times a
      // second, when the player has moved, or when something is added or removed.
      if (this.nearDirty || --this.nearTimer <= 0 || Math.abs(px - this.nearX) > 4 || Math.abs(pz - this.nearZ) > 4) this.refreshNear(px, pz);
      for (const it of this.near) {
        const d = this.test(it, px, py, pz);
        if (d < bestD) {
          bestD = d;
          best = it;
        }
      }
    }
    this.setCurrent(best);
    if (!best) return;
    if (input.consume('interact')) best.onInteract();
    else if (best.onAlt && input.consume('alt')) {
      if (best.altPrompt?.() !== null) best.onAlt();
    }
    this.emitPrompt(best);
  }

  private text(i: Interactable): string {
    return i.prompt ? i.prompt() : `${i.verb} ${i.label}`;
  }

  private emitPrompt(i: Interactable | null): void {
    if (!i) {
      if (this.lastText !== '') this.events.emit('interact:prompt', null);
      this.lastText = '';
      return;
    }
    const text = this.text(i);
    const alt = i.altPrompt?.() ?? undefined;
    const key = `${text}|${alt ?? ''}|${i.x}|${i.y}`;
    if (key === this.lastText) return;
    this.lastText = key;
    this.events.emit('interact:prompt', { text, alt: alt ?? undefined, key: 'E', worldX: i.x, worldY: i.y, worldZ: i.z ?? 0 });
  }

  private setCurrent(i: Interactable | null): void {
    if (i === this.current) return;
    this.current = i;
    this.emitPrompt(i);
  }

  clear(): void {
    this.items = [];
    this.setCurrent(null);
  }
}
