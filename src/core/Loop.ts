export interface LoopCallbacks {
  /** Fixed-timestep simulation step. */
  update(dt: number): void;
  /** Variable-rate render. `alpha` is the interpolation factor between the last two sim states. */
  render(alpha: number, frameDt: number): void;
}

/** Fixed-timestep game loop with bounded catch-up and render interpolation. */
export class Loop {
  readonly step = 1 / 60;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  /** Smoothed frames-per-second, for the optional FPS readout. */
  fps = 60;

  constructor(private cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      let frameDt = (now - this.last) / 1000;
      this.last = now;
      if (frameDt > 0.25) frameDt = 0.25; // tab switch / breakpoint guard
      if (frameDt > 0) this.fps += (1 / frameDt - this.fps) * 0.05;
      this.acc += frameDt;
      let steps = 0;
      while (this.acc >= this.step && steps < 5) {
        this.cb.update(this.step);
        this.acc -= this.step;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      this.cb.render(this.acc / this.step, frameDt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
