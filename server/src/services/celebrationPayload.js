const payloadFields = Object.freeze({
  LEVEL_UP: ['fromLevel', 'toLevel', 'titleBefore', 'titleAfter', 'titleChanged', 'lifetimeXp', 'progressBps'],
  DAY_RECAP: ['date', 'xpDelta', 'entries', 'streakBefore', 'streakAfter', 'streakStatus'],
  STREAK_STARTED: ['date', 'runId'],
  STREAK_MILESTONE: ['milestone', 'length', 'xp'],
  STREAK_MILESTONE_REACHED: ['milestone', 'length', 'xp'],
  STREAK_FREEZE_USED: ['date', 'inventoryAfter', 'length'],
  STREAK_BROKEN: ['lengthAtEnd', 'date', 'comebackEligibleUntil'],
  STREAK_RESTORED: ['fromLength', 'toLength'],
  BADGE_UNLOCKED: ['slug', 'tier', 'rarity', 'category', 'xp', 'hidden', 'achievedOn', 'coalesced'],
  MISSION_COMPLETED: ['missionId', 'templateId', 'slot', 'periodKey', 'xp', 'xpAwarded'],
  CHALLENGE_COMPLETED: ['runId', 'challengeSlug', 'slug', 'status', 'qualifyingDays', 'requiredDays', 'xp', 'xpAwarded'],
  CHALLENGE_FAILED: ['runId', 'challengeSlug', 'slug', 'status', 'qualifyingDays', 'requiredDays', 'xp', 'xpAwarded'],
  PURCHASE_COMPLETED: ['id', 'itemSlug', 'type', 'itemType', 'costXp', 'spendableXp', 'lifetimeXp', 'level'],
});

function safeString(value) {
  return typeof value === 'string' && value.length <= 500;
}

function safeScalar(value) {
  return typeof value === 'boolean' || safeString(value) || (Number.isSafeInteger(value) && Number.isFinite(value));
}

function safeEntries(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 100).map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    return Object.fromEntries(['ruleId', 'delta', 'reasonCode']
      .filter((key) => safeScalar(entry[key]))
      .map((key) => [key, entry[key]]));
  }).filter(Boolean);
}

function safeCoalesced(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 20).map((badge) => {
    if (!badge || typeof badge !== 'object' || Array.isArray(badge)) return null;
    return Object.fromEntries(['slug', 'tier', 'rarity']
      .filter((key) => safeScalar(badge[key]))
      .map((key) => [key, badge[key]]));
  }).filter(Boolean);
}

/** Whitelist the UI presentation contract so event payload additions cannot expose financial fields. */
export function sanitizeCelebrationPayload(code, data) {
  const allowed = payloadFields[code];
  if (!allowed || !data || typeof data !== 'object' || Array.isArray(data)) return {};

  const result = {};
  for (const key of allowed) {
    if (key === 'entries') {
      const entries = safeEntries(data[key]);
      if (entries !== undefined) result[key] = entries;
    } else if (key === 'coalesced') {
      const badges = safeCoalesced(data[key]);
      if (badges !== undefined) result[key] = badges;
    } else if (safeScalar(data[key])) {
      result[key] = data[key];
    }
  }
  return result;
}
