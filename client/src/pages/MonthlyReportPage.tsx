import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { analyticsApi } from '../services/analyticsApi';
import { formatINR } from '../utils/money';
import { useAuth } from '../contexts/AuthContext';
import { currentMonthInTimezone } from './budgetPageUtils';

export function MonthlyReportPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const month = params.get('month') ?? currentMonthInTimezone(user?.timezone ?? 'Asia/Kolkata');
  const report = useQuery({
    queryKey: ['analytics', 'report', month],
    queryFn: () => analyticsApi.report(month),
  });
  if (report.isLoading)
    return (
      <section className="mx-auto max-w-4xl">
        <div
          aria-label="Loading monthly report"
          className="h-96 animate-pulse rounded-2xl bg-white"
        />
      </section>
    );
  if (report.isError || !report.data)
    return (
      <section className="mx-auto max-w-4xl">
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          Could not load this monthly report.{' '}
          <button className="underline" onClick={() => void report.refetch()}>
            Retry
          </button>
        </p>
        <Link className="mt-4 inline-block underline" to="/dashboard">
          Back to dashboard
        </Link>
      </section>
    );
  const data = report.data;
  return (
    <article className="report-paper mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm md:p-10">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 pb-5">
        <div>
          <p className="text-sm font-medium text-brand-600">CoinXP monthly report</p>
          <h1 className="mt-1 text-3xl font-semibold">{month}</h1>
        </div>
        <Link className="print:hidden text-sm text-brand-700 underline" to={`/dashboard`}>
          Back to dashboard
        </Link>
      </header>
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ['Income', data.totals.income],
          ['Expenses', data.totals.expense],
          ['Net', data.totals.net],
        ].map(([label, value]) => (
          <div className="rounded-xl bg-canvas p-4" key={label}>
            <p className="text-sm text-ink-500">{label}</p>
            <p className="mt-2 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </section>
      <p className="mt-4 text-sm">
        Savings rate:{' '}
        {data.totals.savingsRateBps === null
          ? '—'
          : `${(data.totals.savingsRateBps / 100).toFixed(1)}%`}
      </p>
      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="font-semibold">Largest category increases</h2>
          <ChangeList rows={data.comparison.biggestIncreases} />
        </div>
        <div>
          <h2 className="font-semibold">Largest category decreases</h2>
          <ChangeList rows={data.comparison.biggestDecreases} />
        </div>
      </section>
      <section className="mt-8">
        <h2 className="font-semibold">Largest expense transactions</h2>
        <ul className="mt-2 divide-y divide-black/5">
          {data.topExpenseTransactions.map((row, i) => (
            <li key={i} className="flex justify-between gap-3 py-2 text-sm">
              <span>
                {String(row.transactionDate)} · {String(row.categoryName)}
                {row.description ? ` · ${String(row.description)}` : ''}
              </span>
              <strong>{String(row.amount)}</strong>
            </li>
          ))}
        </ul>
        {!data.topExpenseTransactions.length && (
          <p className="mt-2 text-sm text-ink-500">No expenses recorded.</p>
        )}
      </section>
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <InfoDay label="Busiest spending day" item={data.busiestDay} />
        <InfoDay label="Cheapest non-zero spending day" item={data.cheapestNonZeroDay} />
      </section>
      <section className="mt-8">
        <h2 className="font-semibold">Budget outcome</h2>
        <BudgetOutcome value={data.budgetOutcome} />
      </section>
      <p className="mt-8 rounded-xl bg-canvas p-4 text-sm">
        Tracking consistency: transactions were recorded on{' '}
        {data.trackingConsistency.daysWithTransactions} of {data.trackingConsistency.daysElapsed}{' '}
        elapsed days. This is informational only.
      </p>
    </article>
  );
}

function ChangeList({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <p className="mt-2 text-sm text-ink-500">No category changes.</p>;
  return (
    <ul className="mt-2 space-y-2">
      {rows.map((row, i) => (
        <li key={i} className="flex justify-between gap-2 text-sm">
          <span>{String(row.name)}</span>
          <span>{formatINR(Number(row.deltaPaise))}</span>
        </li>
      ))}
    </ul>
  );
}
function InfoDay({ label, item }: { label: string; item: Record<string, unknown> | null }) {
  return (
    <div className="rounded-xl border border-black/5 p-4">
      <h2 className="text-sm font-semibold">{label}</h2>
      <p className="mt-2 text-sm">
        {item ? `${String(item.date)} · ${String(item.expense)}` : 'No spending recorded'}
      </p>
    </div>
  );
}
function BudgetOutcome({ value }: { value: Record<string, unknown> }) {
  const monthly = value.monthlyTotal as Record<string, unknown> | null;
  const categories = (value.categories as Array<Record<string, unknown>> | undefined) ?? [];
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="rounded-xl bg-canvas p-3">
        <strong>Monthly total:</strong>{' '}
        {monthly
          ? `${String(monthly.spent)} spent of ${String(monthly.budget)} · ${String(monthly.status).replace('_', ' ')} (${String(monthly.source)})`
          : 'No monthly budget configured'}
      </p>
      {categories.map((row) => (
        <p className="rounded-xl bg-canvas p-3" key={String(row.categoryId)}>
          <strong>{String(row.name)}:</strong> {String(row.spent)} spent of {String(row.budget)} ·{' '}
          {String(row.status).replace('_', ' ')} ({String(row.source)})
        </p>
      ))}
    </div>
  );
}
