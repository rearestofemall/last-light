/**
 * Microsoldering: a microscope view of the logic board.
 * Hot air (temperature + airflow) heats chips with spreading heat; Kapton
 * shields neighbours; tweezers lift melted chips (or rip pads if not
 * melted); place + reflow new chips; iron fits jumper wires; multimeter
 * probes test points vs the reference database; thermal camera shows
 * shorted parts.
 */
import { CONFIG } from '../CONFIG';
import { faultById } from '../data/faults';
import { layoutById } from '../data/layouts';
import { CHIP_PARTS } from '../data/parts';
import { phoneById } from '../data/phones';
import type { ChipDef } from '../data/types';
import { advanceMinutes } from '../sim/clock';
import { hasTool, toolTier } from '../sim/economy';
import { chance, clamp, hash01, rand } from '../sim/rng';
import { G, notify, type ComponentInst, type PhoneInst } from '../sim/state';
import { btn, h } from '../ui/dom';
import { diodeReading, microscopeFindings, referenceValue, thermalScan } from './diagnostics';

type MicroTool = 'hotair' | 'tweezers' | 'place' | 'iron' | 'kapton' | 'flux' | 'probe';

const TOOL_INFO: { id: MicroTool; label: string; hint: string }[] = [
  { id: 'hotair', label: '🌬 Hot air', hint: 'Hold the mouse on the board to heat. Watch neighbours!' },
  { id: 'tweezers', label: '🥢 Tweezers', hint: 'Lift a chip once its solder is molten.' },
  { id: 'place', label: '📌 Place chip', hint: 'Place a new chip from stock on an empty footprint.' },
  { id: 'iron', label: '🔥 Iron / jumper', hint: 'Bridge a ripped pad or torn trace with jumper wire.' },
  { id: 'kapton', label: '🟧 Kapton', hint: 'Tape neighbouring parts to shield them from heat.' },
  { id: 'flux', label: '💧 Flux', hint: 'Flux before reflowing. Prevents cold joints.' },
  { id: 'probe', label: '📟 Multimeter', hint: 'Click a gold test point: diode-mode reading.' },
];

export class MicroView {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  phone: PhoneInst;
  board: ComponentInst;
  chips: ChipDef[];
  temps: Record<string, number> = {};
  over: Record<string, number> = {};
  taped = new Set<string>();
  fluxed = new Set<string>();
  tool: MicroTool = 'probe';
  temp = 350;
  air = 5;
  mouse = { x: 50, y: 50, down: false, inside: false };
  thermal = false;
  hotSeconds = 0;
  jitter = 0;
  readings: { tp: string; value: string; ref: number }[] = [];
  running = true;
  log: (s: string) => void;
  onClose: () => void;
  info: HTMLElement;
  soldering: boolean;

  constructor(phone: PhoneInst, board: ComponentInst, soldering: boolean, log: (s: string) => void, onClose: () => void) {
    this.phone = phone;
    this.board = board;
    this.soldering = soldering;
    this.log = log;
    this.onClose = onClose;
    const model = phoneById(phone.modelId);
    this.chips = layoutById(model.layout).chips;
    for (const c of this.chips) this.temps[c.id] = CONFIG.micro.ambient;
    this.canvas = h('canvas', { class: 'micro-canvas', width: 900, height: 900 }) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.info = h('div', { class: 'micro-info' });
    this.root = h('div', { class: 'micro' }, this.toolbar(), h('div', { class: 'micro-main' }, h('div', { class: 'micro-stage' }, this.canvas), this.info));
    const scope = toolTier('microscope');
    this.canvas.style.filter = scope >= 2 ? 'none' : scope === 1 ? 'blur(0.8px)' : 'blur(2px)';
    this.bind();
    this.renderInfo();
    requestAnimationFrame((t) => this.loop(t, t));
  }

  private toolbar() {
    const g = G();
    const tools = h('div', { class: 'micro-tools', role: 'toolbar' },
      TOOL_INFO.map((t) => {
        const need = this.toolNeed(t.id);
        return h('button', {
          class: `tool-btn ${this.tool === t.id ? 'active' : ''}`,
          title: need ?? t.hint,
          disabled: !!need,
          onclick: () => { this.tool = t.id; this.root.querySelector('.micro-tools')!.replaceWith(this.toolbar()); this.renderInfo(); },
        }, t.label);
      }),
    );
    const temp = h('input', { type: 'range', min: 100, max: 480, value: this.temp, oninput: (e: Event) => { this.temp = +(e.target as HTMLInputElement).value; tl.textContent = `${this.temp}°C`; } });
    const tl = h('span', { class: 'mono' }, `${this.temp}°C`);
    const air = h('input', { type: 'range', min: 1, max: 10, value: this.air, oninput: (e: Event) => { this.air = +(e.target as HTMLInputElement).value; al.textContent = `airflow ${this.air}`; } });
    const al = h('span', { class: 'mono' }, `airflow ${this.air}`);
    return h('div', { class: 'micro-bar' }, tools,
      h('div', { class: 'micro-settings' },
        h('label', null, 'Hot air ', temp, ' ', tl), h('label', null, ' ', air, ' ', al),
        btn(this.thermal ? '🌡 Thermal ON' : '🌡 Thermal camera', () => this.toggleThermal(), this.thermal ? 'active' : '', !hasTool('thermal'), hasTool('thermal') ? 'Inject 1V and look for hot spots' : 'Needs a thermal camera (research Advanced diagnostics)'),
        btn('🔎 Inspect', () => this.inspect(), '', false, 'Look for corrosion and burn marks'),
        btn('🫧 Ultrasonic clean', () => this.ultrasonic(), '', !this.soldering || !hasTool('ultrasonic') || !(g.research.done.includes('water-damage') || g.mode === 'freeplay'), 'Needs the board out of the phone, an ultrasonic cleaner and research'),
        btn('Close microscope', () => this.close(), 'primary'),
      ));
  }

  private toolNeed(t: MicroTool): string | null {
    const g = G();
    const researched = g.research.done.includes('microsoldering') || g.mode === 'freeplay';
    if (t === 'probe') return hasTool('multimeter') ? null : 'Needs a multimeter (Equipment)';
    if (!this.soldering) return 'Remove the board from the phone to solder on it';
    if (!researched) return 'Research Microsoldering first';
    if (t === 'hotair') return hasTool('hotair') ? null : 'Needs a hot air station';
    if (t === 'iron') return hasTool('iron') ? null : 'Needs a soldering station';
    return null;
  }

  private bind() {
    const pos = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
    };
    this.canvas.addEventListener('pointermove', (e) => Object.assign(this.mouse, pos(e), { inside: true }));
    this.canvas.addEventListener('pointerleave', () => { this.mouse.inside = false; this.mouse.down = false; });
    this.canvas.addEventListener('pointerdown', (e) => {
      Object.assign(this.mouse, pos(e), { down: true });
      if (this.tool !== 'hotair') this.click();
    });
    window.addEventListener('pointerup', () => (this.mouse.down = false));
  }

  private chipAt(x: number, y: number) {
    return this.chips.find((c) => Math.abs(x - c.pos[0]) <= c.size[0] / 2 + 1 && Math.abs(y - c.pos[1]) <= c.size[1] / 2 + 1);
  }

  private click() {
    const g = G();
    const { x, y } = this.mouse;
    const model = phoneById(this.phone.modelId);
    if (this.tool === 'probe') {
      const tp = layoutById(model.layout).testPoints.find((t) => Math.hypot(t.pos[0] - x, t.pos[1] - y) < 3);
      if (!tp) return;
      const v = diodeReading(this.phone, this.board, tp.id);
      const ref = referenceValue(model.id, tp.id);
      this.readings.unshift({ tp: tp.name, value: v, ref });
      this.readings = this.readings.slice(0, 8);
      this.log(`Diode mode ${tp.name}: ${v} (ref ${ref.toFixed(3)})`);
      advanceMinutes(1);
      this.renderInfo();
      return;
    }
    const chip = this.chipAt(x, y);
    if (!chip) return;
    const inst = this.board.chips![chip.id];
    if (this.tool === 'kapton') {
      if (this.taped.has(chip.id)) this.taped.delete(chip.id);
      else {
        if ((g.consumables.kapton ?? 0) <= 0) return notify('Out of Kapton tape.', 'bad');
        g.consumables.kapton--;
        this.taped.add(chip.id);
      }
    } else if (this.tool === 'flux') {
      if ((g.consumables.flux ?? 0) <= 0) return notify('Out of flux.', 'bad');
      if (chance(0.35)) g.consumables.flux--;
      this.fluxed.add(chip.id);
    } else if (this.tool === 'tweezers') {
      if (inst.removed) return;
      const melted = this.temps[chip.id] >= CONFIG.micro.meltLeadFree;
      if (!melted && chip.type !== 'cap_vbus' && chip.type !== 'cap_main' && chip.type !== 'cap_bl') {
        if (chance(CONFIG.micro.pullUnmeltedPadRipChance)) {
          (inst as any).ripped = true;
          notify(`Ripped pads! ${chip.name} was pulled before the solder melted.`, 'bad');
          G().bench.mistakes.push(`Ripped pads under ${chip.name}`);
        } else return notify('The chip will not budge: solder is not molten yet.', 'warn');
      } else if (!melted) {
        // small caps come off with a bit of force
        if (chance(0.3)) {
          (inst as any).ripped = true;
          G().bench.mistakes.push(`Ripped pad pulling cold ${chip.name}`);
          notify('Tore a tiny pad pulling the cold capacitor.', 'bad');
        }
      }
      inst.removed = true;
      inst.unsoldered = false;
      (inst as any).coldJoint = false;
      inst.faults = inst.faults.filter((f) => !['chipReplace', 'chipRemove'].includes(faultById(f).fix));
      inst.burned = false;
      advanceMinutes(2);
      this.log(`Removed ${chip.name}.`);
    } else if (this.tool === 'place') {
      if (!inst.removed) return notify('There is still a chip on that footprint.', 'warn');
      if (chip.type.startsWith('cap_') && !G().chips[chip.type]) {
        // caps are optional; placing one needs stock
      }
      const stock = g.chips[chip.type] ?? 0;
      if (stock <= 0) return notify(`No ${CHIP_PARTS.find((c) => c.type === chip.type)?.name ?? chip.type} in stock (Inventory → Chips).`, 'bad');
      const def = CHIP_PARTS.find((c) => c.type === chip.type);
      if (def?.needsReball) {
        if (!g.research.done.includes('reballing') && g.mode !== 'freeplay') return notify('This BGA chip needs reballing: research BGA reballing.', 'bad');
        if ((g.consumables.solderBalls ?? 0) <= 0) return notify('Out of solder balls / stencils.', 'bad');
        g.consumables.solderBalls--;
      }
      g.chips[chip.type] = stock - 1;
      inst.removed = false;
      inst.unsoldered = true;
      inst.faults = [];
      advanceMinutes(2);
      this.log(`Placed new ${chip.name}. Reflow it with hot air.`);
    } else if (this.tool === 'iron') {
      const jumperFault = inst.faults.find((f) => faultById(f).fix === 'jumper');
      if (!(inst as any).ripped && !jumperFault) return notify('Nothing to jumper here.', 'info');
      if ((g.consumables.jumper ?? 0) <= 0) return notify('Out of jumper wire.', 'bad');
      g.consumables.jumper--;
      advanceMinutes(8);
      const p = clamp(0.5 + toolTier('iron') * 0.15 + g.playerSkill / 400, 0.3, 0.97);
      if (chance(p)) {
        (inst as any).ripped = false;
        inst.faults = inst.faults.filter((f) => faultById(f).fix !== 'jumper');
        this.board.jumpers = (this.board.jumpers ?? 0) + 1;
        this.log(`Jumper wire fitted at ${chip.name}.`);
        notify('Jumper fitted. Neat work!', 'good');
      } else {
        notify('The jumper wire lifted. Try again.', 'warn');
      }
    }
    this.renderInfo();
  }

  private toggleThermal() {
    this.thermal = !this.thermal;
    if (this.thermal) {
      advanceMinutes(CONFIG.diag.thermalMinutes);
      const hot = thermalScan(this.board, this.phone.modelId).filter((h) => h.heat > 0.5);
      this.log(`Thermal camera: ${hot.length ? hot.map((h) => this.chips.find((c) => c.id === h.chip)?.name).join(', ') + ' heating up' : 'no hot spots'}.`);
    }
    this.root.querySelector('.micro-bar')!.replaceWith(this.toolbar());
  }

  private inspect() {
    advanceMinutes(3);
    const f = microscopeFindings(this.board, this.phone.modelId);
    f.forEach((x) => this.log(`Microscope: ${x}`));
    notify(f[0], 'info');
    this.renderInfo(f);
  }

  private ultrasonic() {
    const g = G();
    if ((g.consumables.ipa ?? 0) <= 0) return notify('Need isopropyl alcohol for the bath.', 'bad');
    g.consumables.ipa--;
    advanceMinutes(CONFIG.repair.minutes.clean);
    const severe = (this.board.corrosion ?? 0) > 0.8;
    this.board.corrosion = 0;
    this.board.faults = this.board.faults.filter((f) => f !== 'f_water');
    this.log('Ultrasonic bath: corrosion removed.');
    if (severe && chance(0.5)) {
      const victim = this.chips.filter((c) => ['audioIC', 'chargeIC', 'backlight', 'wifi'].includes(c.type));
      const c = victim[Math.floor(Math.random() * victim.length)];
      const vf: Record<string, string> = { audioIC: 'f_audio_ic', chargeIC: 'f_charge_ic', backlight: 'f_backlight_ic', wifi: 'f_wifi' };
      this.board.chips![c.id].faults.push(vf[c.type]);
      notify(`Clean board... but ${c.name} was eaten away by corrosion underneath.`, 'warn');
    } else notify('Board is spotless.', 'good');
    this.renderInfo();
  }

  private renderInfo(findings?: string[]) {
    const g = G();
    const model = phoneById(this.phone.modelId);
    const tps = layoutById(model.layout).testPoints;
    const hover = this.mouse.inside ? this.chipAt(this.mouse.x, this.mouse.y) : undefined;
    this.info.replaceChildren(...([
      h('h3', null, `${model.name} logic board`),
      h('p', { class: 'muted small' }, TOOL_INFO.find((t) => t.id === this.tool)?.hint ?? ''),
      !this.soldering ? h('p', { class: 'warn small' }, 'Board is in the phone: probing only. Remove it to solder.') : null,
      h('div', { class: 'stock small' },
        `Flux ${g.consumables.flux ?? 0} · Kapton ${g.consumables.kapton ?? 0} · Jumper ${g.consumables.jumper ?? 0} · Solder balls ${g.consumables.solderBalls ?? 0}`),
      hover ? h('div', { class: 'hover-card' }, h('b', null, hover.name), h('div', { class: 'mono' }, `${Math.round(this.temps[hover.id])}°C`), this.chipStatus(hover)) : null,
      h('h4', null, 'Multimeter readings'),
      this.readings.length
        ? h('table', { class: 'tbl small' }, h('tr', null, h('th', null, 'Line'), h('th', null, 'Read'), h('th', null, 'Ref')),
          this.readings.map((r) => h('tr', { class: r.value === 'OL' || +r.value < 0.05 || Math.abs(+r.value - r.ref) > 0.08 ? 'bad-row' : '' }, h('td', null, r.tp), h('td', { class: 'mono' }, r.value), h('td', { class: 'mono' }, r.ref.toFixed(3)))))
        : h('p', { class: 'muted small' }, 'No readings yet. Select the multimeter and click a gold test point.'),
      h('details', null, h('summary', null, 'Reference database'), h('table', { class: 'tbl small' }, tps.map((t) => h('tr', null, h('td', null, t.name), h('td', { class: 'mono' }, referenceValue(model.id, t.id).toFixed(3)))))),
      findings ? h('div', null, h('h4', null, 'Microscope'), h('ul', { class: 'small' }, findings.map((f) => h('li', null, f)))) : null,
    ].filter(Boolean) as HTMLElement[]));
  }

  private chipStatus(c: ChipDef) {
    const inst = this.board.chips![c.id];
    const tags: string[] = [];
    if (inst.removed) tags.push('removed');
    if (inst.unsoldered) tags.push('placed, not soldered');
    if ((inst as any).coldJoint) tags.push('cold joint');
    if ((inst as any).ripped) tags.push('ripped pads');
    if (inst.burned) tags.push('BURNT');
    if (this.taped.has(c.id)) tags.push('kapton');
    if (this.fluxed.has(c.id)) tags.push('fluxed');
    return h('div', { class: 'small' }, tags.join(' · ') || 'soldered');
  }

  private loop(t: number, last: number) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    this.simulate(dt);
    this.draw();
    if (Math.floor(t / 250) !== Math.floor(last / 250) && this.mouse.inside) this.renderInfo();
    requestAnimationFrame((n) => this.loop(n, t));
  }

  private simulate(dt: number) {
    const g = G();
    const stationTier = toolTier('hotair');
    const jit = stationTier >= 2 ? CONFIG.micro.proStationJitter : CONFIG.micro.cheapStationJitter;
    this.jitter += (rand(-1, 1) * jit - this.jitter) * dt * 2;
    const heating = this.tool === 'hotair' && this.mouse.down && this.mouse.inside && !this.toolNeed('hotair');
    const radius = 2.5 + this.air * 1.1;
    const target = this.temp + this.jitter;
    if (heating) {
      this.hotSeconds += dt;
      if (this.hotSeconds > 10) {
        this.hotSeconds = 0;
        advanceMinutes(3);
      }
    }
    for (const c of this.chips) {
      const inst = this.board.chips![c.id];
      let tmp = this.temps[c.id];
      if (heating) {
        const d = Math.hypot(c.pos[0] - this.mouse.x, c.pos[1] - this.mouse.y);
        const fall = Math.exp(-(d * d) / (2 * radius * radius));
        const shield = this.taped.has(c.id) ? CONFIG.micro.kaptonProtection : 1;
        const mass = 1 / (1 + (c.size[0] * c.size[1]) / 120);
        tmp += (target - tmp) * fall * shield * mass * dt * (1.2 + this.air * 0.12);
      }
      tmp += (CONFIG.micro.ambient - tmp) * (1 - Math.exp(-CONFIG.micro.coolRate * dt * 0.35));
      this.temps[c.id] = tmp;
      // reflow a placed chip
      if (tmp >= CONFIG.micro.meltLeadFree && (inst.unsoldered || (inst as any).coldJoint) && !inst.removed) {
        const flux = this.fluxed.has(c.id);
        inst.unsoldered = false;
        (inst as any).coldJoint = !flux && chance(0.45);
        this.log(`${c.name} reflowed${(inst as any).coldJoint ? ' (no flux: cold joint!)' : ' cleanly'}.`);
        notify((inst as any).coldJoint ? `${c.name}: cold joint. Add flux and reflow again.` : `${c.name} soldered in place.`, (inst as any).coldJoint ? 'warn' : 'good');
      }
      // burn
      if (tmp > CONFIG.micro.burnTemp && !inst.removed) {
        this.over[c.id] = (this.over[c.id] ?? 0) + dt;
        if (this.over[c.id] > CONFIG.micro.burnSeconds && !inst.burned) {
          inst.burned = true;
          g.bench.mistakes.push(`Burnt ${c.name} with hot air`);
          notify(`🔥 ${c.name} overheated and burnt! Use Kapton and lower the temperature.`, 'bad');
        }
      } else this.over[c.id] = Math.max(0, (this.over[c.id] ?? 0) - dt);
    }
  }

  private draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const s = W / 100;
    const model = phoneById(this.phone.modelId);
    ctx.fillStyle = this.board.counterfeit ? '#2b4a2b' : '#14452c';
    ctx.fillRect(0, 0, W, W);
    // traces (deterministic per model)
    ctx.strokeStyle = 'rgba(190,220,160,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      const a = hash01(model.id + i);
      const b = hash01(model.id + i + 'b');
      const c2 = hash01(model.id + i + 'c');
      ctx.beginPath();
      ctx.moveTo(a * W, b * W);
      ctx.lineTo(a * W, c2 * W);
      ctx.lineTo(hash01(model.id + i + 'd') * W, c2 * W);
      ctx.stroke();
    }
    // corrosion
    const cor = this.board.corrosion ?? 0;
    if (cor > 0.05) {
      for (let i = 0; i < 40 * cor; i++) {
        const x = hash01(model.id + 'cor' + i) * W;
        const y = hash01(model.id + 'cor2' + i) * W;
        ctx.fillStyle = `rgba(120,200,140,${0.35 + cor * 0.4})`;
        ctx.beginPath();
        ctx.arc(x, y, 6 + hash01('r' + i) * 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // test points
    for (const tp of layoutById(model.layout).testPoints) {
      ctx.fillStyle = '#e1b84a';
      ctx.beginPath();
      ctx.arc(tp.pos[0] * s, tp.pos[1] * s, 1.6 * s, 0, Math.PI * 2);
      ctx.fill();
      if (this.tool === 'probe') {
        ctx.fillStyle = '#ffe9a8';
        ctx.font = `${1.9 * s}px sans-serif`;
        const right = tp.pos[0] > 60;
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(tp.name, tp.pos[0] * s + (right ? -2.2 : 2.2) * s, tp.pos[1] * s + 0.7 * s);
        ctx.textAlign = 'left';
      }
    }
    // chips
    for (const c of this.chips) {
      const inst = this.board.chips![c.id];
      const x = (c.pos[0] - c.size[0] / 2) * s;
      const y = (c.pos[1] - c.size[1] / 2) * s;
      const w = c.size[0] * s;
      const hh = c.size[1] * s;
      if (inst.removed) {
        ctx.fillStyle = '#b9b19a';
        ctx.fillRect(x, y, w, hh);
        ctx.fillStyle = '#d9cfa8';
        for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) ctx.fillRect(x + (i + 0.3) * (w / 6), y + (j + 0.3) * (hh / 6), w / 16, hh / 16);
        if ((inst as any).ripped) {
          ctx.strokeStyle = '#ff5a3c';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, hh);
        }
      } else {
        const isCap = c.type.startsWith('cap_') || c.type === 'filter_bl';
        ctx.fillStyle = inst.burned ? '#3a2a20' : isCap ? '#a37b45' : c.type.startsWith('conn') ? '#cfcfcf' : '#1d1f22';
        ctx.fillRect(x, y, w, hh);
        if (inst.unsoldered) {
          ctx.strokeStyle = '#ffd45c';
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(x - 2, y - 2, w + 4, hh + 4);
          ctx.setLineDash([]);
        }
        if (!isCap) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = `${Math.min(1.8, c.size[0] / 6) * s}px monospace`;
          ctx.fillText(c.id.toUpperCase(), x + 3, y + hh / 2 + 4);
        }
        if (inst.burned) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.beginPath();
          ctx.arc(x + w / 2, y + hh / 2, Math.max(w, hh), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (this.taped.has(c.id)) {
        ctx.fillStyle = 'rgba(230,140,30,0.55)';
        ctx.fillRect(x - 6, y - 6, w + 12, hh + 12);
      }
      if (this.fluxed.has(c.id)) {
        ctx.fillStyle = 'rgba(240,230,170,0.25)';
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + hh / 2, w * 0.8, hh * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // temperature glow
      const t = this.temps[c.id];
      if (t > 60) {
        const a = clamp((t - 60) / 300, 0, 0.8);
        ctx.fillStyle = t >= CONFIG.micro.meltLeadFree ? `rgba(255,240,120,${a})` : `rgba(255,90,40,${a})`;
        ctx.fillRect(x, y, w, hh);
      }
    }
    // thermal overlay
    if (this.thermal) {
      ctx.fillStyle = 'rgba(20,0,60,0.55)';
      ctx.fillRect(0, 0, W, W);
      for (const hs of thermalScan(this.board, this.phone.modelId)) {
        const c = this.chips.find((x) => x.id === hs.chip)!;
        const grd = ctx.createRadialGradient(c.pos[0] * s, c.pos[1] * s, 2, c.pos[0] * s, c.pos[1] * s, 10 * s * hs.heat + 3 * s);
        grd.addColorStop(0, `rgba(255,255,200,${hs.heat})`);
        grd.addColorStop(0.3, `rgba(255,120,0,${hs.heat * 0.8})`);
        grd.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, W);
      }
    }
    // hot air cursor
    if (this.mouse.inside && this.tool === 'hotair') {
      const r = (2.5 + this.air * 1.1) * s;
      ctx.strokeStyle = this.mouse.down ? 'rgba(255,120,60,0.9)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.mouse.x * s, this.mouse.y * s, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.mouse.x * s, this.mouse.y * s, r * 2, 0, Math.PI * 2);
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  close() {
    this.running = false;
    this.onClose();
  }
}
