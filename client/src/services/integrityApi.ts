import { apiFetch } from './api';
import type { IntegrityNotice, IntegrityStatus, UnexpectedQuota } from '../types/integrity';

export const integrityApi = {
  status: () => apiFetch<IntegrityStatus>('/api/integrity/status'),
  notices: () => apiFetch<{ data: IntegrityNotice[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>('/api/integrity/notices?page=1&pageSize=20'),
  acknowledge: (upToId: number) => apiFetch<{ acknowledgedThrough: number }>('/api/integrity/notices/ack', { method: 'POST', body: JSON.stringify({ upToId }) }),
  appeal: (message: string) => apiFetch<{ caseId: number; received: boolean }>('/api/integrity/appeals', { method: 'POST', body: JSON.stringify({ message }) }),
  unexpectedQuota: () => apiFetch<UnexpectedQuota>('/api/transactions/unexpected-quota'),
};
