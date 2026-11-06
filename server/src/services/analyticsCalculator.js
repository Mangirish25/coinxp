function integer(value, name) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${name} must be a non-negative safe integer.`);
}

function safeBigIntNumber(value, name = 'result') {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError(`${name} exceeds the safe integer range.`);
  return Number(value);
}

export function calculateShareBps(amountPaise, totalPaise) {
  integer(amountPaise, 'amountPaise');
  integer(totalPaise, 'totalPaise');
  if (totalPaise === 0) return null;
  return safeBigIntNumber(
    (BigInt(amountPaise) * 10000n + BigInt(totalPaise) / 2n) / BigInt(totalPaise),
  );
}

export function allocateShares(
  items,
  { amount = (item) => item.amountPaise, id = (_item, index) => index } = {},
) {
  const total = items.reduce((sum, item) => sum + BigInt(amount(item)), 0n);
  if (total === 0n) return items.map((item) => ({ ...item, shareBps: 0 }));
  const allocations = items.map((item, index) => {
    const numerator = BigInt(amount(item)) * 10000n;
    return {
      item,
      index,
      bps: numerator / total,
      remainder: numerator % total,
      id: String(id(item, index)),
    };
  });
  let remaining = 10000 - allocations.reduce((sum, item) => sum + Number(item.bps), 0);
  const order = [...allocations].sort((a, b) =>
    a.remainder === b.remainder
      ? a.id.localeCompare(b.id) || a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let index = 0; index < remaining; index += 1) order[index].bps += 1n;
  return allocations.map(({ item, bps }) => ({
    ...item,
    shareBps: safeBigIntNumber(bps, 'shareBps'),
  }));
}

export function calculateSavingsRateBps(netPaise, incomePaise) {
  if (!Number.isSafeInteger(netPaise)) throw new TypeError('netPaise must be a safe integer.');
  integer(incomePaise, 'incomePaise');
  if (incomePaise === 0) return null;
  const sign = netPaise < 0 ? -1n : 1n;
  const numerator = BigInt(Math.abs(netPaise)) * 10000n;
  const bps = (numerator + BigInt(incomePaise) / 2n) / BigInt(incomePaise);
  return safeBigIntNumber(bps) * Number(sign);
}

export function safePaiseDelta(currentPaise, previousPaise) {
  integer(currentPaise, 'currentPaise');
  integer(previousPaise, 'previousPaise');
  const delta = BigInt(currentPaise) - BigInt(previousPaise);
  if (delta > BigInt(Number.MAX_SAFE_INTEGER) || delta < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError('Paise delta exceeds the safe integer range.');
  return Number(delta);
}

export function calculateExpenseChangeBps(currentPaise, previousPaise) {
  integer(currentPaise, 'currentPaise');
  integer(previousPaise, 'previousPaise');
  if (previousPaise === 0) return null;
  const delta = BigInt(currentPaise) - BigInt(previousPaise);
  const sign = delta < 0n ? -1n : 1n;
  const numerator = (delta < 0n ? -delta : delta) * 10000n;
  return (
    safeBigIntNumber((numerator + BigInt(previousPaise) / 2n) / BigInt(previousPaise)) *
    Number(sign)
  );
}

export function zeroFillDays(from, to, rows, dailyLimits = new Map()) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const values = new Map(rows.map((row) => [row.date, row]));
  const result = [];
  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    const row = values.get(date);
    result.push({
      date,
      expensePaise: row?.expensePaise ?? 0,
      incomePaise: row?.incomePaise ?? 0,
      dailyLimitPaise: dailyLimits.get(date) ?? null,
    });
  }
  return result;
}

export function zeroFillMonths(fromMonth, count, rows) {
  const values = new Map(rows.map((row) => [row.month, row]));
  const [year, month] = fromMonth.split('-').map(Number);
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const row = values.get(key);
    const incomePaise = row?.incomePaise ?? 0;
    const expensePaise = row?.expensePaise ?? 0;
    result.push({
      month: key,
      incomePaise,
      expensePaise,
      netPaise: safePaiseDelta(incomePaise, expensePaise),
    });
  }
  return result;
}

export function averageDailyPaise(totalPaise, daysElapsed) {
  integer(totalPaise, 'totalPaise');
  if (!Number.isSafeInteger(daysElapsed) || daysElapsed < 0)
    throw new TypeError('daysElapsed must be a non-negative safe integer.');
  return daysElapsed === 0 ? 0 : Number(BigInt(totalPaise) / BigInt(daysElapsed));
}

export function selectBusiestAndCheapest(days) {
  const active = days.filter((day) => day.expensePaise > 0);
  if (!active.length) return { busiestDay: null, cheapestNonZeroDay: null };
  const chronological = [...active].sort((a, b) => a.date.localeCompare(b.date));
  const bySpend = [...chronological].sort(
    (a, b) => b.expensePaise - a.expensePaise || a.date.localeCompare(b.date),
  );
  return {
    busiestDay: bySpend[0],
    cheapestNonZeroDay: [...chronological].sort(
      (a, b) => a.expensePaise - b.expensePaise || a.date.localeCompare(b.date),
    )[0],
  };
}
