import { z } from 'zod';
import { TRANSACTION_CONFIG } from '../config/transactionConstants.js';
import { isValidDateString } from '../utils/dates.js';
import { rupeesToPaise } from '../utils/money.js';

const transactionTypeSchema = z.enum(['income', 'expense']);
const transactionDateSchema = z.string().refine(isValidDateString, {
  error: 'Enter a valid date in YYYY-MM-DD format.',
});

const amountPaiseSchema = z.union([z.string(), z.number().finite()]).transform((value, context) => {
  let amountPaise;
  try {
    amountPaise = rupeesToPaise(value);
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'Enter a positive amount with no more than two decimals.',
    });
    return z.NEVER;
  }
  if (amountPaise <= 0) {
    context.addIssue({ code: 'custom', message: 'Amount must be greater than zero.' });
    return z.NEVER;
  }
  if (amountPaise > TRANSACTION_CONFIG.maxAmountPaise) {
    context.addIssue({ code: 'custom', message: 'Amount is above the permitted limit.' });
    return z.NEVER;
  }
  return amountPaise;
});

const createFields = {
  type: transactionTypeSchema,
  amount: amountPaiseSchema,
  categoryId: z.number().int().positive().safe(),
  description: z.string().trim().max(TRANSACTION_CONFIG.maxDescriptionLength).nullable().optional(),
  transactionDate: transactionDateSchema,
};

export const createTransactionSchema = z.object(createFields).transform(({ amount, ...body }) => ({
  ...body,
  amountPaise: amount,
}));

export const updateTransactionSchema = z
  .object({
    type: transactionTypeSchema.optional(),
    amount: amountPaiseSchema.optional(),
    categoryId: z.number().int().positive().safe().optional(),
    description: z
      .string()
      .trim()
      .max(TRANSACTION_CONFIG.maxDescriptionLength)
      .nullable()
      .optional(),
    transactionDate: transactionDateSchema.optional(),
    reason: z.string().trim().max(TRANSACTION_CONFIG.maxAuditReasonLength).nullable().optional(),
  })
  .transform(({ amount, ...body }) =>
    amount === undefined ? body : { ...body, amountPaise: amount },
  );

const amountFilterSchema = z.string().transform((value, context) => {
  try {
    return rupeesToPaise(value);
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'Enter an amount with no more than two decimals.',
    });
    return z.NEVER;
  }
});

const positiveIntegerQuery = z
  .string()
  .regex(/^\d+$/, { error: 'Enter a whole number.' })
  .transform(Number)
  .refine(Number.isSafeInteger, { error: 'Enter a valid whole number.' })
  .refine((value) => value > 0, { error: 'Enter a number greater than zero.' });

export const transactionListQuerySchema = z
  .object({
    type: transactionTypeSchema.optional(),
    categoryId: positiveIntegerQuery.optional(),
    from: transactionDateSchema.optional(),
    to: transactionDateSchema.optional(),
    q: z.string().trim().max(TRANSACTION_CONFIG.maxDescriptionLength).optional(),
    minAmount: amountFilterSchema.optional(),
    maxAmount: amountFilterSchema.optional(),
    sort: z.enum(['transactionDate', 'amount', 'createdAt']).default('transactionDate'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: positiveIntegerQuery.default(String(TRANSACTION_CONFIG.defaultPage)),
    pageSize: positiveIntegerQuery.default(String(TRANSACTION_CONFIG.defaultPageSize)),
    includeDeleted: z.enum(['true', 'false']).default('false'),
  })
  .superRefine((query, context) => {
    if (query.page < 1) {
      context.addIssue({ code: 'custom', path: ['page'], message: 'Page must be at least 1.' });
    }
    if (query.pageSize < 1 || query.pageSize > TRANSACTION_CONFIG.maxPageSize) {
      context.addIssue({
        code: 'custom',
        path: ['pageSize'],
        message: `Page size must be between 1 and ${TRANSACTION_CONFIG.maxPageSize}.`,
      });
    }
    if (query.from && query.to && query.from > query.to) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'End date must be on or after start date.',
      });
    }
    if (
      query.minAmount !== undefined &&
      query.maxAmount !== undefined &&
      query.minAmount > query.maxAmount
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maxAmount'],
        message: 'Maximum amount must be at least minimum amount.',
      });
    }
  })
  .transform(({ minAmount, maxAmount, includeDeleted, ...query }) => ({
    ...query,
    minAmountPaise: minAmount,
    maxAmountPaise: maxAmount,
    includeDeleted: includeDeleted === 'true',
  }));

export const includeDeletedQuerySchema = z
  .object({
    includeDeleted: z.enum(['true', 'false']).default('false'),
  })
  .transform(({ includeDeleted }) => ({ includeDeleted: includeDeleted === 'true' }));

export const transactionIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, { error: 'Invalid transaction id.' })
    .transform(Number)
    .refine(Number.isSafeInteger, { error: 'Invalid transaction id.' }),
});
