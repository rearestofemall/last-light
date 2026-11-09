import type { GameEventBus } from '../core/events';
import { ConfirmDialog } from './ConfirmDialog';
import { ControlsPanel } from './ControlsPanel';
import { HUD } from './HUD';
import { LoadingScreen } from './LoadingScreen';
import { MainMenu } from './MainMenu';
import { NoteReader } from './NoteReader';
import { PauseMenu } from './PauseMenu';
import { SettingsPanel } from './SettingsPanel';
import type { GameApi, Projector } from './types';
import './styles.css';

/** Composes every screen and routes "back" (Esc) to whatever is on top. */
export class UIManager {
  readonly loading: LoadingScreen;
  readonly menu: MainMenu;
  readonly pause: PauseMenu;
  readonly settings: SettingsPanel;
  readonly controls: ControlsPanel;
  readonly reader: NoteReader;
  readonly hud: HUD;
  readonly confirm: ConfirmDialog;

  constructor(
    readonly root: HTMLElement,
    events: GameEventBus,
    api: GameApi,
  ) {
    const actions = {
      openSettings: () => this.settings.open(),
      openControls: () => this.controls.open(),
      confirm: (t: string, b: string, ok: string) => this.confirm.ask(t, b, ok),
    };
    this.hud = new HUD(root, events);
    this.menu = new MainMenu(root, events, api, actions);
    this.pause = new PauseMenu(root, events, api, actions);
    this.reader = new NoteReader(root, events);
    this.settings = new SettingsPanel(root, events, api.settings);
    this.controls = new ControlsPanel(root, events);
    this.confirm = new ConfirmDialog(root, events);
    this.loading = new LoadingScreen(root);
    events.on('note:open', (n) => this.reader.open(n.title, n.body, n.kind));
  }

  /** True when a modal that blocks gameplay is open (reader, settings, dialogs). */
  get modalOpen(): boolean {
    return this.reader.visible || this.settings.visible || this.controls.visible || this.confirm.open;
  }

  /** Close the top-most closable layer. Returns false if nothing was open. */
  back(): boolean {
    if (this.confirm.open) {
      this.confirm.cancel();
      return true;
    }
    if (this.settings.visible) {
      this.settings.close();
      return true;
    }
    if (this.controls.visible) {
      this.controls.close();
      return true;
    }
    if (this.reader.visible) {
      this.reader.close();
      return true;
    }
    return false;
  }

  update(dt: number, project: Projector, fps: number | null): void {
    this.hud.update(dt, project, fps);
  }
}
