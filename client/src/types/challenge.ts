export interface ChallengeDefinition {
  slug: string;
  days: number;
  requiredQualifyingDays: number;
  costXp: number;
  rewardXp: number;
  minLevel: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  requires: string[];
  qualify: string[];
  eligible: boolean;
  reason: string | null;
  startDate?: string;
}

export interface ChallengeRun {
  id: number;
  challengeSlug: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'ABANDONED' | 'CANCELLED' | 'DEFERRED';
  costXp: number;
  purchaseId: number | null;
  startDate: string;
  endDate: string;
  qualifyingDays: number;
  requiredDays: number;
  closedAt: string | null;
  xpAwarded: number;
  createdAt?: string;
  days?: Array<{ localDate: string; qualified: number; status: 'FINAL' | 'DEFERRED'; details: Record<string, boolean> }>;
}

export interface ChallengeCatalog {
  data: ChallengeDefinition[];
  activeRun: ChallengeRun | null;
  runs: ChallengeRun[];
}
