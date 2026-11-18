export type BadgeTierStatus = 'ACTIVE' | 'LOCKED' | 'REVOKED';

export interface BadgeTier {
  tier: number;
  threshold: number;
  rarity: string;
  xp: number;
  status: BadgeTierStatus;
  achievedOn: string | null;
}

export interface BadgeFamily {
  slug: string;
  category: string;
  type: 'ONE_TIME' | 'PROGRESSIVE' | 'REPEATABLE';
  rarity: string | null;
  hidden: boolean;
  metric: string;
  metricValue: number;
  timesEarned: number;
  tiers: BadgeTier[];
}

export interface BadgeCatalog {
  data: BadgeFamily[];
  hiddenRemaining: number;
  catalogVersion: string;
}
