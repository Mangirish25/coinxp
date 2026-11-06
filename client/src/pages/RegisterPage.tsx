import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ApiError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { PasswordField } from '../components/PasswordField';
import { registerFormSchema } from '../validators/authSchemas';
import { getAuthReturnPath } from './authPageUtils';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; displayName?: string }>(
    {},
  );
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError('');
    const result = registerFormSchema.safeParse({ email, password, displayName });
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
        displayName: fieldErrors.displayName?.[0],
      });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await register({
        ...result.data,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      navigate(getAuthReturnPath(location.state), { replace: true });
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'Unable to create your account right now.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-md pt-4 md:pt-12"
    >
      <div className="rounded-card border border-black/5 bg-white p-6 shadow-sm md:p-8">
        <p className="text-sm font-medium text-brand-600">Start with one small step</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          Your financial activity stays yours and is built around your local time.
        </p>
        {serverError && (
          <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-800">
            {serverError}
          </p>
        )}
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="register-name"
              className="mb-1.5 block text-sm font-medium text-ink-700"
            >
              Display name
            </label>
            <input
              id="register-name"
              name="displayName"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              required
              minLength={2}
              maxLength={40}
              aria-invalid={Boolean(errors.displayName)}
              aria-describedby={errors.displayName ? 'register-name-error' : undefined}
              className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-ink-500/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-rose-400"
            />
            {errors.displayName && (
              <p id="register-name-error" className="mt-1.5 text-xs text-rose-700">
                {errors.displayName}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="register-email"
              className="mb-1.5 block text-sm font-medium text-ink-700"
            >
              Email
            </label>
            <input
              id="register-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'register-email-error' : undefined}
              className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-ink-500/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-rose-400"
            />
            {errors.email && (
              <p id="register-email-error" className="mt-1.5 text-xs text-rose-700">
                {errors.email}
              </p>
            )}
          </div>
          <PasswordField
            id="register-password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            error={errors.password}
          />
          <p className="-mt-3 text-xs text-ink-500">
            Use 8–128 characters with at least one letter and one number.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-brand-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </motion.section>
  );
}
