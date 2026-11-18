import type { BrandDef } from './types';

/** Parody brands. Premium brands pair parts to the board. */
export const BRANDS: BrandDef[] = [
  { id: 'pear', name: 'Pear', tier: 'premium', retention: 1.35, partsAvailability: 0.8, partsPriceLevel: 1.5, repairability: 4, pairing: ['battery', 'display', 'faceId', 'mainCam'], color: '#d8d8de' },
  { id: 'samsang', name: 'Samsang', tier: 'premium', retention: 1.0, partsAvailability: 0.9, partsPriceLevel: 1.25, repairability: 5, pairing: ['fingerprint'], color: '#3a5bd9' },
  { id: 'googol', name: 'Googol Pixl', tier: 'premium', retention: 0.9, partsAvailability: 0.55, partsPriceLevel: 1.3, repairability: 5, pairing: ['fingerprint'], color: '#4caf50' },
  { id: 'xiaomo', name: 'Xiaomo', tier: 'mid', retention: 0.85, partsAvailability: 0.95, partsPriceLevel: 0.85, repairability: 6, pairing: [], color: '#ff7a1a' },
  { id: 'oppa', name: 'Oppa', tier: 'mid', retention: 0.8, partsAvailability: 0.85, partsPriceLevel: 0.9, repairability: 6, pairing: [], color: '#1f9e6e' },
  { id: 'vivoh', name: 'Vivoh', tier: 'mid', retention: 0.8, partsAvailability: 0.85, partsPriceLevel: 0.9, repairability: 6, pairing: [], color: '#3b6fe0' },
  { id: 'realmi', name: 'Realmi', tier: 'budget', retention: 0.75, partsAvailability: 0.9, partsPriceLevel: 0.75, repairability: 7, pairing: [], color: '#f2c200' },
  { id: 'nokla', name: 'Nokla', tier: 'budget', retention: 0.7, partsAvailability: 0.6, partsPriceLevel: 0.8, repairability: 8, pairing: [], color: '#1d4fa3' },
  { id: 'tecnoh', name: 'Tecnoh', tier: 'budget', retention: 0.6, partsAvailability: 0.9, partsPriceLevel: 0.6, repairability: 7, pairing: [], color: '#2aa3d8' },
  { id: 'infinex', name: 'Infinex', tier: 'budget', retention: 0.6, partsAvailability: 0.9, partsPriceLevel: 0.6, repairability: 7, pairing: [], color: '#7a3cc7' },
  { id: 'itell', name: 'iTell', tier: 'budget', retention: 0.55, partsAvailability: 0.85, partsPriceLevel: 0.55, repairability: 8, pairing: [], color: '#d83a3a' },
];

export const brandById = (id: string) => BRANDS.find((b) => b.id === id)!;
