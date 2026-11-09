/**
 * Hand-drawn 24×24 SVG icons for every item. Stroke-based, coloured per item so the
 * inventory reads at a glance without relying on text.
 */
const S = (body: string, color: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICON: Record<string, string> = {
  wood: S('<rect x="3" y="9" width="15" height="6" rx="3"/><ellipse cx="18" cy="12" rx="2.5" ry="3"/><path d="M18 11v2M6 9v6M10 9.5v5"/>', '#c79a64'),
  stone: S('<path d="M5 16l2-6 5-3 5 2 2 6-3 3H8z"/><path d="M9 12l3-1 2 2" opacity=".6"/>', '#a8a39a'),
  fiber: S('<path d="M6 20c2-6 2-11 1-16M11 20c0-6 1-11 3-16M16 20c-1-5 0-9 3-13"/><path d="M5 14c3 1 9 1 14-1" opacity=".7"/>', '#a3b56b'),
  metal: S('<path d="M4 15l5-8h7l4 6-4 5H8z"/><circle cx="12" cy="12.5" r="2"/><path d="M15 8l-1 3"/>', '#9aa4ad'),
  cloth: S('<path d="M5 6h14l-2 5 2 7H5l2-7z"/><path d="M8 9h8M7 14h10" opacity=".6"/>', '#c9b49a'),
  hide: S('<path d="M7 4c-2 3-4 4-3 7 1 2 2 2 2 4 0 3-1 4 1 5h10c2-1 1-2 1-5 0-2 1-2 2-4 1-3-1-4-3-7-2 1-3 2-5 2S9 5 7 4z"/>', '#b07a52'),
  fuel: S('<path d="M7 7h8l3 3v10H7z"/><path d="M15 7V4h-4v3M10 13c0-1.5 2-3 2-3s2 1.5 2 3a2 2 0 0 1-4 0z"/>', '#d4a43c'),
  herbs: S('<path d="M12 21V9M12 13c-3 0-5-2-6-5 3 0 5 1 6 4M12 11c2-3 4-4 7-4-1 3-3 5-7 5M12 17c-2-1-4-1-5 0"/><circle cx="12" cy="6" r="2"/>', '#8fc07a'),
  rope: S('<ellipse cx="12" cy="12" rx="7" ry="5"/><ellipse cx="12" cy="12" rx="4" ry="2.6"/><path d="M19 13c1 3 0 5-2 7"/>', '#c8ac74'),
  berries: S('<circle cx="9" cy="14" r="3"/><circle cx="15" cy="15" r="3"/><circle cx="12" cy="9" r="3"/><path d="M12 6V3l3-1"/>', '#d0465c'),
  raw_meat: S('<path d="M5 13c0-4 4-7 8-7s6 3 6 6-3 6-7 6c-3 0-4 2-6 2s-2-2-1-4"/><circle cx="14" cy="12" r="1.6"/>', '#d4706a'),
  cooked_meat: S('<path d="M5 13c0-4 4-7 8-7s6 3 6 6-3 6-7 6c-3 0-4 2-6 2s-2-2-1-4"/><path d="M10 10l5 5M12 9l4 4" opacity=".7"/>', '#b8743e'),
  canned_food: S('<ellipse cx="12" cy="6" rx="6" ry="2"/><path d="M6 6v12c0 1 3 2 6 2s6-1 6-2V6"/><path d="M6 11h12M6 15h12" opacity=".6"/>', '#c4a05a'),
  water_dirty: S('<path d="M9 3h6v3l2 3v11H7V9l2-3z"/><path d="M8 13c2-1 6 1 8 0" /><circle cx="11" cy="16" r=".8"/>', '#8a9a6a'),
  water_clean: S('<path d="M9 3h6v3l2 3v11H7V9l2-3z"/><path d="M8 13c2-1 6 1 8 0"/>', '#6fb1d6'),
  bottle: S('<path d="M9 3h6v3l2 3v11H7V9l2-3z"/>', '#9db7c4'),
  bandage: S('<rect x="4" y="8" width="16" height="8" rx="4" transform="rotate(-30 12 12)"/><path d="M11 10v4M13 10v4" transform="rotate(-30 12 12)"/>', '#e6dccb'),
  remedy: S('<path d="M8 4h8M9 4v4l-4 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-4-9V4"/><path d="M7 15h10"/>', '#7cc59a'),
  knife: S('<path d="M4 20l6-6M10 14l9-10c1 4-1 9-6 12z"/>', '#b8c0c6'),
  axe: S('<path d="M5 20L16 9"/><path d="M13 5c3-1 6 1 6 5l-4 1-3-3z"/>', '#c9a26e'),
  pickaxe: S('<path d="M7 20l9-11"/><path d="M5 9c4-5 10-6 14-3M12 6l6 6"/>', '#a3adb6'),
  torch: S('<path d="M10 21l2-9 2 9z"/><path d="M12 11c-2-1-3-3-2-5 0 1 1 1.5 2 1.5 0-2 1-3 2-4 0 2 2 3 1 5-.5 1.5-1.5 2.5-3 2.5z"/>', '#f0a24a'),
  lantern: S('<path d="M9 5h6M12 3v2M8 7h8l-1 11H9z"/><path d="M8 18h8"/><path d="M12 10c-1 1-1.5 2-1 3s2 1 2 0-.5-2-1-3z"/>', '#f2c470'),
  parka: S('<path d="M8 4l4 2 4-2 4 4-2 3-2-1v11H8V10l-2 1-2-3z"/><path d="M12 6v14" opacity=".6"/>', '#a98a66'),
  campfire: S('<path d="M5 19l14-4M5 15l14 4"/><path d="M12 14c-3-1-4-4-2-7 0 2 1 2 2 2 0-2 1-4 3-5-1 3 2 4 1 7-.5 2-2 3-4 3z"/>', '#f08c3c'),
  floor: S('<path d="M3 15l9-4 9 4-9 4z"/><path d="M7.5 13l9 4M10.5 11.7l9 4" opacity=".6"/>', '#c79a64'),
  wall: S('<rect x="5" y="4" width="14" height="16"/><path d="M5 8h14M5 12h14M5 16h14" opacity=".6"/>', '#c79a64'),
  door: S('<rect x="6" y="3" width="12" height="18"/><circle cx="15" cy="12" r="1"/>', '#c79a64'),
  backwall: S('<rect x="4" y="6" width="16" height="12"/><path d="M4 10h16M4 14h16" opacity=".6"/>', '#b88d5c'),
  window: S('<rect x="4" y="5" width="16" height="14"/><rect x="8" y="8" width="8" height="7"/><path d="M12 8v7"/>', '#b88d5c'),
  roof: S('<path d="M3 13l9-7 9 7"/><path d="M6 11v7h12v-7"/>', '#a88070'),
  chest: S('<rect x="4" y="9" width="16" height="10" rx="1"/><path d="M4 9c0-3 2-4 8-4s8 1 8 4M4 13h16"/><rect x="11" y="12" width="2" height="3"/>', '#c79a64'),
  bedroll: S('<rect x="3" y="11" width="18" height="6" rx="3"/><circle cx="6" cy="14" r="2"/>', '#8fa06a'),
  bed: S('<path d="M3 18V8M3 14h18v4M21 14v-3H8v3"/><rect x="4" y="11" width="4" height="3" rx="1"/>', '#b06a5a'),
  table: S('<path d="M3 9h18M6 9v11M18 9v11M3 9l2-3h14l2 3"/>', '#c79a64'),
  workbench: S('<path d="M3 11h18M5 11v9M19 11v9M5 16h14"/><path d="M14 6h5v5M16 6V4"/>', '#c9a26e'),
  lamp: S('<path d="M6 21V5h8M14 5v3"/><path d="M12 8h4l-1 6h-2z"/>', '#f2c470'),
};

const FALLBACK = S('<circle cx="12" cy="12" r="7"/>', '#bbb');

export function itemIcon(id: string): string {
  return ICON[id] ?? FALLBACK;
}

/** Small UI glyphs for vitals. */
export const VITAL_ICONS: Record<string, string> = {
  health: S('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>', 'currentColor'),
  hunger: S('<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 21V3c-2 1-3 4-3 8h3"/>', 'currentColor'),
  thirst: S('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>', 'currentColor'),
  warmth: S('<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>', 'currentColor'),
  stamina: S('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>', 'currentColor'),
  energy: S('<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>', 'currentColor'),
};
