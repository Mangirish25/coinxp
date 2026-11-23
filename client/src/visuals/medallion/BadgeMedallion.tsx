import { Award, Flame, Heart, LockKeyhole, ShieldCheck, Star, Target } from 'lucide-react';
import { useId } from 'react';
import type { BadgeFamily, BadgeTier } from '../../types/rewards';
import { medallionSpec, type MedallionSize, type MedallionState } from './medallionSpec';
import { useMotionActivity, useMotionPreferences } from '../../motion/MotionProvider';

const categoryGlyphs = { TRACKING: Award, STREAK: Flame, BUDGET: ShieldCheck, PROGRESS: Star, CHALLENGE: Target, HABIT: Heart } as const;
const silhouettes: Record<string, string> = {
  hexagon: '50,5 89,27 89,73 50,95 11,73 11,27',
  shield: '50,7 87,20 82,62 50,92 18,62 13,20',
  star: '50,5 61,34 92,35 68,54 77,84 50,67 23,84 32,54 8,35 39,34',
  notched: '22,9 78,9 91,22 91,78 78,91 22,91 9,78 9,22',
  squircle: '25,7 75,7 93,25 93,75 75,93 25,93 7,75 7,25',
};
const flameShape = 'M50 5c-5 18-24 25-24 48a24 24 0 0 0 48 0C74 32 57 22 50 5Z';

export function BadgeMedallion({ badge, tier, size = 'md', state, progressBps = 0, onClick, quality, mode }: {
  badge: BadgeFamily; tier: BadgeTier; size?: MedallionSize; state?: MedallionState; progressBps?: number; onClick?: () => void;
  quality?: 'HIGH' | 'MEDIUM' | 'LOW'; mode?: 'FULL' | 'REDUCED' | 'OFF';
}) {
  const motion = useMotionPreferences();
  const reactId = useId().replaceAll(':', '');
  const visualState = state ?? (tier.status === 'ACTIVE' ? 'UNLOCKED' : 'LOCKED');
  const spec = medallionSpec({ slug: badge.slug, category: badge.category, tier: tier.tier, rarity: tier.rarity as 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY', state: visualState, progressBps, size, quality: quality ?? motion.quality, mode: mode ?? motion.effectiveMode });
  const activityRef = useMotionActivity<HTMLSpanElement>(spec.sheen || spec.orbitCount > 0);
  const Glyph = categoryGlyphs[badge.category as keyof typeof categoryGlyphs] ?? Award;
  const id = `medal-${reactId}`;
  const shape = spec.shape === 'flame' ? <path d={flameShape} /> : <polygon points={silhouettes[spec.shape] ?? silhouettes.squircle} />;
  const circumference = 289;

  const artwork = <svg viewBox="0 0 100 100" width={spec.size} height={spec.size} role="img" aria-label={spec.accessibleLabel} className={`badge-medallion${spec.locked ? ' badge-medallion-locked' : ''}${spec.motion ? ' badge-medallion-motion' : ''}${spec.sheen ? ' badge-medallion-sheen' : ''}${spec.tilt ? ' badge-medallion-tilt' : ''}`}>
    <defs><linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={spec.baseColor} /><stop offset=".5" stopColor="#fff" stopOpacity=".56" /><stop offset="1" stopColor={spec.rarityColor} /></linearGradient><radialGradient id={`${id}-glow`}><stop stopColor={spec.rarityColor} stopOpacity={spec.glow} /><stop offset="1" stopColor={spec.rarityColor} stopOpacity="0" /></radialGradient></defs>
    <circle cx="50" cy="50" r="49" fill={`url(#${id}-glow)`} />
    {spec.orbitCount > 0 && Array.from({ length: spec.orbitCount }, (_, index) => <circle key={index} className="badge-orbit" cx="50" cy="8" r="1.5" fill={spec.rarityColor} transform={`rotate(${index * (360 / spec.orbitCount)} 50 50)`} />)}
    {spec.rays && <g stroke={spec.rarityColor} strokeWidth="1.5" opacity=".55">{Array.from({ length: 8 }, (_, index) => <line key={index} x1="50" y1="2" x2="50" y2="11" transform={`rotate(${index * 45} 50 50)`} />)}</g>}
    <circle cx="50" cy="50" r="46" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray={spec.locked ? '4 4' : undefined} />
    <circle cx="50" cy="50" r="46" fill="none" stroke={spec.rarityColor} strokeWidth="2.5" strokeDasharray={`${circumference}`} strokeDashoffset={circumference * (1 - spec.progressBps / 10000)} transform="rotate(-90 50 50)" />
    <g fill={`url(#${id}-metal)`} stroke={spec.rarityColor} strokeWidth="2">{shape}</g>
    <circle cx="50" cy="48" r="27" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1" />
    {spec.hidden ? <text x="50" y="57" textAnchor="middle" fontSize="25" fontWeight="700" fill="#475569">?</text> : <Glyph x="36" y="34" width="28" height="28" color={spec.locked ? '#475569' : '#1e293b'} strokeWidth={1.8} />}
    {spec.locked && !spec.hidden && <LockKeyhole x="42" y="62" width="16" height="16" color="#334155" />}
    {Array.from({ length: spec.tierPips }, (_, index) => <circle key={index} cx={39 + index * 7.4} cy="84" r="2.1" fill={index < spec.filledPips ? spec.rarityColor : 'none'} stroke={spec.rarityColor} strokeWidth="1" />)}
    {spec.newTag && <g><rect x="62" y="4" width="32" height="14" rx="7" fill="#0f766e" /><text x="78" y="14" textAnchor="middle" fontSize="8" fill="white">New</text></g>}
    {spec.showcased && <Star x="76" y="5" width="18" height="18" fill="#fff" color="#a16207" />}
  </svg>;

  return <span ref={activityRef} className="inline-flex">{onClick ? <button type="button" onClick={onClick} aria-label={`View ${spec.accessibleLabel}`} className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">{artwork}</button> : artwork}</span>;
}
