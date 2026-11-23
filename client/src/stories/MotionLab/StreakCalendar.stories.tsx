import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StreakPeriodStatus, StreakSummary } from '../../types/streak';
import { StreakVisualCalendar } from '../../components/StreakVisualCalendar';

const statuses: StreakPeriodStatus[] = ['COUNTED', 'NONE', 'FROZEN', 'MISSED', 'EXEMPT', 'DECLARED_CAPPED', 'TODAY_OPEN'];
function storyDays(year: number) {
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(year, 0, index + 1)).toISOString().slice(0, 10);
    const status = statuses[(index * 5 + 2) % statuses.length]!;
    return { date, status, secondary: {}, streakLength: status === 'COUNTED' ? (index % 14) + 1 : status === 'FROZEN' ? index % 14 : 0 };
  });
}
const week: StreakSummary['week'] = [
  { date: '2026-11-16', status: 'COUNTED', secondary: {}, provisional: false },
  { date: '2026-11-17', status: 'COUNTED', secondary: {}, provisional: false },
  { date: '2026-11-18', status: 'FROZEN', secondary: {}, provisional: false },
  { date: '2026-11-19', status: 'COUNTED', secondary: {}, provisional: false },
  { date: '2026-11-20', status: 'MISSED', secondary: {}, provisional: false },
  { date: '2026-11-21', status: 'TODAY_OPEN', secondary: {}, provisional: true },
  { date: '2026-11-22', status: 'NONE', secondary: {}, provisional: false },
];

const meta = {
  title: 'Motion Lab/Streak Calendar',
  component: StreakVisualCalendar,
  tags: ['autodocs'],
  parameters: { layout: 'padded', a11y: { test: 'error' } },
  argTypes: { year: { control: { type: 'number', min: 2000, max: 2100, step: 1 } } },
  render: ({ year }) => <StreakVisualCalendar year={year} days={storyDays(year)} week={week} />,
} satisfies Meta<typeof StreakVisualCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullYear: Story = { args: { year: 2026, days: storyDays(2026), week } };
