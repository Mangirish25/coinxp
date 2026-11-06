import { z } from 'zod';
import { ANALYTICS_CONFIG } from '../config/analyticsConfig.js';
import { isValidDateString } from '../utils/dates.js';

const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Month must use valid YYYY-MM format.' });
const date = z.string().refine(isValidDateString, { error: 'Date must be valid YYYY-MM-DD.' });

export const dashboardSummaryQuerySchema = z.object({ month: month.optional() });
export const categoryBreakdownQuerySchema = z.object({
  from: date.optional(),
  to: date.optional(),
  type: z.enum(['income', 'expense']).default('expense'),
});
export const dailySpendingQuerySchema = z.object({ from: date.optional(), to: date.optional() });
export const incomeVsExpenseQuerySchema = z.object({
  months: z.coerce
    .number()
    .int()
    .min(1)
    .max(ANALYTICS_CONFIG.maxHistoryMonths)
    .default(ANALYTICS_CONFIG.defaultHistoryMonths),
});
export const monthlyReportQuerySchema = z.object({ month });
