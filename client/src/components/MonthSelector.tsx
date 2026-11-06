import { ArrowLeft, ArrowRight } from 'lucide-react';

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function MonthSelector({
  month,
  onChange,
  label = 'Month selector',
}: {
  month: string;
  onChange: (month: string) => void;
  label?: string;
}) {
  const [year, monthNumber] = month.split('-').map(Number);
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return (
    <nav
      aria-label={label}
      className="flex items-center gap-2 rounded-xl border border-black/5 bg-white p-1"
    >
      <button
        aria-label="Previous month"
        className="rounded-lg p-2 hover:bg-canvas"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ArrowLeft size={18} />
      </button>
      <span aria-live="polite" className="min-w-36 text-center text-sm font-semibold">
        {monthLabel}
      </span>
      <button
        aria-label="Next month"
        className="rounded-lg p-2 hover:bg-canvas"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ArrowRight size={18} />
      </button>
    </nav>
  );
}
