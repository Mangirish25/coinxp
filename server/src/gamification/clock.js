export function createClock(now = () => new Date()) {
  return Object.freeze({ now: () => new Date(now()) });
}

export function createTestClock(initial = new Date()) {
  let current = new Date(initial);
  if (Number.isNaN(current.getTime())) throw new Error('Test clock requires a valid initial date.');
  return Object.freeze({
    now: () => new Date(current),
    set(value) { const next = new Date(value); if (Number.isNaN(next.getTime())) throw new Error('Test clock requires a valid date.'); current = next; return new Date(current); },
    advance(milliseconds) { if (!Number.isSafeInteger(milliseconds)) throw new Error('Clock advance must be a safe integer.'); current = new Date(current.getTime() + milliseconds); return new Date(current); },
  });
}

export const systemClock = createClock();
