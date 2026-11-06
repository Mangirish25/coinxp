import { z } from 'zod';
import { BUDGET_CONFIG } from '../config/budgetConfig.js';
import { isValidDateString } from '../utils/dates.js';
import { rupeesToPaise } from '../utils/money.js';

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Month must be valid YYYY-MM.' });
const dateSchema = z
  .string()
  .refine(isValidDateString, { error: 'Date must be a valid YYYY-MM-DD.' });
const amountSchema = z.union([z.string(), z.number().finite()]).transform((value, ctx) => {
  let paise;
  try {
    paise = rupeesToPaise(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Enter an amount with no more than two decimals.' });
    return z.NEVER;
  }
  if (paise > BUDGET_CONFIG.maxAmountPaise) {
    ctx.addIssue({ code: 'custom', message: 'Amount is above the permitted limit.' });
    return z.NEVER;
  }
  return paise;
});

export const upsertBudgetSchema = z
  .object({
    scope: z.enum(['monthly_total', 'category_monthly', 'daily_limit']),
    amount: amountSchema,
    categoryId: z.number().int().positive().safe().optional(),
    month: monthSchema.optional(),
  })
  .transform(({ amount, ...body }) => ({ ...body, amountPaise: amount }));

export const budgetListQuerySchema = z.object({
  month: monthSchema.optional(),
  scope: z.enum(['monthly_total', 'category_monthly', 'daily_limit']).optional(),
});
export const budgetStatusQuerySchema = z.object({ month: monthSchema.optional() });
export const dailyStatusQuerySchema = z.object({ date: dateSchema.optional() });
export const budgetIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, { error: 'Invalid budget id.' })
    .transform(Number)
    .refine(Number.isSafeInteger, { error: 'Invalid budget id.' }),
});
