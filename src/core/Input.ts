export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'sprint'
  | 'interact'
  | 'pause';

const BINDINGS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  pause: ['Escape', 'KeyP'],
};

/** Human-readable key labels for prompts and the controls screen. */
export const ACTION_LABELS: Record<Action, string> = {
  left: 'A / ←',
  right: 'D / →',
  up: 'W / ↑',
  down: 'S / ↓',
  jump: 'Space',
  sprint: 'Shift',
  interact: 'E',
  pause: 'Esc',
};

/**
 * Keyboard input with action mapping.
 * `held` is level-triggered; presses are latched until consumed so that a press
 * between two fixed simulation steps is never lost.
 */
export class Input {
  private down = new Set<string>();
  private latched = new Set<Action>();
  private codeToAction = new Map<string, Action>();
  /** When false, gameplay actions are ignored (menus open). Pause still latches. */
  gameplayEnabled = true;
  wheelDelta = 0;

  constructor(target: Window = window) {
    for (const [action, codes] of Object.entries(BINDINGS) as [Action, string[]][]) {
      for (const c of codes) this.codeToAction.set(c, action);
    }
    target.addEventListener('keydown', (e) => this.onKey(e, true));
    target.addEventListener('keyup', (e) => this.onKey(e, false));
    target.addEventListener('blur', () => this.reset());
    target.addEventListener(
      'wheel',
      (e) => {
        this.wheelDelta += Math.sign(e.deltaY);
      },
      { passive: true },
    );
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    const action = this.codeToAction.get(e.code);
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (action && (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab')) e.preventDefault();
    if (isDown) {
      if (!this.down.has(e.code) && action) this.latched.add(action);
      this.down.add(e.code);
    } else {
      this.down.delete(e.code);
    }
  }

  held(action: Action): boolean {
    if (!this.gameplayEnabled && action !== 'pause') return false;
    for (const c of BINDINGS[action]) if (this.down.has(c)) return true;
    return false;
  }

  /** Returns true once per physical press. */
  consume(action: Action): boolean {
    if (!this.latched.has(action)) return false;
    this.latched.delete(action);
    return this.gameplayEnabled || action === 'pause';
  }

  /** Like consume(), but works while gameplay input is disabled (for closing menus). */
  consumeRaw(action: Action): boolean {
    if (!this.latched.has(action)) return false;
    this.latched.delete(action);
    return true;
  }

  /** Drop any latched presses (e.g. when closing a menu, so Esc doesn't re-open it). */
  flush(): void {
    this.latched.clear();
    this.wheelDelta = 0;
  }

  reset(): void {
    this.down.clear();
    this.flush();
  }
}
