import * as THREE from 'three';
import type { Settings } from '../core/Settings';

/** Owns the WebGL renderer and scene; applies quality settings. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private onResize: (() => void)[] = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    private settings: Settings,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = true;
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applySettings(): void {
    const s = this.settings.get();
    const prof = this.settings.profile;
    const pr = Math.min(window.devicePixelRatio || 1, prof.maxPixelRatio) * s.renderScale;
    this.renderer.setPixelRatio(Math.max(0.5, pr));
    const shadows = s.shadows;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      // Materials must recompile when shadow support toggles.
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
      });
    }
    this.resize();
  }

  get width(): number {
    return this.canvas.clientWidth || window.innerWidth;
  }
  get height(): number {
    return this.canvas.clientHeight || window.innerHeight;
  }
  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }
  get pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  addResizeListener(fn: () => void): void {
    this.onResize.push(fn);
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    for (const fn of this.onResize) fn();
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }
}
