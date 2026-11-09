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
  enabled?: () => boolean;
  onInteract(): void;
}

/** Finds the closest interactable to the player and fires it on the interact action. */
export class InteractionSystem {
  private items: Interactable[] = [];
  private current: Interactable | null = null;

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

  get focused(): Interactable | null {
    return this.current;
  }

  update(px: number, py: number, input: Input, enabled: boolean): void {
    let best: Interactable | null = null;
    let bestD = Infinity;
    if (enabled) {
      for (const it of this.items) {
        if (it.enabled && !it.enabled()) continue;
        const dx = Math.abs(it.x - px);
        const dy = it.y - (py + 0.9);
        if (dx > it.radius || Math.abs(dy) > 1.3) continue;
        const d = dx + Math.abs(dy) * 0.5;
        if (d < bestD) {
          bestD = d;
          best = it;
        }
      }
    }
    this.setCurrent(best);
    if (best && input.consume('interact')) best.onInteract();
  }

  private setCurrent(i: Interactable | null): void {
    if (i === this.current) return;
    this.current = i;
    this.events.emit('interact:prompt', i ? { text: `${i.verb} ${i.label}`, key: 'E', worldX: i.x, worldY: i.y } : null);
  }

  clear(): void {
    this.items = [];
    this.setCurrent(null);
  }
}
