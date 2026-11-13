export function createClock(now = () => new Date()) {
  return Object.freeze({ now: () => new Date(now()) });
}

export const systemClock = createClock();
