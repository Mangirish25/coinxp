import { z } from 'zod';
import rules from '../gamification/rules.config.js';

export const activityQuerySchema = z.object({
  cursor: z.string().regex(/^[A-Za-z0-9_-]+$/).optional(),
  pageSize: z.coerce.number().int().min(1).max(rules.rewards.activity.maxPageSize).optional(),
  kinds: z.string().max(100).optional().transform((value)=>value?value.split(',').filter(Boolean):undefined)
    .pipe(z.array(z.enum(['TRANSACTION','XP','STREAK','BADGE','MISSION','CHALLENGE','PURCHASE','NOTICE','LEVEL'])).max(9).optional()),
}).strict();
