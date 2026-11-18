import { apiFetch } from './api';
import { queryClient } from './queryClient';
import type { PurchaseHistoryItem, PurchaseResult, ShopCatalog } from '../types/shop';

export const shopApi = {
  catalog: () => apiFetch<ShopCatalog>('/api/shop'),
  purchases: () => apiFetch<{ data: PurchaseHistoryItem[] }>('/api/shop/purchases'),
  purchase(itemSlug: string) {
    return apiFetch<PurchaseResult>('/api/shop/purchase', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ itemSlug }) }).then((result) => {
      void queryClient.invalidateQueries({ queryKey: ['shop'] });
      void queryClient.invalidateQueries({ queryKey: ['gamification'] });
      void queryClient.invalidateQueries({ queryKey: ['streaks'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
      return result;
    });
  },
};
