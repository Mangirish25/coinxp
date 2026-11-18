import type { ApiErrorShape } from '../types/api';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

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

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, credentials: 'include' });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith('/login') && !path.endsWith('/register')) {
      unauthorizedHandler?.();
    }
    const payload = body as ApiErrorShape | null;
    throw new ApiError(
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? 'The request could not be completed.',
    );
  }
  if (response.status === 204) return undefined as T;
  return body as T;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, { credentials: 'include' });
  if (!response.ok) {
    if (response.status === 401) unauthorizedHandler?.();
    const payload = (await response.json().catch(() => null)) as ApiErrorShape | null;
    throw new ApiError(payload?.error?.code ?? 'REQUEST_FAILED', payload?.error?.message ?? 'The download could not be completed.');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
