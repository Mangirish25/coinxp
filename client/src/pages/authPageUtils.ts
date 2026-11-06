import type { Location } from 'react-router-dom';

export function getAuthReturnPath(state: unknown) {
  const from = (state as { from?: Pick<Location, 'pathname' | 'search' | 'hash'> } | null)?.from;
  if (!from?.pathname?.startsWith('/') || from.pathname.startsWith('//')) return '/dashboard';
  return `${from.pathname}${from.search}${from.hash}`;
}
