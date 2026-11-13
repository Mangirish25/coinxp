import rules from './rules.config.js';

// XP-007: thresholds and progress use integer arithmetic only.
export function levelThreshold(level, config = rules) {
  if (!Number.isSafeInteger(level) || level < 1) throw new TypeError('Level must be a positive integer.');
  return config.levels.base * level * (level - 1);
}

export function derivedLevel(lifetimeXp, config = rules) {
  if (!Number.isSafeInteger(lifetimeXp) || lifetimeXp < 0) throw new TypeError('Lifetime XP must be a non-negative safe integer.');
  let low = 1;
  let high = config.levels.maxLevel;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (levelThreshold(mid, config) <= lifetimeXp) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function titleForLevel(level, config = rules) {
  return config.levels.titles.filter((item) => item.from <= level).at(-1)?.title ?? '';
}

export function levelProgress(lifetimeXp, displayedLevel, config = rules) {
  const threshold = levelThreshold(displayedLevel, config);
  if (displayedLevel >= config.levels.maxLevel) return { xpIntoLevel: 0, xpForNext: 0, progressBps: 0 };
  const xpForNext = config.levels.base * displayedLevel * 2;
  const remainingXp = Math.max(0, lifetimeXp - threshold);
  return {
    xpIntoLevel: Math.min(remainingXp, xpForNext),
    xpForNext,
    progressBps: Math.min(config.units.basisPoints, Number((BigInt(Math.min(remainingXp, xpForNext)) * BigInt(config.units.basisPoints)) / BigInt(xpForNext))),
  };
}

export function levelUpsBetween(fromLevel, toLevel) {
  return Array.from({ length: Math.max(0, toLevel - fromLevel) }, (_item, index) => fromLevel + index + 1);
}
