import type { ApiErrorShape } from '../types/api';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  // Part 2: attach the authenticated user's bearer token here.
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const payload = body as ApiErrorShape | null;
    throw new ApiError(
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? 'The request could not be completed.',
    );
  }
  return body as T;
}
