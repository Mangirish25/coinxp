export interface Mission {
  id: number;
  slot: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  periodKey: string;
  templateId: string;
  status: 'ASSIGNED' | 'COMPLETED' | 'EXPIRED' | 'REPLACED' | 'DEFERRED';
  generationSeq: number;
  params: Record<string, unknown>;
  assignedAt: string;
  closedAt: string | null;
  xpAwarded: number;
}

export interface MissionList { data: Mission[] }
