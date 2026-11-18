import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { uiPreferencesApi } from '../services/uiPreferencesApi';
import { adaptQuality, initialQualityFor, sampler, type QualityTier } from '../visuals/visuals.config';
import type { CelebrationPreference, UiPreferences, UserMotionMode } from '../types/uiPreferences';

const storageKey = 'coinxp:ui-preferences:v1';
const defaults: UiPreferences = { motionMode: 'SYSTEM', celebrations: 'ALL', sound: false, haptics: true, updatedAt: null };
function readLocal(key = storageKey): UiPreferences {
  try { const value = localStorage.getItem(key); return value ? { ...defaults, ...JSON.parse(value) } : defaults; }
  catch { return defaults; }
}
function deviceQualityCeiling(): QualityTier {
  if (typeof navigator === 'undefined') return 'LOW';
  const memory = 'deviceMemory' in navigator ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory) : undefined;
  const reducedData = 'connection' in navigator && Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  return initialQualityFor({ deviceMemory: memory, hardwareConcurrency: navigator.hardwareConcurrency, reducedData });
}
function osRequestsReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface MotionContextValue {
  preferences: UiPreferences;
  effectiveMode: 'FULL' | 'REDUCED' | 'OFF';
  quality: QualityTier;
  saving: boolean;
  error: string | null;
  setMotionMode: (mode: UserMotionMode) => Promise<void>;
  setCelebrations: (mode: CelebrationPreference) => Promise<void>;
  setSound: (enabled: boolean) => Promise<void>;
  setHaptics: (enabled: boolean) => Promise<void>;
  vibrate: (pattern?: number | number[]) => boolean;
}
const MotionContext = createContext<MotionContextValue | null>(null);
const fallbackValue: MotionContextValue = {
  preferences: defaults, effectiveMode: 'FULL', quality: 'HIGH', saving: false, error: null,
  setMotionMode: async () => undefined, setCelebrations: async () => undefined, setSound: async () => undefined, setHaptics: async () => undefined,
  vibrate: () => false,
};

export function MotionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const localKey = user ? `${storageKey}:${user.id}` : storageKey;
  const queryClient = useQueryClient();
  const [local, setLocal] = useState(() => readLocal(localKey));
  const [qualityCeiling] = useState<QualityTier>(deviceQualityCeiling);
  const [quality, setQuality] = useState<QualityTier>(qualityCeiling);
  const [prefersReduced, setPrefersReduced] = useState(osRequestsReducedMotion);
  const [error, setError] = useState<string | null>(null);
  const preferencesQuery = useQuery({ queryKey: ['ui-preferences', user?.id], queryFn: uiPreferencesApi.get, enabled: user !== null });
  const saveMutation = useMutation({ mutationFn: uiPreferencesApi.save, onSuccess: (saved) => {
    setLocal(saved); try { localStorage.setItem(localKey, JSON.stringify(saved)); } catch { /* Local cache is optional. */ }
    queryClient.setQueryData(['ui-preferences', user?.id], saved); setError(null);
  }, onError: (cause) => setError(cause instanceof Error ? cause.message : 'Could not save display preferences.') });
  const preferences = preferencesQuery.data ?? local;
  const effectiveMode = preferences.motionMode === 'OFF' ? 'OFF' : preferences.motionMode === 'REDUCED' || (preferences.motionMode === 'SYSTEM' && prefersReduced) ? 'REDUCED' : 'FULL';

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReduced(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    if (!preferencesQuery.data) return;
    setLocal(preferencesQuery.data);
    try { localStorage.setItem(localKey, JSON.stringify(preferencesQuery.data)); } catch { /* Local cache is optional. */ }
  }, [preferencesQuery.data, localKey]);
  useEffect(() => { setLocal(readLocal(localKey)); }, [localKey]);
  useEffect(() => {
    if (effectiveMode !== 'FULL' || document.visibilityState !== 'visible' || typeof requestAnimationFrame !== 'function') return undefined;
    let frame = 0; let start = performance.now(); let last = start;
    const frames: number[] = [];
    let changedAt = performance.now();
    const sample = (now: number) => {
      frames.push(now - last); last = now;
      if (now - start >= sampler.windowMs) {
        const sortedFrames = [...frames].sort((a, b) => a - b);
        const middle = Math.floor(sortedFrames.length / 2);
        const median = sortedFrames.length % 2 ? sortedFrames[middle] : ((sortedFrames[middle - 1] ?? 0) + (sortedFrames[middle] ?? 0)) / 2;
        setQuality((current) => {
          const next = adaptQuality(current, frames, qualityCeiling);
          if (next !== current && median < sampler.upgradeFrameMs && now - changedAt < sampler.minDwellMs) return current;
          if (next !== current) changedAt = now;
          return next;
        });
        start = now; frames.length = 0;
      }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frame);
  }, [effectiveMode, qualityCeiling]);

  const save = useCallback(async (patch: Partial<UiPreferences>) => {
    const next = { ...preferences, ...patch, updatedAt: preferences.updatedAt };
    setLocal(next); try { localStorage.setItem(localKey, JSON.stringify(next)); } catch { /* Local cache is optional. */ }
    if (user) await saveMutation.mutateAsync({ motionMode: next.motionMode, celebrations: next.celebrations, sound: next.sound, haptics: next.haptics });
  }, [preferences, saveMutation, user, localKey]);
  const value = useMemo<MotionContextValue>(() => ({ preferences, effectiveMode, quality, saving: saveMutation.isPending, error,
    setMotionMode: (motionMode) => save({ motionMode }), setCelebrations: (celebrations) => save({ celebrations }),
    setSound: (sound) => save({ sound }), setHaptics: (haptics) => save({ haptics }),
    vibrate: (pattern = 12) => Boolean(preferences.haptics && typeof navigator !== 'undefined' && navigator.vibrate?.(pattern)),
  }), [preferences, effectiveMode, quality, saveMutation.isPending, error, save]);

  return <MotionContext.Provider value={value}><MotionConfig reducedMotion={effectiveMode === 'FULL' ? 'never' : 'always'}>{children}</MotionConfig></MotionContext.Provider>;
}

export function useMotionPreferences() {
  const value = useContext(MotionContext);
  return value ?? fallbackValue;
}
