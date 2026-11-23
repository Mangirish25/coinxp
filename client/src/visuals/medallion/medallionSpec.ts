import { qualityTiers, rarityEffects, type QualityTier } from '../visuals.config';

export type MedallionState = 'LOCKED' | 'HIDDEN_LOCKED' | 'UNLOCKED' | 'NEW' | 'SHOWCASE';
export type MedallionSize = 'sm' | 'md' | 'lg' | 'xl';
export type VisualMode = 'FULL' | 'REDUCED' | 'OFF';

const dimensions: Record<MedallionSize, number> = { sm: 32, md: 64, lg: 120, xl: 220 };
const metals = ['#b87333', '#a8b1bf', '#e5ae2c', '#e5e7eb'] as const;
const rarityColors = { COMMON: '#64748b', UNCOMMON: '#0f766e', RARE: '#2563eb', EPIC: '#7c3aed', LEGENDARY: '#c2410c' } as const;
const shapeFor = { TRACKING: 'hexagon', STREAK: 'flame', BUDGET: 'shield', PROGRESS: 'star', CHALLENGE: 'notched', HABIT: 'squircle' } as const;

export function medallionSpec({ slug, category, tier, rarity, state, progressBps, size = 'md', quality = 'HIGH', mode = 'FULL' }: {
  slug: string; category: string; tier: number; rarity: keyof typeof rarityEffects; state: MedallionState;
  progressBps: number; size?: MedallionSize; quality?: QualityTier; mode?: VisualMode;
}) {
  const hidden = state === 'HIDDEN_LOCKED';
  const effects = rarityEffects[rarity];
  const effectEnabled = mode === 'FULL' && quality !== 'LOW' && (size === 'lg' || size === 'xl');
  const locked = state === 'LOCKED' || hidden;
  return {
    accessibleLabel: hidden ? 'Locked badge' : `${slug.split('_').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ')}, ${['Bronze', 'Silver', 'Gold', 'Platinum'][tier - 1] ?? `Tier ${tier}`}, ${rarity.toLowerCase()}`,
    shape: hidden ? 'shield' : shapeFor[category as keyof typeof shapeFor] ?? 'squircle',
    size: dimensions[size], tierPips: 4, filledPips: locked ? 0 : Math.max(1, Math.min(4, tier)),
    progressBps: hidden ? 0 : Math.max(0, Math.min(10000, Math.trunc(progressBps))),
    baseColor: locked ? '#94a3b8' : tier >= 1 && tier <= 4 ? metals[tier - 1] : rarityColors[rarity],
    rarityColor: hidden ? '#94a3b8' : rarityColors[rarity],
    glow: effectEnabled ? effects.glow : 0,
    sheen: effectEnabled && effects.sheen, orbitCount: effectEnabled && effects.orbit ? qualityTiers[quality].orbit : 0,
    rays: effectEnabled && effects.rays, tilt: effectEnabled && effects.tilt,
    motion: mode === 'FULL' && quality !== 'LOW' && size !== 'sm',
    locked, hidden, newTag: state === 'NEW', showcased: state === 'SHOWCASE',
  } as const;
}
