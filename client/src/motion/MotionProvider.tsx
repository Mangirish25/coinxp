import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { uiPreferencesApi } from '../services/uiPreferencesApi';
import { adaptQuality, initialQualityFor, motionTokens, sampler, type QualityTier } from '../visuals/visuals.config';
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
  registerVisualActivity: () => () => void;
}
const MotionContext = createContext<MotionContextValue | null>(null);
const fallbackValue: MotionContextValue = {
  preferences: defaults, effectiveMode: 'FULL', quality: 'HIGH', saving: false, error: null,
  setMotionMode: async () => undefined, setCelebrations: async () => undefined, setSound: async () => undefined, setHaptics: async () => undefined,
  vibrate: () => false, registerVisualActivity: () => () => undefined,
};

export function MotionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const localKey = user ? `${storageKey}:${user.id}` : storageKey;
  const queryClient = useQueryClient();
  const [local, setLocal] = useState(() => readLocal(localKey));
  const [qualityCeiling] = useState<QualityTier>(deviceQualityCeiling);
  const [quality, setQuality] = useState<QualityTier>(qualityCeiling);
  const [activeVisuals, setActiveVisuals] = useState(0);
  const [interactionRevision, setInteractionRevision] = useState(0);
  const activeVisualsRef = useRef(0);
  const lastInteractionAt = useRef(Number.NEGATIVE_INFINITY);
  const [prefersReduced, setPrefersReduced] = useState(osRequestsReducedMotion);
  const [error, setError] = useState<string | null>(null);
  const preferencesQuery = useQuery({ queryKey: ['ui-preferences', user?.id], queryFn: uiPreferencesApi.get, enabled: user !== null });
  const saveMutation = useMutation({ mutationFn: uiPreferencesApi.save, onSuccess: (saved) => {
    setLocal(saved); try { localStorage.setItem(localKey, JSON.stringify(saved)); } catch { /* Local cache is optional. */ }
    queryClient.setQueryData(['ui-preferences', user?.id], saved); setError(null);
  }, onError: (cause) => setError(cause instanceof Error ? cause.message : 'Could not save display preferences.') });
  const preferences = preferencesQuery.data ?? local;
  const effectiveMode = preferences.motionMode === 'OFF' ? 'OFF' : preferences.motionMode === 'REDUCED' || (preferences.motionMode === 'SYSTEM' && prefersReduced) ? 'REDUCED' : 'FULL';
  const registerVisualActivity = useCallback(() => {
    activeVisualsRef.current += 1;
    setActiveVisuals(activeVisualsRef.current);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      activeVisualsRef.current = Math.max(0, activeVisualsRef.current - 1);
      setActiveVisuals(activeVisualsRef.current);
    };
  }, []);

  useEffect(() => {
    for (const [name, duration] of Object.entries(motionTokens.duration)) {
      document.documentElement.style.setProperty(`--dur-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, `${duration}ms`);
    }
    document.documentElement.style.setProperty('--ease-out', `cubic-bezier(${motionTokens.ease.out.join(', ')})`);
  }, []);
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
    const noteInteraction = () => {
      lastInteractionAt.current = performance.now();
      if (activeVisualsRef.current > 0) setInteractionRevision((value) => value + 1);
    };
    const visibilityChanged = () => setInteractionRevision((value) => value + 1);
    window.addEventListener('pointerdown', noteInteraction, { passive: true });
    window.addEventListener('keydown', noteInteraction, { passive: true });
    window.addEventListener('touchstart', noteInteraction, { passive: true });
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      window.removeEventListener('pointerdown', noteInteraction);
      window.removeEventListener('keydown', noteInteraction);
      window.removeEventListener('touchstart', noteInteraction);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);
  useEffect(() => {
    if (effectiveMode !== 'FULL' || activeVisuals === 0 || document.visibilityState !== 'visible' || typeof requestAnimationFrame !== 'function') return undefined;
    let frame = 0; let start = performance.now(); let last = start;
    if (start - lastInteractionAt.current > 30000) return undefined;
    const frames: number[] = [];
    let changedAt = performance.now();
    const sample = (now: number) => {
      if (document.visibilityState !== 'visible' || now - lastInteractionAt.current > 30000) return;
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
  }, [effectiveMode, qualityCeiling, activeVisuals, interactionRevision]);

  const save = useCallback(async (patch: Partial<UiPreferences>) => {
    const next = { ...preferences, ...patch, updatedAt: preferences.updatedAt };
    setLocal(next); try { localStorage.setItem(localKey, JSON.stringify(next)); } catch { /* Local cache is optional. */ }
    if (user) await saveMutation.mutateAsync({ motionMode: next.motionMode, celebrations: next.celebrations, sound: next.sound, haptics: next.haptics });
  }, [preferences, saveMutation, user, localKey]);
  const value = useMemo<MotionContextValue>(() => ({ preferences, effectiveMode, quality, saving: saveMutation.isPending, error,
    setMotionMode: (motionMode) => save({ motionMode }), setCelebrations: (celebrations) => save({ celebrations }),
    setSound: (sound) => save({ sound }), setHaptics: (haptics) => save({ haptics }),
    vibrate: (pattern = 12) => Boolean(preferences.haptics && typeof navigator !== 'undefined' && navigator.vibrate?.(pattern)), registerVisualActivity,
  }), [preferences, effectiveMode, quality, saveMutation.isPending, error, save, registerVisualActivity]);

  return <MotionContext.Provider value={value}><MotionConfig reducedMotion={effectiveMode === 'FULL' ? 'never' : 'always'}>{children}</MotionConfig></MotionContext.Provider>;
}

export function useMotionPreferences() {
  const value = useContext(MotionContext);
  return value ?? fallbackValue;
}

/** MOT-003: sample performance only while an animated visual is intersecting the viewport. */
export function useMotionActivity<T extends HTMLElement = HTMLElement>(enabled: boolean) {
  const { registerVisualActivity } = useMotionPreferences();
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return undefined;
    if (typeof IntersectionObserver === 'undefined') return registerVisualActivity();
    let release: (() => void) | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !release) release = registerVisualActivity();
      else if (!entry?.isIntersecting && release) { release(); release = null; }
    });
    observer.observe(node);
    return () => { observer.disconnect(); release?.(); };
  }, [enabled, registerVisualActivity]);
  return ref;
}
