import type { Meta, StoryObj } from '@storybook/react-vite';
import type { BadgeFamily } from '../../types/rewards';
import { BadgeMedallion } from '../../visuals/medallion/BadgeMedallion';

type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
type VisualState = 'LOCKED' | 'HIDDEN_LOCKED' | 'UNLOCKED' | 'NEW' | 'SHOWCASE';
function MotionMedallion({ category, tier, rarity, visualState, progressBps, size, quality, mode }: {
  category: string; tier: number; rarity: Rarity; visualState: VisualState; progressBps: number;
  size: 'sm' | 'md' | 'lg' | 'xl'; quality: 'HIGH' | 'MEDIUM' | 'LOW'; mode: 'FULL' | 'REDUCED' | 'OFF';
}) {
  const badge: BadgeFamily = {
    slug: 'motion_lab_sample', category, type: 'PROGRESSIVE', rarity, hidden: visualState === 'HIDDEN_LOCKED',
    metric: 'XP_TRACKED_DAYS', metricValue: 7, timesEarned: 0,
    tiers: [{ tier, threshold: 14, rarity, xp: 25, status: visualState === 'LOCKED' || visualState === 'HIDDEN_LOCKED' ? 'LOCKED' : 'ACTIVE', achievedOn: null }],
  };
  return <BadgeMedallion badge={badge} tier={badge.tiers[0]!} state={visualState} progressBps={progressBps} size={size} quality={quality} mode={mode} />;
}

const meta = {
  title: 'Motion Lab/Badge Medallion',
  component: MotionMedallion,
  tags: ['autodocs'],
  parameters: { layout: 'centered', a11y: { test: 'error' } },
  argTypes: {
    category: { control: 'select', options: ['TRACKING', 'STREAK', 'BUDGET', 'PROGRESS', 'CHALLENGE', 'HABIT'] },
    tier: { control: { type: 'number', min: 1, max: 4, step: 1 } },
    rarity: { control: 'select', options: ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] },
    visualState: { control: 'select', options: ['LOCKED', 'HIDDEN_LOCKED', 'UNLOCKED', 'NEW', 'SHOWCASE'] },
    progressBps: { control: { type: 'number', min: 0, max: 10000, step: 100 } },
    size: { control: 'select', options: ['sm', 'md', 'lg', 'xl'] },
    quality: { control: 'inline-radio', options: ['HIGH', 'MEDIUM', 'LOW'] },
    mode: { control: 'inline-radio', options: ['FULL', 'REDUCED', 'OFF'] },
  },
} satisfies Meta<typeof MotionMedallion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RareReveal: Story = { args: { category: 'STREAK', tier: 2, rarity: 'RARE', visualState: 'NEW', progressBps: 10000, size: 'xl', quality: 'HIGH', mode: 'FULL' } };
export const LockedHidden: Story = { args: { category: 'BUDGET', tier: 1, rarity: 'EPIC', visualState: 'HIDDEN_LOCKED', progressBps: 0, size: 'lg', quality: 'MEDIUM', mode: 'REDUCED' } };
