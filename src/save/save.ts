/**
 * Save / load with localStorage. Three manual slots + autosave.
 */
import { G, setGame, type GameState } from '../sim/state';

const KEY = 'phone-bazaar-save-';
export const SLOTS = ['auto', '1', '2', '3'];

export interface SlotInfo {
  slot: string;
  exists: boolean;
  label: string;
}

export function saveGame(slot: string): boolean {
  try {
    const g = G();
    const data = JSON.stringify(g);
    localStorage.setItem(KEY + slot, data);
    localStorage.setItem(KEY + slot + '-meta', JSON.stringify({ shop: g.shopName, mode: g.mode, day: g.day, cash: g.cash, stage: g.stage, saved: Date.now() }));
    return true;
  } catch (e) {
    console.error('Save failed', e);
    return false;
  }
}

export function loadGame(slot: string): boolean {
  try {
    const raw = localStorage.getItem(KEY + slot);
    if (!raw) return false;
    const g = JSON.parse(raw) as GameState;
    // forward-compat defaults
    g.regulars ??= [];
    g.onlineRequests ??= [];
    g.scrap ??= 0;
    g.policy ??= { autoAssign: false, grade: 'aftermarket', warrantyDays: 30 };
    g.speed = 0;
    setGame(g);
    return true;
  } catch (e) {
    console.error('Load failed', e);
    return false;
  }
}

export function slotInfo(slot: string): SlotInfo {
  try {
    const meta = localStorage.getItem(KEY + slot + '-meta');
    if (!meta) return { slot, exists: false, label: 'Empty' };
    const m = JSON.parse(meta);
    const when = new Date(m.saved).toLocaleString();
    return { slot, exists: true, label: `${m.shop} · ${m.mode} · Day ${m.day} · Rs ${Math.round(m.cash).toLocaleString()} · ${when}` };
  } catch {
    return { slot, exists: false, label: 'Empty' };
  }
}

export function deleteSave(slot: string) {
  try {
    localStorage.removeItem(KEY + slot);
    localStorage.removeItem(KEY + slot + '-meta');
  } catch {
    /* storage unavailable */
  }
}
