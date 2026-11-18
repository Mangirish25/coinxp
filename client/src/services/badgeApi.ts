import { apiFetch } from './api';
import type { BadgeCatalog } from '../types/rewards';

export const badgeApi = {
  catalog: () => apiFetch<BadgeCatalog>('/api/badges'),
};
