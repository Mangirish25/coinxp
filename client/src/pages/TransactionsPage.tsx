import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  CalendarClock,
  Clock3,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../services/api';
import { categoryApi } from '../services/categoryApi';
import { transactionApi } from '../services/transactionApi';
import { formatINR } from '../utils/money';
import type { AuditEntry, Category, Transaction, TransactionList } from '../types/transaction';
import { validateTransactionForm, withTransactionFilter } from './transactionPageUtils';

const control =
  'rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const todayFor = (timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export function TransactionsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<TransactionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState(searchParams.get('q') ?? '');
  const [editing, setEditing] = useState<Transaction | null | false>(false);
  const [history, setHistory] = useState<{
    transaction: Transaction;
    entries: AuditEntry[];
  } | null>(null);
  const [undoId, setUndoId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const currentPage = Number(searchParams.get('page') || '1');
  const queryKey = searchParams.toString();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [transactions, categoryRows] = await Promise.all([
        transactionApi.list(new URLSearchParams(queryKey)),
        categoryApi.list(),
      ]);
      setResult(transactions);
      setCategories(categoryRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load transactions.');
    } finally {
      setLoading(false);
    }
  }, [queryKey]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setSearchText(searchParams.get('q') ?? '');
  }, [searchParams]);
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setEditing(null);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          const value = searchText.trim();
          if (value) next.set('q', value);
          else next.delete('q');
          next.delete('page');
          return next;
        }),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [searchText, setSearchParams]);

  function setFilter(key: string, value: string) {
    setSearchParams((prev) => withTransactionFilter(prev, key, value));
  }

  async function remove(row: Transaction) {
    if (!window.confirm(`Delete this ${row.type} transaction of ${formatINR(row.amountPaise)}?`))
      return;
    try {
      await transactionApi.delete(row.id);
      setUndoId(row.id);
      setNotice('Transaction deleted.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Could not delete transaction.');
    }
  }

  async function undo() {
    if (!undoId) return;
    try {
      await transactionApi.restore(undoId);
      setNotice('Transaction restored.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Could not restore transaction.');
    } finally {
      setUndoId(null);
    }
  }

  async function showHistory(row: Transaction) {
    try {
      setHistory({ transaction: row, entries: await transactionApi.history(row.id) });
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Could not load history.');
    }
  }

  return (
    <section className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-600">Your records</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Transactions</h1>
          <p className="mt-2 text-sm text-ink-500">
            Track each movement of money, with a complete change history.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          onClick={() => setEditing(null)}
        >
          <Plus size={17} /> Add transaction
        </button>
      </header>

      <div className="mt-7 grid gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:grid-cols-6">
        <label className="relative md:col-span-2">
          <span className="sr-only">Search description</span>
          <Search size={16} className="absolute left-3 top-3 text-ink-400" />
          <input
            className={`${control} w-full pl-9`}
            placeholder="Search descriptions"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </label>
        <select
          aria-label="Transaction type"
          className={control}
          value={searchParams.get('type') ?? ''}
          onChange={(e) => setFilter('type', e.target.value)}
        >
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select
          aria-label="Category"
          className={control}
          value={searchParams.get('categoryId') ?? ''}
          onChange={(e) => setFilter('categoryId', e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          aria-label="From date"
          className={control}
          type="date"
          value={searchParams.get('from') ?? ''}
          onChange={(e) => setFilter('from', e.target.value)}
        />
        <input
          aria-label="To date"
          className={control}
          type="date"
          value={searchParams.get('to') ?? ''}
          onChange={(e) => setFilter('to', e.target.value)}
        />
        <label className="text-xs text-ink-500 md:col-span-2">
          Sort by{' '}
          <select
            className={`${control} ml-2`}
            value={searchParams.get('sort') ?? 'transactionDate'}
            onChange={(e) => setFilter('sort', e.target.value)}
          >
            <option value="transactionDate">Transaction date</option>
            <option value="amount">Amount</option>
            <option value="createdAt">Date entered</option>
          </select>
        </label>
        <label className="text-xs text-ink-500">
          Order{' '}
          <select
            className={`${control} ml-2`}
            value={searchParams.get('order') ?? 'desc'}
            onChange={(e) => setFilter('order', e.target.value)}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
      </div>

      {notice && (
        <div
          role="status"
          className="mt-4 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800"
        >
          {notice}
          {undoId && (
            <button className="font-semibold underline" onClick={() => void undo()}>
              Undo
            </button>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          {error}{' '}
          <button className="ml-2 underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {loading ? (
        <div aria-label="Loading transactions" className="mt-6 space-y-3">
          {[1, 2, 3].map((x) => (
            <div className="h-20 animate-pulse rounded-2xl bg-white" key={x} />
          ))}
        </div>
      ) : !error && !result?.data.length ? (
        <div className="mt-6 rounded-2xl border border-dashed border-black/15 bg-white p-10 text-center">
          <ArrowDownUp className="mx-auto text-ink-400" />
          <h2 className="mt-3 text-lg font-semibold">No transactions yet</h2>
          <p className="mt-1 text-sm text-ink-500">Add a record or adjust your filters.</p>
        </div>
      ) : (
        !error && (
          <>
            <div className="mt-5 hidden overflow-hidden rounded-2xl border border-black/5 bg-white md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.data.map((row) => (
                    <tr className="border-t border-black/5" key={row.id}>
                      <td className="px-5 py-4">{row.transactionDate}</td>
                      <td className="px-5 py-4">
                        <Tag className="mr-2 inline h-4 w-4 text-ink-400" aria-hidden="true" />
                        {row.categoryName}
                      </td>
                      <td className="px-5 py-4 text-ink-500">{row.description || '—'}</td>
                      <td
                        className={`px-5 py-4 text-right font-semibold tabular-nums ${row.type === 'income' ? 'text-emerald-700' : 'text-ink-900'}`}
                      >
                        {row.type === 'income' ? '+' : '−'}
                        {formatINR(row.amountPaise)}
                      </td>
                      <td className="px-5 py-4">
                        <RowActions
                          row={row}
                          edit={() => setEditing(row)}
                          remove={() => void remove(row)}
                          history={() => void showHistory(row)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 grid gap-3 md:hidden">
              {result?.data.map((row) => (
                <article key={row.id} className="rounded-2xl border border-black/5 bg-white p-4">
                  <div className="flex justify-between">
                    <div>
                      <p className="font-medium">
                        <Tag className="mr-1 inline h-4 w-4 text-ink-400" aria-hidden="true" />
                        {row.categoryName}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        {row.transactionDate} · {row.description || row.type}
                      </p>
                    </div>
                    <strong className={row.type === 'income' ? 'text-emerald-700' : 'text-ink-900'}>
                      {row.type === 'income' ? '+' : '−'}
                      {formatINR(row.amountPaise)}
                    </strong>
                  </div>
                  <RowActions
                    row={row}
                    edit={() => setEditing(row)}
                    remove={() => void remove(row)}
                    history={() => void showHistory(row)}
                  />
                </article>
              ))}
            </div>
            <nav
              aria-label="Transaction pages"
              className="mt-5 flex items-center justify-between text-sm"
            >
              <span className="text-ink-500">{result?.pagination.total ?? 0} records</span>
              <div className="flex gap-2">
                <button
                  className={control}
                  disabled={currentPage <= 1}
                  onClick={() => setFilter('page', String(currentPage - 1))}
                >
                  Previous
                </button>
                <span className="px-2 py-3">
                  Page {result?.pagination.page ?? 1} of{' '}
                  {Math.max(result?.pagination.totalPages ?? 0, 1)}
                </span>
                <button
                  className={control}
                  disabled={currentPage >= (result?.pagination.totalPages ?? 1)}
                  onClick={() => setFilter('page', String(currentPage + 1))}
                >
                  Next
                </button>
              </div>
            </nav>
          </>
        )
      )}
      <CategoryManager refresh={load} categories={categories} announce={setNotice} />
      <AnimatePresence>
        {editing !== false && (
          <TransactionDialog
            key={editing?.id ?? 'new'}
            transaction={editing}
            categories={categories}
            timezone={user?.timezone ?? 'Asia/Kolkata'}
            close={() => setEditing(false)}
            saved={async () => {
              setEditing(false);
              await load();
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {history && <HistoryDialog history={history} close={() => setHistory(null)} />}
      </AnimatePresence>
    </section>
  );
}

function RowActions({
  row,
  edit,
  remove,
  history,
}: {
  row: Transaction;
  edit: () => void;
  remove: () => void;
  history: () => void;
}) {
  return (
    <div className="mt-3 flex gap-2 md:mt-0">
      <button
        className="rounded-lg p-2 text-ink-500 hover:bg-canvas"
        aria-label={`Edit ${row.categoryName}`}
        onClick={edit}
      >
        <Pencil size={16} />
      </button>
      <button
        className="rounded-lg p-2 text-ink-500 hover:bg-canvas"
        aria-label={`View history for ${row.categoryName}`}
        onClick={history}
      >
        <Clock3 size={16} />
      </button>
      <button
        className="rounded-lg p-2 text-ink-500 hover:bg-red-50 hover:text-red-700"
        aria-label={`Delete ${row.categoryName}`}
        onClick={remove}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function TransactionDialog({
  transaction,
  categories,
  timezone,
  close,
  saved,
}: {
  transaction: Transaction | null;
  categories: Category[];
  timezone: string;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [type, setType] = useState<'income' | 'expense'>(transaction?.type ?? 'expense');
  const [amount, setAmount] = useState(transaction?.amount ?? '');
  const [categoryId, setCategoryId] = useState(String(transaction?.categoryId ?? ''));
  const [date, setDate] = useState(transaction?.transactionDate ?? todayFor(timezone));
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const options = categories.filter((c) => c.type === type);
  const isOld = transaction && transaction.transactionDate < todayFor(timezone);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const invalid = validateTransactionForm(amount, description, categoryId, date, timezone);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const body = {
        type,
        amount,
        categoryId: Number(categoryId),
        transactionDate: date,
        description: description.trim() || null,
        ...(transaction ? { reason: reason.trim() || undefined } : {}),
      };
      if (transaction) await transactionApi.update(transaction.id, body);
      else await transactionApi.create(body);
      await saved();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not save transaction.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={transaction ? 'Edit transaction' : 'Add transaction'} close={close}>
      <form className="space-y-4" onSubmit={(e) => void submit(e)}>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl border p-3 text-sm ${type === 'expense' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-black/10'}`}
            onClick={() => {
              setType('expense');
              setCategoryId('');
            }}
          >
            Expense
          </button>
          <button
            type="button"
            className={`rounded-xl border p-3 text-sm ${type === 'income' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-black/10'}`}
            onClick={() => {
              setType('income');
              setCategoryId('');
            }}
          >
            Income
          </button>
        </div>
        <label className="block text-sm font-medium">
          Amount (₹)
          <input
            autoFocus
            className={`${control} mt-1 w-full`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Category
          <select
            className={`${control} mt-1 w-full`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
          >
            <option value="">Choose category</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Date
          <input
            className={`${control} mt-1 w-full`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Description <span className="font-normal text-ink-400">(optional)</span>
          <input
            className={`${control} mt-1 w-full`}
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was this for?"
          />
        </label>
        {transaction && (
          <>
            <label className="block text-sm font-medium">
              Reason for change <span className="font-normal text-ink-400">(optional)</span>
              <input
                className={`${control} mt-1 w-full`}
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Add context to the history"
              />
            </label>
            {isOld && (
              <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <CalendarClock size={17} className="shrink-0" />
                This is an older transaction. Its entry date will remain unchanged.
              </p>
            )}
          </>
        )}
        {message && (
          <p role="alert" className="text-sm text-red-700">
            {message}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={control} onClick={close}>
            Cancel
          </button>
          <button
            disabled={busy}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : transaction ? 'Save changes' : 'Add transaction'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-3xl sm:p-7"
        initial={{ y: 16 }}
        animate={{ y: 0 }}
        exit={{ y: 12 }}
      >
        <header className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            aria-label="Close dialog"
            className="rounded-lg p-2 hover:bg-canvas"
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </motion.section>
    </motion.div>
  );
}

function HistoryDialog({
  history,
  close,
}: {
  history: { transaction: Transaction; entries: AuditEntry[] };
  close: () => void;
}) {
  const labels: Record<string, string> = {
    type: 'type',
    amountPaise: 'amount',
    categoryId: 'category ID',
    transactionDate: 'date',
    description: 'description',
    deletedAt: 'status',
  };
  const value = (row: Partial<Transaction> | null, field: string, entry: AuditEntry) => {
    if (field === 'deletedAt' && entry.action === 'delete') return row ? 'active' : 'deleted';
    if (!row) return '—';
    if (field === 'amountPaise' && typeof row.amountPaise === 'number')
      return formatINR(row.amountPaise);
    if (field === 'deletedAt') return row.deletedAt ? 'deleted' : 'active';
    if (field === 'categoryId' && row.categoryName) return row.categoryName;
    return String(row[field as keyof Transaction] ?? '—');
  };
  return (
    <Dialog title="Transaction history" close={close}>
      <p className="mb-4 text-sm text-ink-500">
        {history.transaction.categoryName} · {history.transaction.transactionDate}
      </p>
      <ol className="space-y-4">
        {history.entries.map((entry) => (
          <li className="border-l-2 border-brand-200 pl-4" key={entry.id}>
            <p className="font-medium capitalize">{entry.action}</p>
            <time className="text-xs text-ink-500">
              {new Date(entry.createdAt).toLocaleString()}
            </time>
            {entry.changedFields?.map((field) => (
              <p className="mt-1 text-sm" key={field}>
                <span className="capitalize">{labels[field] ?? field}</span>:{' '}
                {value(entry.before, field, entry)} → {value(entry.after, field, entry)}
              </p>
            ))}
            {entry.reason && <p className="mt-1 text-sm text-ink-500">Reason: {entry.reason}</p>}
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

function CategoryManager({
  categories,
  refresh,
  announce,
}: {
  categories: Category[];
  refresh: () => Promise<void>;
  announce: (text: string) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [error, setError] = useState('');
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || name.trim().length > 30) {
      setError('Category name must be 1–30 characters.');
      return;
    }
    try {
      await categoryApi.create({ name: name.trim(), type });
      setName('');
      setError('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create category.');
    }
  }
  async function rename(category: Category) {
    const next = window.prompt('Category name', category.name);
    if (next === null) return;
    try {
      await categoryApi.update(category.id, { name: next.trim() });
      await refresh();
    } catch (e) {
      announce(e instanceof Error ? e.message : 'Could not rename category.');
    }
  }
  async function remove(category: Category) {
    if (!window.confirm(`Delete category “${category.name}”?`)) return;
    try {
      await categoryApi.delete(category.id);
      await refresh();
    } catch (e) {
      announce(e instanceof Error ? e.message : 'Could not delete category.');
    }
  }
  const custom = useMemo(() => categories.filter((c) => !c.isDefault), [categories]);
  return (
    <details className="mt-10 rounded-2xl border border-black/5 bg-white p-5">
      <summary className="cursor-pointer font-semibold">Manage custom categories</summary>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => void create(e)}>
        <input
          className={control}
          aria-label="New category name"
          placeholder="Category name"
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className={control}
          aria-label="New category type"
          value={type}
          onChange={(e) => setType(e.target.value as 'income' | 'expense')}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
        <button className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="mt-4 divide-y divide-black/5">
        {custom.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {c.name} <span className="text-ink-400">({c.type})</span>
            </span>
            <span className="flex gap-2">
              <button className="text-brand-700 underline" onClick={() => void rename(c)}>
                Rename
              </button>
              <button className="text-red-700 underline" onClick={() => void remove(c)}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      {!custom.length && <p className="mt-3 text-sm text-ink-500">No custom categories yet.</p>}
    </details>
  );
}
