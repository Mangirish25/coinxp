import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ApiError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { PasswordField } from '../components/PasswordField';
import { loginFormSchema } from '../validators/authSchemas';
import { getAuthReturnPath } from './authPageUtils';

export function LoginPage() {
  const { login, restoreAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(false);
  const deletionScheduledNotice = typeof location.state === 'object' && location.state !== null &&
    'accountDeletionScheduled' in location.state && location.state.accountDeletionScheduled === true;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError('');
    const result = loginFormSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({ email: fieldErrors.email?.[0], password: fieldErrors.password?.[0] });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await login(result.data);
      navigate(getAuthReturnPath(location.state), { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ACCOUNT_PENDING_DELETION') setPendingDeletion(true);
      setServerError(error instanceof ApiError ? error.message : 'Unable to sign in right now.');
    } finally {
      setSubmitting(false);
    }
  }

  async function restore() {
    setSubmitting(true);
    try {
      await restoreAccount();
      navigate(getAuthReturnPath(location.state), { replace: true });
    } catch (error) { setServerError(error instanceof ApiError ? error.message : 'Could not restore your account.'); }
    finally { setSubmitting(false); }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-md pt-4 md:pt-12"
    >
      <div className="rounded-card border border-black/5 bg-white p-6 shadow-sm md:p-8">
        <p className="text-sm font-medium text-brand-600">Welcome back</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in to CoinXP</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          Continue building steady, thoughtful money habits.
        </p>
        {deletionScheduledNotice && <p role="status" className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-950">Deletion is scheduled. Sign in during the next 30 days to restore your account.</p>}
        {serverError && (
          <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-800">
            {serverError}
          </p>
        )}
        {pendingDeletion && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm text-amber-950">Your account is in its deletion grace period. Restoring keeps your existing data.</p><button type="button" disabled={submitting} onClick={() => void restore()} className="mt-3 min-h-11 rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{submitting ? 'Restoring…' : 'Restore account'}</button></div>}
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-ink-700">
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-ink-500/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-rose-400"
            />
            {errors.email && (
              <p id="login-email-error" className="mt-1.5 text-xs text-rose-700">
                {errors.email}
              </p>
            )}
          </div>
          <PasswordField
            id="login-password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            error={errors.password}
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-brand-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-500">
          New to CoinXP?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </motion.section>
  );
}
