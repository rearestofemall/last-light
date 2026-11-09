export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'sprint'
  | 'interact'
  | 'alt'
  | 'use'
  | 'pause'
  | 'inventory'
  | 'craft'
  | 'build'
  | 'map'
  | 'journal'
  | 'remove'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'click'
  | 'rclick';

const BINDINGS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  alt: ['KeyR'],
  use: ['KeyF'],
  pause: ['Escape', 'KeyP'],
  inventory: ['Tab', 'KeyI'],
  craft: ['KeyC'],
  build: ['KeyB'],
  map: ['KeyM'],
  journal: ['KeyJ'],
  remove: ['KeyX'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  slot6: ['Digit6'],
  click: ['Mouse0'],
  rclick: ['Mouse2'],
};

/** Actions that still latch while gameplay input is disabled (menus need them). */
const MENU_ACTIONS = new Set<Action>(['pause', 'inventory', 'craft', 'map', 'journal', 'build']);

/**
 * Keyboard + mouse input with action mapping.
 * `held` is level-triggered; presses are latched until consumed so that a press
 * between two fixed simulation steps is never lost.
 */
export class Input {
  private down = new Set<string>();
  private latched = new Set<Action>();
  private codeToAction = new Map<string, Action>();
  /** When false, gameplay actions are ignored (menus open). */
  gameplayEnabled = true;
  wheelDelta = 0;
  /** Pointer position in CSS pixels, relative to the viewport. */
  mouseX = 0;
  mouseY = 0;
  /** True when the pointer is over the game canvas (not a UI element). */
  pointerOnCanvas = false;

  constructor(target: Window = window) {
    for (const [action, codes] of Object.entries(BINDINGS) as [Action, string[]][]) {
      for (const c of codes) this.codeToAction.set(c, action);
    }
    target.addEventListener('keydown', (e) => this.onKey(e, true));
    target.addEventListener('keyup', (e) => this.onKey(e, false));
    target.addEventListener('blur', () => this.reset());
    target.addEventListener('wheel', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'CANVAS') this.wheelDelta += Math.sign(e.deltaY);
    }, { passive: true });
    target.addEventListener('pointermove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.pointerOnCanvas = (e.target as HTMLElement)?.tagName === 'CANVAS';
    });
    target.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;
      this.press(`Mouse${e.button}`);
    });
    target.addEventListener('pointerup', (e) => this.down.delete(`Mouse${e.button}`));
    target.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'CANVAS') e.preventDefault();
    });
  }

  private press(code: string): void {
    const action = this.codeToAction.get(code);
    if (!this.down.has(code) && action) this.latched.add(action);
    this.down.add(code);
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const action = this.codeToAction.get(e.code);
    if (action && (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab')) e.preventDefault();
    if (isDown) this.press(e.code);
    else this.down.delete(e.code);
  }

  held(action: Action): boolean {
    if (!this.gameplayEnabled) return false;
    for (const c of BINDINGS[action]) if (this.down.has(c)) return true;
    return false;
  }

  /** Returns true once per physical press (only while gameplay input is enabled). */
  consume(action: Action): boolean {
    if (!this.latched.has(action)) return false;
    this.latched.delete(action);
    return this.gameplayEnabled;
  }

  /** Like consume(), but works while gameplay input is disabled (menus). */
  consumeRaw(action: Action): boolean {
    if (!this.latched.has(action)) return false;
    this.latched.delete(action);
    return true;
  }

  /** Discard latched presses for gameplay actions while a menu is open. */
  dropGameplayLatches(): void {
    for (const a of [...this.latched]) if (!MENU_ACTIONS.has(a)) this.latched.delete(a);
  }

  flush(): void {
    this.latched.clear();
    this.wheelDelta = 0;
  }

  reset(): void {
    this.down.clear();
    this.flush();
  }
}

export const KEY_LABEL: Partial<Record<Action, string>> = {
  interact: 'E',
  alt: 'R',
  use: 'F',
  inventory: 'Tab',
  craft: 'C',
  build: 'B',
  map: 'M',
  journal: 'J',
  remove: 'X',
};
