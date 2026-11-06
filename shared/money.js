const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function rupeesToPaise(input) {
  if (typeof input !== 'number' && typeof input !== 'string') {
    throw new TypeError('Amount must be a number or decimal string.');
  }
  const value = String(input).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Amount must be non-negative with at most two decimal places.');
  }
  const [rupees, fraction = ''] = value.split('.');
  const paise = BigInt(rupees) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (paise > MAX_SAFE)
    throw new RangeError('Amount exceeds the maximum safe integer paise value.');
  return Number(paise);
}

export function paiseToRupees(paise) {
  if (!Number.isSafeInteger(paise)) throw new TypeError('Paise must be a safe integer.');
  const sign = paise < 0 ? '-' : '';
  const absolute = BigInt(Math.abs(paise));
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function formatINR(paise) {
  if (!Number.isSafeInteger(paise)) throw new TypeError('Paise must be a safe integer.');
  const sign = paise < 0 ? '-' : '';
  const absolute = BigInt(Math.abs(paise));
  const rupees = (absolute / 100n).toString();
  const grouped =
    rupees.length <= 3
      ? rupees
      : `${rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${rupees.slice(-3)}`;
  return `${sign}₹${grouped}.${String(absolute % 100n).padStart(2, '0')}`;
}
