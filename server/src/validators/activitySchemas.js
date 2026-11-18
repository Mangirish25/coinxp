import { z } from 'zod';
import rules from '../gamification/rules.config.js';

export const activityQuerySchema = z.object({
  cursor: z.string().regex(/^[A-Za-z0-9_-]+$/).optional(),
  pageSize: z.coerce.number().int().min(1).max(rules.rewards.activity.maxPageSize).optional(),
  kind: z.enum(['TRANSACTION','XP','STREAK','BADGE','MISSION','CHALLENGE','PURCHASE','NOTICE','LEVEL']).optional(),
}).strict();
