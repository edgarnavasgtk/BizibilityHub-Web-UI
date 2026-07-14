import apiClient from './apiClient'
import type { TransactionsResponse, TransactionFilters } from '../types/api'

export const getTransactions = (filters: TransactionFilters) =>
  apiClient
    .get<TransactionsResponse>('/Transactions/GetTransactions', { params: filters })
    .then((r) => r.data)

export const getTransactionFilterOptions = () =>
  apiClient
    .get<{ documentTypes: string[] }>('/Transactions/GetFilterOptions')
    .then((r) => r.data)
