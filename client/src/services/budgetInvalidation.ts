const listeners = new Set<() => void>();

export function invalidateBudgetStatus() {
  for (const listener of listeners) listener();
}

export function subscribeBudgetStatusInvalidation(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
