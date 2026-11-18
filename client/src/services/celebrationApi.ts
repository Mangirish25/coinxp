import { apiFetch } from './api';
import type { CelebrationNotice } from '../celebrations/celebrationPlan';

export const celebrationApi = {
  pending: () => apiFetch<{ data: CelebrationNotice[] }>('/api/celebrations/pending'),
  acknowledge: (upToId: number) => apiFetch<{ acknowledgedThrough: number }>('/api/celebrations/ack', {
    method: 'POST', body: JSON.stringify({ upToId }),
  }),
};
