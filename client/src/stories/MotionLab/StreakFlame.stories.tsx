import type { Meta, StoryObj } from '@storybook/react-vite';
import { StreakFlame } from '../../visuals/flame/StreakFlame';

const meta = {
  title: 'Motion Lab/Streak Flame',
  component: StreakFlame,
  tags: ['autodocs'],
  parameters: { layout: 'centered', a11y: { test: 'error' } },
  argTypes: {
    length: { control: { type: 'number', min: 0, max: 400, step: 1 } },
    state: { control: 'select', options: ['INACTIVE', 'ACTIVE_UNTRACKED', 'ACTIVE_TRACKED', 'AT_RISK', 'FROZEN', 'BROKEN', 'SETTLING'] },
    quality: { control: 'inline-radio', options: ['HIGH', 'MEDIUM', 'LOW'] },
    mode: { control: 'inline-radio', options: ['FULL', 'REDUCED', 'OFF'] },
  },
} satisfies Meta<typeof StreakFlame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = { args: { length: 14, state: 'ACTIVE_TRACKED', quality: 'HIGH', mode: 'FULL' } };
export const AtRisk: Story = { args: { length: 7, state: 'AT_RISK', quality: 'MEDIUM', mode: 'REDUCED' } };
export const Frozen: Story = { args: { length: 30, state: 'FROZEN', quality: 'HIGH', mode: 'FULL' } };
