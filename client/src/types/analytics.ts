export interface MoneyValue {
  amountPaise: number;
  amount: string;
}
export interface DashboardSummary {
  month: string;
  isCurrentMonth: boolean;
  totalBalancePaise: number;
  totalBalance: string;
  monthIncomePaise: number;
  monthIncome: string;
  monthExpensePaise: number;
  monthExpense: string;
  monthNetPaise: number;
  monthNet: string;
  savingsRateBps: number | null;
  comparison: {
    incomeDeltaPaise: number;
    income: string;
    expenseDeltaPaise: number;
    expense: string;
    expenseChangeBps: number | null;
  };
  budget: {
    monthlyTotal: null | {
      budgetPaise: number;
      spentPaise: number;
      remainingPaise: number;
      percentUsed: number;
      status: string;
      source: string;
    };
    remainingPaise: number | null;
    remaining: string | null;
    safeDailySpendPaise: number | null;
    safeDailySpend: string | null;
  };
  today: {
    date: string;
    spentPaise: number;
    spent: string;
    dailyLimitPaise: number | null;
    dailyLimit: string | null;
    remainingPaise: number | null;
    remaining: string | null;
    percentUsed: number | null;
    status: string;
  };
  averageDailySpendPaise: number;
  averageDailySpend: string;
  transactionCount: number;
  recentTransactions: Array<{
    id: number;
    type: 'income' | 'expense';
    amountPaise: number;
    amount: string;
    transactionDate: string;
    description: string | null;
    categoryName: string;
    categoryIcon: string | null;
  }>;
  topCategories: Array<{
    categoryId: number;
    name: string;
    icon: string | null;
    spentPaise: number;
    spent: string;
    shareBps: number;
  }>;
}
export interface CategoryBreakdown {
  from: string;
  to: string;
  type: 'income' | 'expense';
  total: MoneyValue;
  items: Array<{
    categoryId: number;
    name: string;
    icon: string | null;
    amountPaise: number;
    amount: string;
    shareBps: number;
    count: number;
  }>;
}
export interface DailySpending {
  from: string;
  to: string;
  days: Array<{
    date: string;
    expensePaise: number;
    expense: string;
    incomePaise: number;
    income: string;
    dailyLimitPaise: number | null;
    dailyLimit: string | null;
  }>;
  maxDay: unknown;
}
export interface MonthlyAggregate {
  month: string;
  incomePaise: number;
  income: string;
  expensePaise: number;
  expense: string;
  netPaise: number;
  net: string;
}
export interface MonthlyReport {
  month: string;
  totals: {
    incomePaise: number;
    income: string;
    expensePaise: number;
    expense: string;
    netPaise: number;
    net: string;
    savingsRateBps: number | null;
  };
  comparison: {
    biggestIncreases: Array<Record<string, unknown>>;
    biggestDecreases: Array<Record<string, unknown>>;
  };
  topExpenseTransactions: Array<Record<string, unknown>>;
  busiestDay: Record<string, unknown> | null;
  cheapestNonZeroDay: Record<string, unknown> | null;
  budgetOutcome: Record<string, unknown>;
  trackingConsistency: { daysWithTransactions: number; daysElapsed: number };
}
