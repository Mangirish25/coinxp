export type StreakPeriodStatus = 'COUNTED' | 'FROZEN' | 'EXEMPT' | 'MISSED' | 'DECLARED_CAPPED' | 'TODAY_OPEN' | 'NONE';

export interface StreakSummary {
  tracking: {
    status: 'NONE' | 'ACTIVE' | 'BROKEN';
    current: number;
    longest: number;
    trackedToday: boolean;
    atRisk: boolean;
    freezeWouldProtect: boolean;
    settlingDate: string | null;
    nextMilestone: { days: number; xp: number } | null;
    milestones: number[];
    comeback: { priorLength: number; afterCountedDays: number; sourceRunId: number; remainingDays: number } | null;
  };
  secondary: Record<string, { status: string; current: number; longest: number }>;
  freezes: { inventory: number; cap: number };
  through: string;
  recentEvents: Array<{ eventId: string; eventType: string; occurredAt: string; data: Record<string, unknown> }>;
  week: Array<{ date: string; status: StreakPeriodStatus; secondary: Record<string, string>; provisional: boolean }>;
  lastPeriod: { date: string; status: StreakPeriodStatus };
  milestones: { reached: number[]; next: { days: number; xp: number } | null };
}

export interface StreakCalendar {
  from: string;
  to: string;
  days: Array<{ date: string; status: StreakPeriodStatus; secondary: Record<string, string>; streakLength: number }>;
}

export interface FreezeHistory {
  inventory: number;
  cap: number;
  data: Array<{ id: number; delta: number; reason: string; effectiveAt: string; effectiveLocalDate: string; message: string }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
