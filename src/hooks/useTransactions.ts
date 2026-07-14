import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTransactions, getTransactionFilterOptions } from '../services/transactionsService'
import type { TransactionFilters } from '../types/api'

export const DEFAULT_TX_FILTERS: TransactionFilters = {
  timeMinutes:   60,
  page:          1,
  pageSize:      25,
  sortField:     'StartTimestamp',
  sortDirection: 'desc',
}

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn:  () => getTransactions(filters),
    placeholderData: (prev) => prev,
  })
}

export function useTransactionFilterOptions() {
  return useQuery({
    queryKey: ['transactions', 'filterOptions'],
    queryFn:  getTransactionFilterOptions,
    staleTime: 5 * 60_000,
  })
}

export function useTransactionFilters(initial: TransactionFilters = DEFAULT_TX_FILTERS) {
  const [filters, setFilters] = useState<TransactionFilters>(initial)

  const update = useCallback((patch: Partial<TransactionFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 })), [])

  const setPage = useCallback((page: number) =>
    setFilters((prev) => ({ ...prev, page })), [])

  return { filters, update, setPage }
}
