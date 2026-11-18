import { flameBands, qualityTiers, type QualityTier } from '../visuals.config';

export type FlameState = 'INACTIVE' | 'ACTIVE_UNTRACKED' | 'ACTIVE_TRACKED' | 'AT_RISK' | 'FROZEN' | 'BROKEN' | 'SETTLING';
export type FlameMotionMode = 'FULL' | 'REDUCED' | 'OFF';

const colors = {
  active: ['#fb923c', '#f97316', '#fef3c7'],
  inactive: ['#94a3b8', '#cbd5e1', '#f1f5f9'],
  risk: ['#9a765f', '#b7a18e', '#e7d8c9'],
  frozen: ['#67e8f9', '#38bdf8', '#eff6ff'],
  broken: ['#94a3b8', '#cbd5e1', '#f8fafc'],
} as const;

export function flameBandFor(length: number) {
  const safeLength = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
  return [...flameBands].reverse().find((band) => safeLength >= band.min) ?? null;
}

export function flameSpec({ length, state, quality = 'HIGH', mode = 'FULL' }: {
  length: number; state: FlameState; quality?: QualityTier; mode?: FlameMotionMode;
}) {
  const band = flameBandFor(length);
  const ambient = mode === 'FULL' && quality !== 'LOW' && state !== 'INACTIVE' && state !== 'BROKEN';
  const palette = state === 'FROZEN' ? colors.frozen : state === 'AT_RISK' ? colors.risk : state === 'BROKEN' ? colors.broken : state === 'INACTIVE' ? colors.inactive : colors.active;
  const count = Math.round((band?.embers ?? 0) * qualityTiers[quality].embersScale);
  const overlay = state === 'FROZEN' ? 'ice' : state === 'BROKEN' ? 'smoke' : null;
  const descriptor = state === 'FROZEN' ? 'protected by a freeze' : state === 'AT_RISK' ? 'at risk today' : state === 'BROKEN' ? 'ended' : state === 'ACTIVE_TRACKED' ? 'tracked today' : state === 'SETTLING' ? 'finalizing yesterday' : state === 'INACTIVE' ? 'not started' : 'active';
  return {
    band: band?.name ?? 'inactive', scale: state === 'AT_RISK' ? 0.9 : band?.scale ?? 0.55,
    layers: state === 'INACTIVE' || state === 'BROKEN' ? 1 : band?.layers ?? 1,
    flickerMs: band?.flickerMs ?? 0, embers: mode === 'FULL' && !['INACTIVE', 'FROZEN', 'BROKEN'].includes(state) ? count : 0,
    halo: Boolean(band?.halo && state !== 'FROZEN' && state !== 'BROKEN'), rays: Boolean(band?.rays && state !== 'FROZEN' && state !== 'BROKEN'),
    overlay, colors: palette, opacity: state === 'AT_RISK' ? 0.7 : 1,
    saturation: state === 'AT_RISK' ? 0.45 : state === 'BROKEN' ? 0 : 1,
    coreBoost: state === 'ACTIVE_TRACKED' ? 1.18 : 1,
    animate: ambient, shiver: ambient && state === 'AT_RISK', reduced: mode !== 'FULL',
    label: `${Math.max(0, Math.floor(Number.isFinite(length) ? length : 0))}-day tracking streak, ${descriptor}`,
  } as const;
}

/** Stable integer PRNG for repeatable SVG particle placement (DD-50). */
export function seededOffsets(seed: number, count: number) {
  let value = seed >>> 0;
  return Array.from({ length: Math.max(0, Math.floor(count)) }, () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return { x: value % 100, delay: (value >>> 8) % 1600, rise: 8 + ((value >>> 16) % 18) };
  });
}
