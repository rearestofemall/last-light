import { Game } from './core/Game';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  if (!webglAvailable()) {
    ui.innerHTML = '<div class="screen loading is-visible is-error"><div class="loading__title">THE LAST LIGHT</div><div class="loading__status">This game needs WebGL. Please enable hardware acceleration or try a different browser.</div></div>';
    return;
  }
  const game = new Game(canvas, ui);
  (window as unknown as { game?: Game }).game = game;
  try {
    await game.init();
  } catch (e) {
    console.error(e);
    game.loading.error(`Something went wrong while starting the game: ${e instanceof Error ? e.message : String(e)}`);
  }
}

void boot();
