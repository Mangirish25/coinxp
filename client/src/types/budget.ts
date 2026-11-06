export type BudgetScope = 'monthly_total' | 'category_monthly' | 'daily_limit';
export type BudgetStatus = 'on_track' | 'warning' | 'exceeded' | 'no_budget';

export interface BudgetRow {
  id: number;
  userId: number;
  scope: BudgetScope;
  categoryId: number | null;
  month: string | null;
  amountPaise: number;
  amount: string;
  categoryName: string | null;
  categoryIcon: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetStatusResult {
  month: string;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  monthlyTotal: null | {
    budgetPaise: number;
    budget: string;
    spentPaise: number;
    spent: string;
    remainingPaise: number;
    remaining: string;
    percentUsed: number | null;
    status: BudgetStatus;
    source: 'month' | 'default';
    budgetId: number;
  };
  categories: Array<{
    categoryId: number;
    name: string;
    icon: string | null;
    budgetPaise: number;
    budget: string;
    spentPaise: number;
    spent: string;
    remainingPaise: number;
    remaining: string;
    percentUsed: number | null;
    status: BudgetStatus;
    source: 'month' | 'default';
    budgetId: number;
  }>;
  unbudgetedSpending: {
    spentPaise: number;
    spent: string;
    categories: Array<{
      categoryId: number;
      name: string;
      icon: string | null;
      spentPaise: number;
      spent: string;
    }>;
  };
  dailyLimit: null | {
    limitPaise: number;
    limit: string;
    source: 'month' | 'default';
    budgetId: number;
  };
  safeDailySpendPaise?: number;
  safeDailySpend?: string;
  warnings: Array<{ code: string; message: string }>;
}

export interface DailyBudgetStatus {
  date: string;
  limitPaise: number | null;
  limit: string | null;
  source: 'month' | 'default' | null;
  spentPaise: number;
  spent: string;
  remainingPaise: number | null;
  remaining: string | null;
  percentUsed: number | null;
  status: BudgetStatus;
}
