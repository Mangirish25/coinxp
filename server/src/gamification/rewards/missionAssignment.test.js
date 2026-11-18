import { describe, expect, it } from 'vitest';
import { chooseMissionTemplate, deterministicRank, eligibleTemplates } from './missionAssignment.js';

describe('MIS-002 deterministic mission assignment', () => {
  const templates = [
    { id: 'a', priority: 1, eligibility: ['ACTIVE_LAST_7'] },
    { id: 'b', priority: 2, eligibility: ['ACTIVE_LAST_7'] },
    { id: 'c', priority: 2, eligibility: ['ACTIVE_LAST_7'] },
  ];

  it('ranks stably and selects only the highest eligible priority', () => {
    expect(deterministicRank({ userId: 12, slot: 'DAILY', periodKey: '2026-11-18', templateId: 'a', generationSeq: 0 }))
      .toBe(deterministicRank({ userId: 12, slot: 'DAILY', periodKey: '2026-11-18', templateId: 'a', generationSeq: 0 }));
    const eligible = eligibleTemplates(templates, { accountAgeDays: 10, facts: { trackedLast7: 2 }, completedTemplates: new Set() });
    const selected = chooseMissionTemplate({ templates: eligible, userId: 12, slot: 'DAILY', periodKey: '2026-11-18', generationSeq: 0 });
    expect(['b', 'c']).toContain(selected.id);
    expect(chooseMissionTemplate({ templates: eligible, userId: 12, slot: 'DAILY', periodKey: '2026-11-18', generationSeq: 0 }).id).toBe(selected.id);
  });

  it('avoids repeating the prior template when another top-ranked option exists', () => {
    expect(chooseMissionTemplate({ templates: [{ id: 'a', priority: 2 }, { id: 'b', priority: 2 }], userId: 1, slot: 'WEEKLY', periodKey: '2026-W47', generationSeq: 0, previousTemplateId: 'a' }).id).toBe('b');
  });

  it('respects account and eligibility predicates and once-per-user completion', () => {
    const eligible = eligibleTemplates([
      { id: 'age', eligibility: ['ACCOUNT_AGE_14'] },
      { id: 'once', oncePerUser: true, eligibility: ['ACTIVE_LAST_7'] },
    ], { accountAgeDays: 4, facts: { trackedLast7: 1 }, completedTemplates: new Set(['once']) });
    expect(eligible).toEqual([]);
  });
});
