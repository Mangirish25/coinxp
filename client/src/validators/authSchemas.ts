import { z } from 'zod';
import { AUTH_FORM_RULES } from '../config/authConstants';

const email = z.string().trim().toLowerCase().email({ error: 'Enter a valid email address.' });
const password = z
  .string()
  .min(AUTH_FORM_RULES.passwordMinLength, {
    error: `Password must be at least ${AUTH_FORM_RULES.passwordMinLength} characters.`,
  })
  .max(AUTH_FORM_RULES.passwordMaxLength, {
    error: `Password must be ${AUTH_FORM_RULES.passwordMaxLength} characters or fewer.`,
  })
  .refine((value) => /\p{L}/u.test(value), { error: 'Password must contain at least one letter.' })
  .refine((value) => /[0-9]/.test(value), { error: 'Password must contain at least one number.' });

export const loginFormSchema = z.object({
  email,
  password: z
    .string()
    .min(1, { error: 'Enter your password.' })
    .max(AUTH_FORM_RULES.passwordMaxLength, {
      error: `Password must be ${AUTH_FORM_RULES.passwordMaxLength} characters or fewer.`,
    }),
});
export const registerFormSchema = z.object({
  email,
  password,
  displayName: z
    .string()
    .trim()
    .min(AUTH_FORM_RULES.displayNameMinLength, {
      error: `Display name must be at least ${AUTH_FORM_RULES.displayNameMinLength} characters.`,
    })
    .max(AUTH_FORM_RULES.displayNameMaxLength, {
      error: `Display name must be ${AUTH_FORM_RULES.displayNameMaxLength} characters or fewer.`,
    }),
});
