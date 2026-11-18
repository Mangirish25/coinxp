import { z } from 'zod';
import rules from '../gamification/rules.config.js';

export const notificationPreferencesSchema = z.object({
  preferences: z.array(z.object({ category: z.enum(['PROGRESS','REWARD','STREAK','WARNING','INFO','RESTRICTION','REVIEW','XP_CHANGE']), enabled: z.boolean() }).strict()).max(rules.rewards.notifications.mutable.length),
}).strict().refine(({ preferences }) => new Set(preferences.map(({ category }) => category)).size === preferences.length, 'A notification category may appear only once.');
