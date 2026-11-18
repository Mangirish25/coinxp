export interface ShopItem {
  slug: string;
  type: 'FREEZE' | 'THEME' | 'FRAME';
  costXp: number;
  minLevel: number;
  owned: boolean;
  available: boolean;
}

export interface ShopCatalog {
  level: number;
  spendableXp: number;
  freezes: { inventory: number; inventoryCap: number; quotaRemaining: number };
  items: ShopItem[];
}

export interface PurchaseResult {
  id: number;
  itemSlug: string;
  itemType: ShopItem['type'];
  costXp: number;
  spendableXp: number;
  lifetimeXp: number;
  level: number;
  effect: { granted: boolean; inventory: number } | null;
}

export interface PurchaseHistoryItem extends Omit<PurchaseResult, 'effect'> {
  createdAt: string;
  ledgerEntryId: number;
  status: 'COMPLETED' | 'REFUNDED';
  meta: Record<string, unknown>;
}
