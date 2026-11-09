import type { Input } from '../core/Input';
import type { GameEventBus } from '../core/events';

export interface Interactable {
  id: string;
  x: number;
  y: number;
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
  inRange?: (px: number, py: number) => boolean;
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

  add(i: Interactable): Interactable {
    this.items.push(i);
    return i;
  }

  remove(i: Interactable): void {
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

  private test(it: Interactable, px: number, py: number): number {
    if (it.enabled && !it.enabled()) return Infinity;
    if (it.inRange) return it.inRange(px, py) ? 0.5 - (it.priority ?? 0) : Infinity;
    const dx = Math.abs(it.x - px);
    const dy = it.y - (py + 0.9);
    if (dx > it.radius || Math.abs(dy) > 1.3) return Infinity;
    return dx + Math.abs(dy) * 0.5 - (it.priority ?? 0);
  }

  update(px: number, py: number, input: Input, enabled: boolean): void {
    let best: Interactable | null = null;
    let bestD = Infinity;
    if (enabled) {
      for (const it of this.items) {
        const d = this.test(it, px, py);
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
    this.events.emit('interact:prompt', { text, alt: alt ?? undefined, key: 'E', worldX: i.x, worldY: i.y });
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
