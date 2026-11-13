export interface IntegrityNotice {
  id: number;
  kind: 'INFO' | 'WARNING' | 'XP_CHANGE' | 'RESTRICTION' | 'REVIEW';
  code: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export interface IntegrityStatus {
  holdActive: boolean;
  scope: 'OUTCOME_XP' | 'STREAK_XP' | null;
  holdUntil: string | null;
  canAppeal: boolean;
  unreadNotices: number;
  lastNoticeCode: string | null;
}

export interface UnexpectedQuota {
  month: string;
  quota: number;
  used: number;
  remaining: number;
  enabled: boolean;
}
