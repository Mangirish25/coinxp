import { z } from 'zod';

const positiveInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger);
export const noticeQuerySchema = z.object({
  page: positiveInteger.default('1'), pageSize: positiveInteger.default('20'),
  unreadOnly: z.enum(['true','false']).default('false'),
  kind: z.enum(['INFO','WARNING','XP_CHANGE','RESTRICTION','REVIEW']).optional(),
}).transform(({ unreadOnly, ...query }) => ({ ...query, unreadOnly: unreadOnly === 'true' }));
export const acknowledgeNoticeSchema = z.object({ upToId: z.number().int().positive().safe() });
export const appealSchema = z.object({ message: z.string().trim().min(1).max(500) });
