import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Plus, Tag } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { analyticsApi } from '../services/analyticsApi';
import { dashboardApi } from '../services/dashboardApi';
import { formatINR } from '../utils/money';
import { MonthSelector } from '../components/MonthSelector';
import { currentMonthInTimezone } from './budgetPageUtils';

const card = 'rounded-2xl border border-black/5 bg-white p-5 shadow-sm';
const palette = ['#0f766e', '#2563eb', '#9333ea', '#ea580c', '#be123c', '#475569'];
const money = (value: number) => formatINR(value);
const axisMoney = (value: number) => money(Math.round(value));

function GamificationSummarySlot() {
  // future: XP, level and streak summary
  return null;
}

function SectionError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
      This section could not load.{' '}
      <button className="ml-1 underline" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-label="Loading dashboard section"
      className={`animate-pulse rounded-2xl bg-white/80 ${className}`}
    />
  );
}
function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-3">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.max(0, value))}
        className="h-2 overflow-hidden rounded-full bg-canvas"
      >
        <div
          className="h-full rounded-full bg-brand-600"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-ink-500">
        {label}: {value.toFixed(1)}%
      </p>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() =>
    currentMonthInTimezone(user?.timezone ?? 'Asia/Kolkata'),
  );
  useEffect(() => {
    if (user?.timezone) setMonth(currentMonthInTimezone(user.timezone));
  }, [user?.timezone]);
  const [reducedMotion] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [monthYear, monthNumber] = month.split('-').map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(monthYear, monthNumber, 0)).getUTCDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  const summary = useQuery({
    queryKey: ['dashboard', 'summary', month],
    queryFn: () => dashboardApi.summary(month),
  });
  const breakdown = useQuery({
    queryKey: ['analytics', 'breakdown', from, to],
    queryFn: () => analyticsApi.breakdown(from, to),
  });
  const daily = useQuery({
    queryKey: ['analytics', 'daily', from, to],
    queryFn: () => analyticsApi.daily(from, to),
  });
  const monthly = useQuery({
    queryKey: ['analytics', 'monthly', 6],
    queryFn: () => analyticsApi.monthly(6),
  });
  const categoryChart = useMemo(() => breakdown.data?.items ?? [], [breakdown.data]);
  const dailyChart = daily.data?.days ?? [];
  const empty =
    summary.data?.transactionCount === 0 && summary.data.recentTransactions.length === 0;

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-600">Your money, in context</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-sm text-ink-500">
            A live view based on your recorded transactions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelector month={month} onChange={setMonth} label="Dashboard month selector" />
          <Link
            className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium"
            to={`/monthly-report?month=${month}`}
          >
            View monthly report
          </Link>
        </div>
      </header>
      {empty && (
        <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
          <h2 className="font-semibold">Your dashboard is ready when you are</h2>
          <p className="mt-1 text-sm text-ink-600">
            Add a transaction to see your income, spending, category breakdowns, and trends here.
          </p>
          <button
            onClick={() => navigate('/transactions?new=1')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={16} /> Add your first transaction
          </button>
        </div>
      )}
      {!empty &&
        (summary.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((x) => (
              <Skeleton key={x} className="h-36" />
            ))}
          </div>
        ) : summary.isError ? (
          <SectionError retry={() => void summary.refetch()} />
        ) : (
          summary.data && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat title="Total balance" value={summary.data.totalBalance} detail="All time" />
                <Stat
                  title="Month income"
                  value={summary.data.monthIncome}
                  detail={`${signedMoney(summary.data.comparison.incomeDeltaPaise)} vs previous month`}
                  positive={summary.data.comparison.incomeDeltaPaise >= 0}
                />
                <Stat
                  title="Month expenses"
                  value={summary.data.monthExpense}
                  detail={
                    summary.data.comparison.expenseChangeBps === null
                      ? 'No previous-month baseline'
                      : `${(Math.abs(summary.data.comparison.expenseChangeBps) / 100).toFixed(1)}% ${summary.data.comparison.expenseChangeBps > 0 ? 'more' : 'less'} than last month`
                  }
                  positive={
                    summary.data.comparison.expenseChangeBps !== null &&
                    summary.data.comparison.expenseChangeBps < 0
                  }
                />
                <div className={card}>
                  <p className="text-sm text-ink-500">Remaining budget</p>
                  {summary.data.budget.monthlyTotal ? (
                    <>
                      <p className="mt-3 text-2xl font-semibold tabular-nums">
                        {money(summary.data.budget.remainingPaise ?? 0)}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        {summary.data.budget.monthlyTotal.status.replace('_', ' ')}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-sm">No monthly budget is set.</p>
                      <Link
                        className="mt-2 inline-block text-sm font-medium text-brand-700 underline"
                        to="/budgets"
                      >
                        Set a budget
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <section className={`${card} lg:col-span-2`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-semibold">Today</h2>
                      <p className="mt-1 text-sm text-ink-500">
                        {summary.data.today.date} · independent of selected month
                      </p>
                    </div>
                    <span className="text-sm font-medium capitalize">
                      {summary.data.today.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-5 text-2xl font-semibold">
                    {money(summary.data.today.spentPaise)}{' '}
                    <span className="text-sm font-normal text-ink-500">spent</span>
                  </p>
                  {summary.data.today.dailyLimitPaise === null ? (
                    <Link
                      className="mt-2 inline-block text-sm text-brand-700 underline"
                      to="/budgets"
                    >
                      Set a daily limit
                    </Link>
                  ) : (
                    <>
                      <Progress
                        value={summary.data.today.percentUsed ?? 0}
                        label="Daily limit used"
                      />
                      <p className="mt-2 text-sm text-ink-500">
                        Limit {money(summary.data.today.dailyLimitPaise)} · remaining{' '}
                        {money(summary.data.today.remainingPaise ?? 0)}
                      </p>
                    </>
                  )}
                </section>
                <section className={card}>
                  <h2 className="font-semibold">Safe to spend</h2>
                  {summary.data.budget.safeDailySpendPaise === null ? (
                    <p className="mt-3 text-sm text-ink-500">
                      Available for the current month when a monthly budget is set.
                    </p>
                  ) : (
                    <p className="mt-3 text-sm">
                      You can spend about{' '}
                      <strong>{money(summary.data.budget.safeDailySpendPaise)}</strong> per day for
                      the rest of the month.
                    </p>
                  )}
                  <p className="mt-3 text-xs text-ink-500">
                    Average daily expense for this month:{' '}
                    {money(summary.data.averageDailySpendPaise)}
                  </p>
                </section>
              </div>
            </>
          )
        ))}
      <GamificationSummarySlot />
      {!empty && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className={card}>
            <h2 className="font-semibold">Spending by category</h2>
            <p className="mt-1 text-xs text-ink-500">
              Category labels include amounts and percentage shares.
            </p>
            {breakdown.isLoading ? (
              <Skeleton className="mt-4 h-72" />
            ) : breakdown.isError ? (
              <SectionError retry={() => void breakdown.refetch()} />
            ) : !categoryChart.length ? (
              <p className="py-12 text-center text-sm text-ink-500">
                No category spending in this month.
              </p>
            ) : (
              <>
                <div
                  className="h-64"
                  role="img"
                  aria-label={`Donut chart of ${categoryChart.length} expense categories; values are listed below`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryChart}
                        dataKey="amountPaise"
                        nameKey="name"
                        innerRadius="48%"
                        outerRadius="78%"
                        isAnimationActive={!reducedMotion}
                      >
                        {categoryChart.map((row, i) => (
                          <Cell key={row.categoryId} fill={palette[i % palette.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => money(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="grid gap-2 text-sm sm:grid-cols-2">
                  {categoryChart.map((row, i) => (
                    <li key={row.categoryId} className="flex justify-between gap-3">
                      <span>
                        <i
                          aria-hidden="true"
                          className="mr-2 inline-block h-3 w-3 rounded-sm"
                          style={{ backgroundColor: palette[i % palette.length] }}
                        />
                        {row.name}
                      </span>
                      <span className="tabular-nums">
                        {money(row.amountPaise)} · {(row.shareBps / 100).toFixed(2)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <section className={card}>
            <h2 className="font-semibold">Daily spending</h2>
            <p className="mt-1 text-xs text-ink-500">
              Daily expenses shown in your selected month. The table below also lists income.
            </p>
            {daily.isLoading ? (
              <Skeleton className="mt-4 h-72" />
            ) : daily.isError ? (
              <SectionError retry={() => void daily.refetch()} />
            ) : (
              <>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChart}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(-2)} />
                      <YAxis tickFormatter={axisMoney} />
                      <Tooltip
                        labelFormatter={(v) => String(v)}
                        formatter={(v) => money(Number(v))}
                      />
                      {dailyChart.some((d) => d.dailyLimitPaise !== null) && (
                        <ReferenceLine
                          y={
                            dailyChart.find((d) => d.dailyLimitPaise !== null)?.dailyLimitPaise ?? 0
                          }
                          stroke="#b45309"
                          strokeDasharray="5 4"
                          label="Daily limit"
                        />
                      )}
                      <Bar
                        dataKey="expensePaise"
                        name="Expenses"
                        fill="#0f766e"
                        isAnimationActive={!reducedMotion}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    View daily values
                  </summary>
                  <div className="max-h-44 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Expenses</th>
                          <th>Income</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyChart.map((d) => (
                          <tr key={d.date}>
                            <td>{d.date}</td>
                            <td>{money(d.expensePaise)}</td>
                            <td>{money(d.incomePaise)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </section>
          <section className={card}>
            <h2 className="font-semibold">Income vs expenses</h2>
            <p className="mt-1 text-xs text-ink-500">
              Six-month comparison. Monthly values are listed in the chart data table.
            </p>
            {monthly.isLoading ? (
              <Skeleton className="mt-4 h-72" />
            ) : monthly.isError ? (
              <SectionError retry={() => void monthly.refetch()} />
            ) : (
              <>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={axisMoney} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Legend />
                      <Bar
                        dataKey="incomePaise"
                        name="Income"
                        fill="#2563eb"
                        isAnimationActive={!reducedMotion}
                      />
                      <Bar
                        dataKey="expensePaise"
                        name="Expenses"
                        fill="#ea580c"
                        isAnimationActive={!reducedMotion}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="sr-only">
                  <table>
                    <caption>Income and expense totals for the last six months</caption>
                    <thead>
                      <tr>
                        <th scope="col">Month</th>
                        <th scope="col">Income</th>
                        <th scope="col">Expenses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.data?.map((row) => (
                        <tr key={row.month}>
                          <th>{row.month}</th>
                          <td>{money(row.incomePaise)}</td>
                          <td>{money(row.expensePaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
          <section className={card}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Top categories</h2>
              <Link to="/transactions" className="text-sm text-brand-700 underline">
                View transactions
              </Link>
            </div>
            {summary.isLoading ? (
              <Skeleton className="mt-4 h-48" />
            ) : summary.isError ? (
              <SectionError retry={() => void summary.refetch()} />
            ) : !summary.data?.topCategories.length ? (
              <p className="mt-4 text-sm text-ink-500">No spending categories for this month.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {summary.data.topCategories.map((c, i) => (
                  <li key={c.categoryId} className="flex justify-between gap-3 text-sm">
                    <span>
                      <Tag aria-hidden="true" size={14} className="mr-2 inline text-ink-400" />
                      {i + 1}. {c.name}
                    </span>
                    <span className="tabular-nums">
                      {money(c.spentPaise)} · {(c.shareBps / 100).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
      {!empty && (
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent transactions</h2>
            <Link
              to="/transactions"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-700"
            >
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {summary.data?.recentTransactions.length ? (
            <ul className="mt-3 divide-y divide-black/5">
              {summary.data.recentTransactions.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    <Tag aria-hidden="true" size={15} className="mr-2 inline text-ink-400" />
                    <strong className="font-medium">{row.categoryName}</strong>
                    <span className="ml-2 text-ink-500">
                      {row.transactionDate}
                      {row.description ? ` · ${row.description}` : ''}
                    </span>
                  </span>
                  <strong className={row.type === 'income' ? 'text-emerald-700' : 'text-ink-900'}>
                    {row.type === 'income' ? '+' : '−'}
                    {money(row.amountPaise)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : summary.isLoading ? (
            <Skeleton className="mt-4 h-48" />
          ) : summary.isError ? (
            <SectionError retry={() => void summary.refetch()} />
          ) : (
            <p className="mt-4 text-sm text-ink-500">Your recent transactions will appear here.</p>
          )}
        </section>
      )}
    </section>
  );
}

function Stat({
  title,
  value,
  detail,
  positive,
}: {
  title: string;
  value: string;
  detail: string;
  positive?: boolean;
}) {
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <section className={card}>
      <p className="text-sm text-ink-500">{title}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-2 flex items-center gap-1 text-xs text-ink-500">
        {title !== 'Total balance' && <Icon aria-hidden="true" size={14} />}
        {detail}
      </p>
    </section>
  );
}
function signedMoney(value: number) {
  return `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`;
}
