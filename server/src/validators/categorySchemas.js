import { z } from 'zod';
import { TRANSACTION_CONFIG } from '../config/transactionConstants.js';

const categoryName = z
  .string()
  .trim()
  .min(1, { error: 'Category name is required.' })
  .max(TRANSACTION_CONFIG.maxCategoryNameLength, {
    error: `Category name must be ${TRANSACTION_CONFIG.maxCategoryNameLength} characters or fewer.`,
  });
const categoryIcon = z.string().trim().max(80).nullable().optional();

export const createCategorySchema = z.object({
  name: categoryName,
  type: z.enum(['income', 'expense']),
  icon: categoryIcon,
});

export const updateCategorySchema = z
  .object({ name: categoryName.optional(), icon: categoryIcon })
  .refine((body) => body.name !== undefined || body.icon !== undefined, {
    error: 'Provide a category name or icon to update.',
  });

export const categoryListQuerySchema = z.object({ type: z.enum(['income', 'expense']).optional() });

export const categoryIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, { error: 'Invalid category id.' })
    .transform(Number)
    .refine(Number.isSafeInteger, { error: 'Invalid category id.' }),
});
