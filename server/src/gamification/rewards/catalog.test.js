import { describe, expect, it } from 'vitest';
import rules from '../rules.config.js';
import { assertRewardCatalog, badgeTier, economyReport } from './catalog.js';

describe('BAD-001 reward catalog and XP-015 economy', () => {
  it('validates all configured catalogs at startup', () => {
    expect(assertRewardCatalog(rules.rewards)).toBe(rules.rewards);
    expect(rules.rewards.badges).toHaveLength(14);
    expect(rules.rewards.challenges.library).toHaveLength(3);
    expect(rules.rewards.shop.items).toHaveLength(7);
  });

  it('rejects unknown metrics, duplicate slugs and descending tiers', () => {
    const unknown = structuredClone(rules.rewards);
    unknown.badges[0].metric = 'EXPENSE_AMOUNT';
    expect(() => assertRewardCatalog(unknown)).toThrow(/unknown metric/);

    const duplicate = structuredClone(rules.rewards);
    duplicate.badges[1].slug = duplicate.badges[0].slug;
    expect(() => assertRewardCatalog(duplicate)).toThrow(/duplicate badge slugs/);

    const descending = structuredClone(rules.rewards);
    descending.badges[0].tiers = [7, 30, 20];
    expect(() => assertRewardCatalog(descending)).toThrow(/must ascend/);
  });

  it('keeps rarity XP and economy shares within the configured governance bounds', () => {
    expect(badgeTier(rules.rewards, rules.rewards.badges[2], 4)).toEqual({ rarity: 'LEGENDARY', xp: 200 });
    const report = economyReport(rules);
    expect(report.badgeXp).toBe(1630);
    expect(report.missionRecurringXp).toBe(4285);
    expect(report.baseShareBps).toBeGreaterThanOrEqual(rules.rewards.economy.baseMinShareBps);
    expect(report.missionShareBps).toBeLessThanOrEqual(rules.rewards.economy.newRecurringMaxShareBps);
    expect(report.oneTimeShareBps).toBeLessThanOrEqual(rules.rewards.economy.oneTimeMaxShareBps);
    expect(report.passes).toBe(true);
  });
});
