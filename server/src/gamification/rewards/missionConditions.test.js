import { describe, expect, it } from 'vitest';
import { missionConditionPasses, missionPeriod, requiresOutcomePass } from './missionConditions.js';
import rules from '../rules.config.js';

const baseMission = { slot: 'DAILY', periodKey: '2024-02-29' };
const baseFacts = { tracked: [], countedBudgetDays: [], reviews: [], budgetHistory: [], auditRows: [], categories: [] };

describe('MIS-003 close-time mission condition rules', () => {
  it('uses calendar boundaries for daily, ISO weekly and monthly periods', () => {
    expect(missionPeriod('DAILY', '2024-02-29')).toEqual({ from: '2024-02-29', to: '2024-02-29' });
    expect(missionPeriod('WEEKLY', '2024-W09')).toEqual({ from: '2024-02-26', to: '2024-03-03' });
    expect(missionPeriod('MONTHLY', '2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('requires pass outcomes only for counted budget conditions', () => {
    expect(requiresOutcomePass('COUNTED_BUDGET_DAYS_AT_LEAST')).toBe(true);
    expect(requiresOutcomePass('COUNTED_BUDGET_DAYS_IMPROVED')).toBe(true);
    expect(requiresOutcomePass('TRACKED_DAYS_AT_LEAST')).toBe(false);
  });

  it('MIS-003: categorization uses only live transaction snapshots at the close cutoff', () => {
    const facts = { ...baseFacts, categories: [{ id: 10, name: 'Food' }, { id: 11, name: 'Other' }], auditRows: [
      { transactionId: 1, action: 'create', createdAt: '2024-03-01T03:59:00.000Z', after: { transactionDate: '2024-02-29', createdLocalDate: '2024-02-29', deletedAt: null, amountPaise: 500, type: 'expense', categoryId: 10, description: null } },
      { transactionId: 2, action: 'create', createdAt: '2024-03-01T04:01:00.000Z', after: { transactionDate: '2024-02-29', createdLocalDate: '2024-02-29', deletedAt: null, amountPaise: 500, type: 'expense', categoryId: 11, description: null } },
    ] };
    const template = { condition: 'ALL_LIVE_CATEGORIZED' };
    expect(missionConditionPasses({ mission: baseMission, template, facts, timezone: 'UTC', cutoff: '2024-03-01T04:00:00.000Z', minimumPaise: 500, units: rules.units })).toBe(true);
  });

  it('requires one logged transaction before an all-categorized mission can pass', () => {
    expect(missionConditionPasses({ mission: baseMission, template: { condition: 'ALL_LIVE_CATEGORIZED' }, facts: baseFacts,
      timezone: 'UTC', cutoff: '2024-03-01T04:00:00.000Z', minimumPaise: 500, units: rules.units })).toBe(false);
  });
});
