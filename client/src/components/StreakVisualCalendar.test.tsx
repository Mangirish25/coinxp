// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StreakVisualCalendar } from './StreakVisualCalendar';

describe('STR-012 week strip and year heatmap', () => {
  const days = [
    { date: '2026-01-01', status: 'COUNTED' as const, secondary: {} },
    { date: '2026-01-02', status: 'FROZEN' as const, secondary: {} },
    { date: '2026-01-03', status: 'EXEMPT' as const, secondary: {} },
  ];
  const week = [
    { date: '2026-11-16', status: 'COUNTED' as const, secondary: {}, provisional: false },
    { date: '2026-11-17', status: 'FROZEN' as const, secondary: {}, provisional: false },
    { date: '2026-11-18', status: 'MISSED' as const, secondary: {}, provisional: false },
    { date: '2026-11-19', status: 'EXEMPT' as const, secondary: {}, provisional: false },
    { date: '2026-11-20', status: 'DECLARED_CAPPED' as const, secondary: {}, provisional: false },
    { date: '2026-11-21', status: 'TODAY_OPEN' as const, secondary: {}, provisional: true },
    { date: '2026-11-22', status: 'NONE' as const, secondary: {}, provisional: false },
  ];

  it('shows all status labels, year counts, and moves grid focus with arrow keys', () => {
    render(<StreakVisualCalendar year={2026} days={days} week={week} />);
    expect(screen.getByText('1 counted day · 1 protected day in 2026')).toBeTruthy();
    expect(screen.getByRole('grid', { name: /2026 streak calendar/ })).toBeTruthy();
    expect(screen.getByLabelText('2026-11-21: Tracked today, not yet settled')).toBeTruthy();
    const firstDay = screen.getByRole('gridcell', { name: '2026-01-01: Counted' });
    const secondDay = screen.getByRole('gridcell', { name: '2026-01-02: Protected by freeze' });
    firstDay.focus();
    fireEvent.keyDown(firstDay, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(secondDay);
    expect(screen.getByLabelText('Streak calendar legend')).toBeTruthy();
  });
});
