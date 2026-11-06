import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import { apiFetch, ApiError } from '../services/api';
import type { HealthResponse } from '../types/api';

type HealthState =
  | { state: 'loading' }
  | { state: 'connected'; time: string }
  | { state: 'failed'; message: string };

export function HealthStatus() {
  const [health, setHealth] = useState<HealthState>({ state: 'loading' });

  useEffect(() => {
    let active = true;
    apiFetch<HealthResponse>('/api/health')
      .then((result) => active && setHealth({ state: 'connected', time: result.time }))
      .catch((error: unknown) => {
        if (!active) return;
        setHealth({
          state: 'failed',
          message: error instanceof ApiError ? error.message : 'API is unavailable.',
        });
      });
    return () => {
      active = false;
    };
  }, []);

  if (health.state === 'loading') {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-ink-500">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Checking API and database…
      </div>
    );
  }
  if (health.state === 'failed') {
    return (
      <div role="status" className="inline-flex items-center gap-2 text-sm text-rose-700">
        <CircleAlert className="h-4 w-4" /> Connection failed: {health.message}
      </div>
    );
  }
  return (
    <div
      role="status"
      className="inline-flex items-center gap-2 text-sm font-medium text-brand-700"
    >
      <CheckCircle2 className="h-4 w-4" /> API and database connected
    </div>
  );
}
