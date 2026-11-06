import { z } from 'zod';
import { AUTH_CONFIG } from '../config/authConstants.js';

const emailSchema = z
  .string({
    error: (issue) =>
      issue.input === undefined ? 'Enter your email address.' : 'Email must be text.',
  })
  .trim()
  .toLowerCase()
  .email({ error: 'Enter a valid email address.' });

export const registerSchema = z.object({
  email: emailSchema,
  password: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Enter a password.' : 'Password must be text.',
    })
    .min(AUTH_CONFIG.passwordMinLength, {
      error: `Password must be at least ${AUTH_CONFIG.passwordMinLength} characters.`,
    })
    .max(AUTH_CONFIG.passwordMaxLength, {
      error: `Password must be ${AUTH_CONFIG.passwordMaxLength} characters or fewer.`,
    })
    .superRefine((password, context) => {
      if (!/\p{L}/u.test(password)) {
        context.addIssue({
          code: 'custom',
          message: 'Password must contain at least one letter.',
        });
      }
      if (!/[0-9]/.test(password)) {
        context.addIssue({
          code: 'custom',
          message: 'Password must contain at least one number.',
        });
      }
    }),
  displayName: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Enter a display name.' : 'Display name must be text.',
    })
    .trim()
    .min(AUTH_CONFIG.displayNameMinLength, {
      error: `Display name must be at least ${AUTH_CONFIG.displayNameMinLength} characters.`,
    })
    .max(AUTH_CONFIG.displayNameMaxLength, {
      error: `Display name must be ${AUTH_CONFIG.displayNameMaxLength} characters or fewer.`,
    }),
  timezone: z
    .string()
    .max(AUTH_CONFIG.timezoneMaxLength, { error: 'Timezone is too long.' })
    .optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Enter your password.' : 'Password must be text.',
    })
    .min(1, { error: 'Enter your password.' })
    .max(AUTH_CONFIG.passwordMaxLength, {
      error: `Password must be ${AUTH_CONFIG.passwordMaxLength} characters or fewer.`,
    }),
});

export const logoutSchema = z.object({});
