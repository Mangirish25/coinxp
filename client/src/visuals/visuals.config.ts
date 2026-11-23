export const motionTokens = {
  duration: { instant: 80, micro: 120, quick: 200, standard: 320, emphasis: 560 },
  celebration: { small: 1200, medium: 2000, large: 2800, max: 3600 },
  stagger: 40,
  ease: { out: [0.2, 0, 0, 1], inOut: [0.4, 0, 0.2, 1] },
  spring: {
    snappy: { type: 'spring', stiffness: 500, damping: 32 },
    bouncy: { type: 'spring', stiffness: 300, damping: 18 },
    gentle: { type: 'spring', stiffness: 120, damping: 20 },
  },
} as const;

export const flameBands = [
  { name: 'ember', min: 1, scale: 0.55, layers: 1, flickerMs: 2400, embers: 0, halo: false, rays: false },
  { name: 'small', min: 3, scale: 0.7, layers: 2, flickerMs: 2000, embers: 2, halo: false, rays: false },
  { name: 'medium', min: 7, scale: 0.85, layers: 3, flickerMs: 1700, embers: 4, halo: false, rays: false },
  { name: 'large', min: 14, scale: 1, layers: 3, flickerMs: 1500, embers: 6, halo: false, rays: false },
  { name: 'blazing', min: 30, scale: 1.15, layers: 3, flickerMs: 1300, embers: 10, halo: false, rays: false },
  { name: 'inferno', min: 100, scale: 1.3, layers: 3, flickerMs: 1100, embers: 16, halo: true, rays: false },
  { name: 'golden', min: 365, scale: 1.4, layers: 3, flickerMs: 1000, embers: 20, halo: true, rays: true },
] as const;

export const qualityTiers = {
  HIGH: { confettiScale: 1, orbit: 6, embersScale: 1, glow: 'gradient+blur', ambient: 'all' },
  MEDIUM: { confettiScale: 0.5, orbit: 3, embersScale: 0.5, glow: 'gradient', ambient: 'focused' },
  LOW: { confettiScale: 0.15, orbit: 0, embersScale: 0, glow: 'none', ambient: 'none' },
} as const;

export const rarityEffects = {
  COMMON: { sheen: false, glow: 0, orbit: false, rays: false, tilt: false, confetti: 0, revealMs: 600, fullScreen: false },
  UNCOMMON: { sheen: true, glow: 0.3, orbit: false, rays: false, tilt: false, confetti: 0, revealMs: 1200, fullScreen: false },
  RARE: { sheen: true, glow: 0.5, orbit: false, rays: false, tilt: true, confetti: 20, revealMs: 2000, fullScreen: true },
  EPIC: { sheen: true, glow: 0.7, orbit: true, rays: false, tilt: true, confetti: 40, revealMs: 2800, fullScreen: true },
  LEGENDARY: { sheen: true, glow: 1, orbit: true, rays: true, tilt: true, confetti: 60, revealMs: 3600, fullScreen: true },
} as const;

export const streakMilestoneIntensity = { 3: 'small', 7: 'small', 14: 'medium', 30: 'medium', 60: 'large', 100: 'large', 180: 'max', 365: 'max' } as const;

export const celebration = {
  maxFullScreenPerRecap: 2, maxSequenceMs: 8000, gapMs: 300,
  skipAfterMs: 600, autoDismissCommonMs: 4000, pollMsVisible: 60000,
  priority: { LEVEL_UP_TITLE: 100, STREAK_MILESTONE: 90, BADGE_LEGENDARY: 88, BADGE_EPIC: 84,
    CHALLENGE_COMPLETED: 80, BADGE_RARE: 76, STREAK_FREEZE_USED: 75, STREAK_RESTORED: 70,
    STREAK_BROKEN: 65, BADGE_UNCOMMON: 60, BADGE_COMMON: 55, MISSION_COMPLETED: 50, LEVEL_UP: 45, DAY_RECAP: 40 },
} as const;

export const sampler = { windowMs: 2000, downgradeFrameMs: 24, upgradeFrameMs: 14, minDwellMs: 10000 } as const;

export const visualBudgets = {
  initialJsGzipKb: 220, visualsChunkGzipKb: 90, routeChunkGzipKb: 120,
  lcpMs: 2500, inpMs: 200, cls: 0.1, minFpsHigh: 55, longTaskMs: 50,
} as const;

export type QualityTier = keyof typeof qualityTiers;
export type MotionMode = 'SYSTEM' | 'FULL' | 'REDUCED' | 'OFF';

/** MOT-003: choose a device ceiling; adaptation may degrade but never exceed it. */
export function initialQualityFor({ deviceMemory, hardwareConcurrency, reducedData = false }: {
  deviceMemory?: number; hardwareConcurrency?: number; reducedData?: boolean;
}): QualityTier {
  const memory = deviceMemory ?? 0;
  const cores = hardwareConcurrency ?? 0;
  let selected: QualityTier = memory >= 4 && cores >= 4 ? 'HIGH' : memory >= 2 ? 'MEDIUM' : 'LOW';
  if (reducedData && selected === 'HIGH') selected = 'MEDIUM';
  return selected;
}

const qualityOrder: QualityTier[] = ['LOW', 'MEDIUM', 'HIGH'];
export function adaptQuality(current: QualityTier, frameTimesMs: number[], ceiling: QualityTier): QualityTier {
  if (!frameTimesMs.length) return current;
  const frames = [...frameTimesMs].filter(Number.isFinite).sort((a, b) => a - b);
  if (!frames.length) return current;
  const middle = Math.floor(frames.length / 2);
  const median = frames.length % 2 ? frames[middle] : (frames[middle - 1] + frames[middle]) / 2;
  const index = qualityOrder.indexOf(current);
  const ceilingIndex = qualityOrder.indexOf(ceiling);
  if (median > sampler.downgradeFrameMs) return qualityOrder[Math.max(0, index - 1)];
  if (median < sampler.upgradeFrameMs && index < ceilingIndex) return qualityOrder[index + 1];
  return current;
}
