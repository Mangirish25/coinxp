import { apiFetch } from './api';
import type { Category } from '../types/transaction';

export const categoryApi = {
  list(type?: string) {
    return apiFetch<Category[]>(
      `/api/categories${type ? `?type=${encodeURIComponent(type)}` : ''}`,
    );
  },
  create(body: { name: string; type: 'income' | 'expense'; icon?: string }) {
    return apiFetch<Category>('/api/categories', { method: 'POST', body: JSON.stringify(body) });
  },
  update(id: number, body: { name?: string; icon?: string | null }) {
    return apiFetch<Category>(`/api/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  delete(id: number) {
    return apiFetch<void>(`/api/categories/${id}`, { method: 'DELETE', body: '{}' });
  },
};
