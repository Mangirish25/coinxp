import { apiFetch } from './api';
import { queryClient } from './queryClient';
import type { MissionList } from '../types/mission';

export const missionApi = {
  current: () => apiFetch<MissionList>('/api/missions'),
  history: (page = 1) => apiFetch<{data:Array<{id:number;slot:string;periodKey:string;templateId:string;status:string;xpAwarded:number}>;pagination:{page:number;pageSize:number;total:number;totalPages:number}}>(`/api/missions/history?page=${page}&pageSize=20`),
  reroll(slot: 'DAILY' | 'WEEKLY' | 'MONTHLY') {
    return apiFetch('/api/missions/' + slot.toLowerCase() + '/reroll', { method: 'POST', body: '{}' }).then((result) => {
      void queryClient.invalidateQueries({ queryKey: ['missions'] });
      return result;
    });
  },
};
