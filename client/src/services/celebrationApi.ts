import { apiFetch } from './api';
import type { CelebrationNotice } from '../celebrations/celebrationPlan';

export const celebrationApi = {
  pending: () => apiFetch<{ data: CelebrationNotice[] }>('/api/celebrations/pending'),
  claim: () => apiFetch<{ data: CelebrationNotice[] }>('/api/celebrations/claim', {
    method: 'POST', body: JSON.stringify({}),
  }),
  acknowledge: (upToId: number) => apiFetch<{ acknowledgedThrough: number }>('/api/celebrations/ack', {
    method: 'POST', body: JSON.stringify({ upToId }),
  }),
};
