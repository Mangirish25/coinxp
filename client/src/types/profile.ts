export interface ProfileActivity {
  id: number;
  kind: string;
  occurredAt: string;
  summaryCode: string;
}

export interface ProfileData {
  id: number;
  displayName: string;
  memberSince: string;
  level: number;
  title: string;
  lifetimeXp: number;
  spendableXp: number;
  currentStreak: number;
  longestStreak: number;
  badgeCounts: Record<string, number>;
  badges: Array<{ slug: string; tier: number; rarity: string; achievedOn: string }>;
  showcase: string[];
  equippedTheme: string | null;
  equippedFrame: string | null;
  ownedCosmetics: Array<{ itemSlug: string; acquiredAt: string; itemType: string }>;
  completedChallenges: number;
  recentActivity: ProfileActivity[];
}
