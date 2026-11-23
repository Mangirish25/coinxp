import { Snowflake } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { flameSpec, seededOffsets, type FlameState, type FlameMotionMode } from './flameSpec';
import type { QualityTier } from '../visuals.config';
import { useMotionActivity, useMotionPreferences } from '../../motion/MotionProvider';

export interface FlameRendererProps {
  length: number;
  state: FlameState;
  quality: QualityTier;
  mode: FlameMotionMode;
}

export interface StreakFlameProps extends Omit<FlameRendererProps, 'mode' | 'quality'> { mode?: FlameMotionMode; quality?: QualityTier }

export type Renderer = (props: FlameRendererProps) => ReactNode;

function SvgFlameRenderer({ length, state, quality, mode }: FlameRendererProps) {
  const spec = flameSpec({ length, state, quality, mode });
  const offsets = seededOffsets(length + state.length * 17, spec.embers);
  const paths = [
    { d: 'M50 8C45 23 31 28 31 47c0 13 8 23 19 23s19-10 19-23C69 30 57 22 50 8Z', color: spec.colors[0], opacity: 0.72 },
    { d: 'M50 24C45 35 39 39 39 50c0 8 5 14 11 14s11-6 11-14c0-8-5-17-11-26Z', color: spec.colors[1], opacity: 0.92 },
    { d: 'M50 45c-3 5-6 8-6 12 0 4 3 7 6 7s6-3 6-7c0-4-3-8-6-12Z', color: spec.colors[2], opacity: spec.coreBoost },
  ].slice(0, spec.layers);

  return <svg className={`streak-flame-svg${spec.animate ? ' streak-flame-animated' : ''}${spec.shiver ? ' streak-flame-risk' : ''}${state === 'SETTLING' && mode === 'FULL' ? ' streak-flame-settling' : ''}`}
    style={{ '--flame-scale': spec.scale, '--flame-duration': `${spec.flickerMs}ms`, '--flame-opacity': spec.opacity, '--flame-saturation': spec.saturation } as CSSProperties}
    viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs><radialGradient id="flame-glow"><stop stopColor={spec.colors[0]} stopOpacity=".28" /><stop offset="1" stopColor={spec.colors[0]} stopOpacity="0" /></radialGradient></defs>
    {spec.halo && <circle className="streak-flame-halo" cx="50" cy="51" r="37" fill="none" stroke={spec.colors[0]} strokeWidth="1.2" />}
    {spec.rays && <g className="streak-flame-rays" stroke={spec.colors[2]} strokeWidth="1.2" opacity=".65">{Array.from({ length: 8 }, (_, index) => <line key={index} x1="50" y1="7" x2="50" y2="14" transform={`rotate(${index * 45} 50 50)`} />)}</g>}
    {state !== 'INACTIVE' && <ellipse cx="50" cy="55" rx="40" ry="41" fill="url(#flame-glow)" />}
    {paths.map((path, index) => <path key={index} d={path.d} fill={path.color} opacity={path.opacity} transform={`translate(0 ${index * 1.5})`} />)}
    {offsets.map((ember, index) => <circle key={index} className="streak-flame-ember" cx={12 + ember.x * 0.76} cy={69 - ember.rise} r="1.1" fill={spec.colors[0]} style={{ '--ember-delay': `${ember.delay}ms` } as CSSProperties} />)}
    {spec.overlay === 'ice' && <circle cx="50" cy="50" r="39" fill="none" stroke="#67e8f9" strokeWidth="2" strokeDasharray="3 4" />}
    {spec.overlay === 'smoke' && <path d="M35 39c-8-7 4-12-2-19m20 20c8-9-5-13 2-21m4 25c6-6-1-9 4-14" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" opacity=".7" />}
  </svg>;
}

export function StreakFlame({ length, state, quality, mode }: StreakFlameProps) {
  const motion = useMotionPreferences();
  const chosenMode = mode ?? motion.effectiveMode;
  const chosenQuality = quality ?? motion.quality;
  const spec = flameSpec({ length, state, quality: chosenQuality, mode: chosenMode });
  const activityRef = useMotionActivity<HTMLDivElement>(spec.animate || spec.halo || spec.rays || spec.embers > 0);
  return <div ref={activityRef} className="inline-flex flex-col items-center" role="img" aria-label={spec.label}>
    <div className="relative h-24 w-24" aria-hidden="true">
      {state === 'INACTIVE' ? <svg viewBox="0 0 100 100" className="h-full w-full"><path d="M50 8C45 23 31 28 31 47c0 13 8 23 19 23s19-10 19-23C69 30 57 22 50 8Z" fill="none" stroke="#94a3b8" strokeWidth="4" strokeDasharray="4 4" /></svg> : <SvgFlameRenderer length={length} state={state} quality={chosenQuality} mode={chosenMode} />}
      {state === 'FROZEN' && <Snowflake aria-hidden="true" className="absolute bottom-1 right-1 rounded-full bg-white p-1 text-sky-600" size={24} />}
    </div>
    <span className="text-sm font-semibold tabular-nums">{length} {length === 1 ? 'day' : 'days'}</span>
    <span className="text-xs text-ink-500">{state.replaceAll('_', ' ').toLowerCase()}</span>
  </div>;
}

export const defaultFlameRenderer: Renderer = (props) => <StreakFlame {...props} />;
