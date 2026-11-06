// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import { queryClient } from '../services/queryClient';
import { DashboardPage } from './DashboardPage';

vi.mock('recharts', async () => {
  const React = await import('react');
  const Node = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  return {
    Bar: Node,
    BarChart: Node,
    CartesianGrid: Node,
    Cell: () => null,
    Legend: Node,
    Pie: Node,
    PieChart: Node,
    ReferenceLine: Node,
    ResponsiveContainer: Node,
    Tooltip: Node,
    XAxis: Node,
    YAxis: Node,
  };
});

const summary = {
  month: '2026-11',
  isCurrentMonth: true,
  totalBalancePaise: 0,
  totalBalance: '₹0.00',
  monthIncomePaise: 0,
  monthIncome: '₹0.00',
  monthExpensePaise: 0,
  monthExpense: '₹0.00',
  monthNetPaise: 0,
  monthNet: '₹0.00',
  savingsRateBps: null,
  comparison: {
    incomeDeltaPaise: 0,
    income: '₹0.00',
    expenseDeltaPaise: 0,
    expense: '₹0.00',
    expenseChangeBps: null,
  },
  budget: {
    monthlyTotal: null,
    remainingPaise: null,
    remaining: null,
    safeDailySpendPaise: null,
    safeDailySpend: null,
  },
  today: {
    date: '2026-11-07',
    spentPaise: 0,
    spent: '₹0.00',
    dailyLimitPaise: null,
    dailyLimit: null,
    remainingPaise: null,
    remaining: null,
    status: 'no_budget',
  },
  averageDailySpendPaise: 0,
  averageDailySpend: '₹0.00',
  transactionCount: 0,
  recentTransactions: [],
  topCategories: [],
};

function setup(breakdownFails = false) {
  queryClient.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/me'))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 1,
            email: 'a@example.com',
            displayName: 'A',
            timezone: 'Asia/Kolkata',
            createdAt: '2026-01-01',
          }),
        };
      if (url.includes('/api/dashboard/summary'))
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...summary, transactionCount: breakdownFails ? 1 : 0 }),
        };
      if (url.includes('category-breakdown'))
        return breakdownFails
          ? {
              ok: false,
              status: 500,
              json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'failed' } }),
            }
          : {
              ok: true,
              status: 200,
              json: async () => ({ items: [], total: { amountPaise: 0, amount: '₹0.00' } }),
            };
      if (url.includes('daily-spending'))
        return { ok: true, status: 200, json: async () => ({ days: [] }) };
      if (url.includes('income-vs-expense')) return { ok: true, status: 200, json: async () => [] };
      return { ok: true, status: 200, json: async () => ({}) };
    }),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
describe('DashboardPage states', () => {
  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
  });
  it('shows the new-user empty state when no transactions exist', async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByText('Your dashboard is ready when you are')).toBeTruthy(),
    );
    expect(screen.getByText(/Add your first transaction/i)).toBeTruthy();
  });
  it('keeps other dashboard sections visible when one query fails', async () => {
    setup(true);
    await waitFor(() => expect(screen.getByText('Total balance')).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Recent transactions')).toBeTruthy();
  });
});
