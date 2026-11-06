import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Plus, Tag, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../services/api';
import { budgetApi } from '../services/budgetApi';
import { subscribeBudgetStatusInvalidation } from '../services/budgetInvalidation';
import { categoryApi } from '../services/categoryApi';
import type {
  BudgetRow,
  BudgetScope,
  BudgetStatusResult,
  DailyBudgetStatus,
} from '../types/budget';
import type { Category } from '../types/transaction';
import { formatINR } from '../utils/money';
import { MonthSelector } from '../components/MonthSelector';
import {
  budgetPeriodForChoice,
  currentMonthInTimezone,
  validateBudgetAmount,
} from './budgetPageUtils';

const fieldClass =
  'rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const statusCopy = {
  on_track: 'On track',
  warning: 'Near limit',
  exceeded: 'Over budget',
  no_budget: 'No budget set',
} as const;

export function BudgetsPage() {
  const { user } = useAuth();
  const timezone = user?.timezone ?? 'Asia/Kolkata';
  const [month, setMonth] = useState(() => currentMonthInTimezone(timezone));
  const [status, setStatus] = useState<BudgetStatusResult | null>(null);
  const [daily, setDaily] = useState<DailyBudgetStatus | null>(null);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{
    scope: BudgetScope;
    categoryId?: number;
    amount?: string;
    mode?: 'default' | 'month';
    availableOnly?: boolean;
  } | null>(null);

  useEffect(() => {
    if (user?.timezone) setMonth(currentMonthInTimezone(user.timezone));
  }, [user?.timezone]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [budgetStatus, dailyStatus, budgetRows, categoryRows] = await Promise.all([
        budgetApi.status(month),
        budgetApi.dailyStatus(),
        budgetApi.list(),
        categoryApi.list('expense'),
      ]);
      setStatus(budgetStatus);
      setDaily(dailyStatus);
      setRows(budgetRows);
      setCategories(categoryRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load budgets.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(
    () =>
      subscribeBudgetStatusInvalidation(() => {
        void refresh();
      }),
    [refresh],
  );

  const unbudgetedHasSpend = Boolean(status?.unbudgetedSpending.categories.length);
  const budgetedIds = new Set(status?.categories.map((item) => item.categoryId) ?? []);
  const availableCategory = categories.filter((category) => !budgetedIds.has(category.id));
  const configuredCount = rows.length;

  async function removeBudget(row: BudgetRow) {
    const label =
      row.scope === 'category_monthly'
        ? row.categoryName
        : row.scope === 'monthly_total'
          ? 'monthly total'
          : 'daily limit';
    if (!window.confirm(`Remove this ${label} budget?`)) return;
    try {
      await budgetApi.delete(row.id);
      setNotice('Budget removed.');
      await refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Could not remove budget.');
    }
  }

  async function saved() {
    setEditor(null);
    setNotice('Budget saved.');
    await refresh();
  }

  return (
    <section className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-600">Plan your spending</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Budgets</h1>
          <p className="mt-2 text-sm text-ink-500">
            Spending is calculated from your non-deleted expense transactions.
          </p>
        </div>
        <MonthSelector month={month} onChange={setMonth} label="Budget month selector" />
      </header>
      {notice && (
        <p role="status" className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}{' '}
          <button className="underline" onClick={() => void refresh()}>
            Retry
          </button>
        </p>
      )}
      {loading ? (
        <div aria-label="Loading budgets" className="mt-7 grid gap-4 md:grid-cols-2">
          <div className="h-56 animate-pulse rounded-2xl bg-white" />
          <div className="h-56 animate-pulse rounded-2xl bg-white" />
        </div>
      ) : (
        status && (
          <>
            {status.warnings.map((warning) => (
              <div
                key={warning.code}
                role="status"
                className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
              >
                <AlertTriangle size={18} className="shrink-0" />
                <p>{warning.message}</p>
              </div>
            ))}
            {configuredCount === 0 && (
              <div className="mt-5 rounded-2xl border border-dashed border-black/15 bg-white p-5 text-sm text-ink-600">
                Set your first monthly or daily budget below. You can add category limits as well.
              </div>
            )}
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Monthly total</h2>
                    <p className="mt-1 text-xs text-ink-500">
                      {status.monthlyTotal
                        ? status.monthlyTotal.source === 'month'
                          ? 'This month’s override'
                          : 'Default for all months'
                        : 'No budget configured'}
                    </p>
                  </div>
                  <button
                    className="rounded-lg px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                    onClick={() =>
                      setEditor({
                        scope: 'monthly_total',
                        amount: status.monthlyTotal?.budget
                          ? status.monthlyTotal.budget.replace(/^₹/, '').replaceAll(',', '')
                          : undefined,
                        mode: status.monthlyTotal?.source === 'month' ? 'month' : 'default',
                      })
                    }
                  >
                    {status.monthlyTotal ? 'Change' : 'Set budget'}
                  </button>
                </div>
                {status.monthlyTotal ? (
                  <>
                    <div className="mt-6 flex items-end justify-between gap-3">
                      <strong className="text-2xl tabular-nums">
                        {status.monthlyTotal.budget}
                      </strong>
                      <span className="text-sm text-ink-500">
                        Spent {status.monthlyTotal.spent}
                      </span>
                    </div>
                    <Progress
                      percent={status.monthlyTotal.percentUsed}
                      status={status.monthlyTotal.status}
                    />
                    <p className="mt-3 text-sm font-medium">
                      {status.monthlyTotal.remainingPaise < 0
                        ? `Over budget by ${formatINR(status.monthlyTotal.remainingPaise).replace('-', '')}`
                        : `${status.monthlyTotal.remaining} remaining`}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {status.daysElapsed} complete days · {status.daysRemaining} days remaining
                      including today
                    </p>
                    {status.safeDailySpendPaise !== undefined && (
                      <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm">
                        Suggested daily pace:{' '}
                        <strong>{formatINR(status.safeDailySpendPaise)}</strong>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-6 text-sm text-ink-500">No monthly total budget is set.</p>
                )}
              </section>

              <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Daily limit</h2>
                    <p className="mt-1 text-xs text-ink-500">
                      {daily?.source === 'month'
                        ? 'Current month override'
                        : daily
                          ? 'Default for all months'
                          : 'No daily limit'}
                    </p>
                  </div>
                  <button
                    className="rounded-lg px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                    onClick={() =>
                      setEditor({
                        scope: 'daily_limit',
                        amount: rows.find(
                          (row) => row.scope === 'daily_limit' && row.month === null,
                        )?.amount,
                        mode: 'default',
                      })
                    }
                  >
                    {daily ? 'Change' : 'Set limit'}
                  </button>
                </div>
                <div className="mt-6 flex items-end justify-between">
                  <strong className="text-2xl tabular-nums">{daily?.limit ?? 'Not set'}</strong>
                  <span className="text-sm text-ink-500">Today {daily?.spent ?? '—'}</span>
                </div>
                {daily && (
                  <>
                    <Progress percent={daily.percentUsed} status={daily.status} />
                    <p className="mt-3 text-sm">
                      {daily.remainingPaise === null
                        ? 'No limit to compare'
                        : daily.remainingPaise < 0
                          ? `Over by ${formatINR(daily.remainingPaise).replace('-', '')}`
                          : `${daily.remaining} remaining today`}
                    </p>
                  </>
                )}
              </section>
            </div>

            <section className="mt-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Category budgets</h2>
                  <p className="mt-1 text-xs text-ink-500">
                    Limits apply to expense categories only.
                  </p>
                </div>
                <button
                  disabled={!availableCategory.length}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  onClick={() =>
                    setEditor({
                      scope: 'category_monthly',
                      categoryId: availableCategory[0]?.id,
                      availableOnly: true,
                    })
                  }
                >
                  <Plus size={16} /> Add category budget
                </button>
              </header>
              {status.categories.length ? (
                <ul className="mt-4 divide-y divide-black/5">
                  {status.categories.map((item) => (
                    <li className="py-4" key={item.categoryId}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Tag size={17} className="text-ink-400" />
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-ink-500">
                              {item.source === 'month'
                                ? 'This month’s override'
                                : 'Default for all months'}
                            </p>
                          </div>
                        </div>
                        <button
                          className="text-sm font-medium text-brand-700 underline"
                          onClick={() =>
                            setEditor({
                              scope: 'category_monthly',
                              categoryId: item.categoryId,
                              amount: item.budget.replace(/^₹/, '').replaceAll(',', ''),
                              mode: item.source === 'month' ? 'month' : 'default',
                            })
                          }
                        >
                          Change
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
                        <span>
                          Spent {item.spent} of {item.budget}
                        </span>
                        <Status status={item.status} percent={item.percentUsed} />
                      </div>
                      <Progress percent={item.percentUsed} status={item.status} />
                      {item.remainingPaise < 0 && (
                        <p className="mt-2 text-sm font-medium">
                          Over budget by {formatINR(item.remainingPaise)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 text-sm text-ink-500">
                  No category budgets for this month. Add one to keep a closer eye on a specific
                  area.
                </p>
              )}
            </section>

            {unbudgetedHasSpend && (
              <section className="mt-5 rounded-2xl border border-black/5 bg-white p-5">
                <h2 className="font-semibold">Unbudgeted spending</h2>
                <p className="mt-1 text-sm text-ink-500">
                  {status.unbudgetedSpending.spent} across categories without a limit
                </p>
                <ul className="mt-3 divide-y divide-black/5">
                  {status.unbudgetedSpending.categories.map((item) => (
                    <li className="flex justify-between py-2 text-sm" key={item.categoryId}>
                      <span>{item.name}</span>
                      <span className="font-medium">{item.spent}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {rows.length > 0 && (
              <details className="mt-5 rounded-2xl border border-black/5 bg-white p-5">
                <summary className="cursor-pointer text-sm font-semibold">
                  Configured budgets and overrides
                </summary>
                <ul className="mt-3 divide-y divide-black/5">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                    >
                      <span>
                        {row.scope === 'monthly_total'
                          ? 'Monthly total'
                          : row.scope === 'daily_limit'
                            ? 'Daily limit'
                            : row.categoryName}{' '}
                        · {row.month ?? 'Default for all months'} · {row.amount}
                      </span>
                      <span className="flex items-center gap-3">
                        <button
                          className="text-brand-700 underline"
                          onClick={() => {
                            if (row.month) setMonth(row.month);
                            setEditor({
                              scope: row.scope,
                              categoryId: row.categoryId ?? undefined,
                              amount: row.amount,
                              mode: row.month === null ? 'default' : 'month',
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          aria-label={`Delete budget ${row.id}`}
                          className="rounded-lg p-2 text-ink-500 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void removeBudget(row)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )
      )}
      {editor && (
        <BudgetEditor
          key={`${editor.scope}-${editor.categoryId ?? ''}-${editor.mode ?? ''}`}
          month={month}
          scope={editor.scope}
          categories={editor.availableOnly ? availableCategory : categories}
          categoryId={editor.categoryId}
          initialAmount={editor.amount}
          initialMode={editor.mode ?? 'month'}
          onClose={() => setEditor(null)}
          onSaved={() => void saved()}
        />
      )}
    </section>
  );
}

function Progress({
  percent,
  status,
}: {
  percent: number | null;
  status: keyof typeof statusCopy;
}) {
  const value = percent === null ? (status === 'exceeded' ? 100 : 0) : Math.min(percent, 100);
  return (
    <div className="mt-4">
      <div className="h-2.5 overflow-hidden rounded-full bg-canvas">
        <div
          role="progressbar"
          aria-label="Budget used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          className={`h-full rounded-full transition-[width] duration-500 ${status === 'exceeded' ? 'bg-red-500' : status === 'warning' ? 'bg-amber-500' : 'bg-brand-500'}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <Status status={status} percent={percent} />
    </div>
  );
}

function Status({ status, percent }: { status: keyof typeof statusCopy; percent: number | null }) {
  return (
    <p className="mt-2 text-xs font-medium text-ink-600">
      {statusCopy[status]}
      {percent === null ? '' : ` · ${percent.toFixed(1)}% used`}
    </p>
  );
}

function BudgetEditor({
  month,
  scope,
  categories,
  categoryId: initialCategoryId,
  initialAmount,
  initialMode,
  onClose,
  onSaved,
}: {
  month: string;
  scope: BudgetScope;
  categories: Category[];
  categoryId?: number;
  initialAmount?: string;
  initialMode: 'default' | 'month';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(initialAmount ?? '');
  const [categoryId, setCategoryId] = useState(String(initialCategoryId ?? ''));
  const [mode, setMode] = useState<'default' | 'month'>(initialMode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const title =
    scope === 'monthly_total'
      ? 'Monthly total budget'
      : scope === 'daily_limit'
        ? 'Daily spending limit'
        : 'Category budget';
  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateBudgetAmount(amount);
    if (validation) {
      setError(validation);
      return;
    }
    if (scope === 'category_monthly' && !categoryId) {
      setError('Choose an expense category.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await budgetApi.save({
        scope,
        amount,
        ...(scope === 'category_monthly' ? { categoryId: Number(categoryId) } : {}),
        month: budgetPeriodForChoice(mode, month),
      });
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : reason instanceof Error
            ? reason.message
            : 'Could not save budget.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
          {scope === 'category_monthly' && (
            <label className="block text-sm font-medium">
              Expense category
              <select
                className={`${fieldClass} mt-1 w-full`}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Choose category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm font-medium">
            Amount (₹)
            <input
              autoFocus
              className={`${fieldClass} mt-1 w-full`}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">When should this budget apply?</legend>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="budget-period"
                checked={mode === 'default'}
                onChange={() => setMode('default')}
              />
              <span>Set as default for all months</span>
            </label>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="budget-period"
                checked={mode === 'month'}
                onChange={() => setMode('month')}
              />
              <span>Only for {month}</span>
            </label>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className={`${fieldClass}`} onClick={onClose}>
              Cancel
            </button>
            <button
              disabled={busy}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save budget'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
