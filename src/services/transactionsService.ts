import apiClient from './apiClient'
import type { TransactionsResponse, TransactionFilters } from '../types/api'

// API returns { transactions, totalCount, totalPages } — remapped to TransactionsResponse shape
export const getTransactions = (filters: TransactionFilters) =>
  apiClient
    .get<{ transactions: TransactionsResponse['transactions']; totalCount: number; totalPages: number }>(
      '/Transactions/GetTransactions',
      { params: filters }
    )
    .then((r) => ({
      transactions: r.data.transactions ?? [],
      totalCount:   r.data.totalCount   ?? 0,
      totalPages:   r.data.totalPages   ?? 0,
    } as TransactionsResponse))

export const getTransactionFilterOptions = () =>
  apiClient
    .get<{ documentTypes: string[] }>('/Transactions/GetFilterOptions')
    .then((r) => r.data)
