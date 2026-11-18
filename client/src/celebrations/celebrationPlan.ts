import { celebration, motionTokens, rarityEffects, streakMilestoneIntensity } from '../visuals/visuals.config';

export interface CelebrationNotice {
  id: number; kind: string; code: string; createdAt: string; data: Record<string, unknown>;
}
export interface CelebrationPreferences { celebrations: 'ALL' | 'MAJOR' | 'OFF'; mutedCategories: string[] }
export interface PlannedCelebration { notice: CelebrationNotice; priority: number; durationMs: number; fullScreen: boolean }

const negativeCodes = new Set(['STREAK_BROKEN', 'CHALLENGE_FAILED', 'CHALLENGE_ABANDONED', 'XP_REVERSED_LIMIT', 'LIMIT_NOW_EXCEEDED', 'HOLD_STARTED', 'INTEGRITY_NUDGE']);

function rarityFor(notice: CelebrationNotice) {
  if (notice.code !== 'BADGE_UNLOCKED') return null;
  const rarity = notice.data.rarity;
  return typeof rarity === 'string' && rarity in rarityEffects ? rarity as keyof typeof rarityEffects : null;
}

function eventPriority(notice: CelebrationNotice) {
  if (notice.code === 'LEVEL_UP' && notice.data.titleChanged === true) return celebration.priority.LEVEL_UP_TITLE;
  const rarity = rarityFor(notice);
  const rarityPriorities: Partial<Record<keyof typeof rarityEffects, keyof typeof celebration.priority>> = {
    COMMON: 'BADGE_COMMON', UNCOMMON: 'BADGE_UNCOMMON', RARE: 'BADGE_RARE', EPIC: 'BADGE_EPIC', LEGENDARY: 'BADGE_LEGENDARY',
  };
  const rarityPriority = rarity ? rarityPriorities[rarity] : null;
  const codePriority: Record<string, keyof typeof celebration.priority> = {
    LEVEL_UP: 'LEVEL_UP', STREAK_MILESTONE_REACHED: 'STREAK_MILESTONE', STREAK_MILESTONE: 'STREAK_MILESTONE',
    CHALLENGE_COMPLETED: 'CHALLENGE_COMPLETED', STREAK_FREEZE_USED: 'STREAK_FREEZE_USED', STREAK_RESTORED: 'STREAK_RESTORED',
    STREAK_BROKEN: 'STREAK_BROKEN', MISSION_COMPLETED: 'MISSION_COMPLETED', DAY_RECAP: 'DAY_RECAP',
  };
  const key = rarityPriority ?? codePriority[notice.code];
  return key && key in celebration.priority ? celebration.priority[key] : 0;
}

function canTakeOver(notice: CelebrationNotice) {
  if (negativeCodes.has(notice.code)) return false;
  if (notice.code === 'LEVEL_UP') return notice.data.titleChanged === true;
  if (notice.code === 'STREAK_MILESTONE' || notice.code === 'STREAK_MILESTONE_REACHED') return Number(notice.data.length ?? notice.data.milestone) >= 7;
  if (notice.code === 'CHALLENGE_COMPLETED') return true;
  const rarity = rarityFor(notice);
  return Boolean(rarity && rarityEffects[rarity].fullScreen);
}

function durationFor(notice: CelebrationNotice) {
  const rarity = rarityFor(notice);
  if (rarity) return rarityEffects[rarity].revealMs;
  if (notice.code.startsWith('STREAK_MILESTONE')) {
    const length = Number(notice.data.length ?? notice.data.milestone ?? 0);
    const milestones = Object.keys(streakMilestoneIntensity).map(Number).sort((a, b) => a - b);
    const selected = milestones.filter((milestone) => milestone <= length).at(-1) ?? milestones[0];
    return motionTokens.celebration[streakMilestoneIntensity[selected as keyof typeof streakMilestoneIntensity]];
  }
  return notice.code === 'LEVEL_UP' ? 2000 : notice.code === 'CHALLENGE_COMPLETED' ? 2000 : 1000;
}

/** NOT-005: plans are deterministic, bounded and never give negative events a festive takeover. */
export function celebrationPlan(items: CelebrationNotice[], prefs: CelebrationPreferences) {
  const filtered = items.filter((item) => !prefs.mutedCategories.includes(item.kind));
  const visible = prefs.celebrations === 'OFF' ? [] : filtered;
  const eligible = visible.filter((item) => prefs.celebrations === 'ALL' || canTakeOver(item));
  const sortedByPriority = [...eligible].filter(canTakeOver).sort((a, b) => eventPriority(b) - eventPriority(a) || a.id - b.id);
  const selected = new Set(sortedByPriority.slice(0, celebration.maxFullScreenPerRecap).map(({ id }) => id));
  let totalMs = 0;
  const ordered = [...visible].sort((a, b) => a.id - b.id).map((notice): PlannedCelebration => {
    let fullScreen = selected.has(notice.id);
    const durationMs = durationFor(notice);
    if (fullScreen && totalMs + durationMs > celebration.maxSequenceMs) fullScreen = false;
    if (fullScreen) totalMs += durationMs + celebration.gapMs;
    return { notice, priority: eventPriority(notice), durationMs, fullScreen };
  });
  const xpTotal = ordered.reduce((total, { notice }) => {
    const xp = notice.data.xpDelta ?? notice.data.xp;
    return Number.isSafeInteger(xp) ? total + Number(xp) : total;
  }, 0);
  return {
    fullScreen: ordered.filter((item) => item.fullScreen),
    recap: ordered.filter((item) => !item.fullScreen),
    totalDurationMs: Math.min(celebration.maxSequenceMs, totalMs),
    xpTotal,
  };
}
