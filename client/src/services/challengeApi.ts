import { apiFetch } from './api';
import { queryClient } from './queryClient';
import type { ChallengeCatalog, ChallengeRun } from '../types/challenge';

function invalidateRewards() {
  for (const key of ['challenges', 'shop', 'gamification', 'badges', 'missions', 'profile', 'activity']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export const challengeApi = {
  catalog: () => apiFetch<ChallengeCatalog>('/api/challenges'),
  run: (id: number) => apiFetch<ChallengeRun>(`/api/challenges/runs/${id}`),
  start(slug: string) {
    return apiFetch<ChallengeRun>(`/api/challenges/${encodeURIComponent(slug)}/start`, {
      method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: '{}',
    }).then((result) => { invalidateRewards(); return result; });
  },
  cancel(id: number) {
    return apiFetch<{ cancelled: boolean; spendableXp: number }>(`/api/challenges/runs/${id}/cancel`, { method: 'POST', body: '{}' })
      .then((result) => { invalidateRewards(); return result; });
  },
  abandon(id: number) {
    return apiFetch<{ runId: number; status: string }>(`/api/challenges/runs/${id}/abandon`, { method: 'POST', body: '{}' })
      .then((result) => { invalidateRewards(); return result; });
  },
};
