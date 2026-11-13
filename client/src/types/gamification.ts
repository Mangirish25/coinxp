export interface GamificationLedgerEntry {
  id: number;
  entryType: string;
  ruleId: string | null;
  lifetimeDelta: number;
  delta?: number;
  balanceDelta: number;
  periodType: string;
  periodKey: string;
  reasonCode: string;
  message: string;
  note: string | null;
  createdAt: string;
}

export interface GamificationSummary {
  lifetimeXp: number;
  spendableXp: number;
  level: number;
  title: string;
  nextTitle: string | null;
  xpIntoLevel: number;
  xpForNext: number;
  progressBps: number;
  today: { trackingCredited: boolean; reviewCompleted: boolean; noSpendCapRemaining: number };
  unseen: GamificationLedgerEntry[];
  lastEntries: GamificationLedgerEntry[];
  settlement: { lastSettledDate: string | null; pending: boolean };
}

export interface GamificationLedgerPage {
  data: GamificationLedgerEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
