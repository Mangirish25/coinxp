export interface Category {
  id: number;
  userId: number | null;
  name: string;
  type: 'income' | 'expense';
  icon: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface Transaction {
  id: number;
  userId: number;
  categoryId: number;
  type: 'income' | 'expense';
  amountPaise: number;
  amount: string;
  description: string | null;
  transactionDate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  categoryName: string;
  categoryIcon: string | null;
  categoryType: 'income' | 'expense';
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TransactionList {
  data: Transaction[];
  pagination: Pagination;
}

export interface AuditEntry {
  id: number;
  transactionId: number;
  userId: number;
  action: 'create' | 'update' | 'delete' | 'restore';
  before: Partial<Transaction> | null;
  after: Partial<Transaction> | null;
  changedFields: string[] | null;
  reason: string | null;
  createdAt: string;
}
