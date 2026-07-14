import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getFilterOptions, getMetrics, getTopProcesses,
  getTransactionTrend, getTransactionsByCountry,
  getSubprocessTransactions, getOriginByStatus,
} from '../services/dashboardService'
import type { DashboardFilters } from '../types/api'

export const DEFAULT_FILTERS: DashboardFilters = { TimePeriod: 'Last24Hours', TrendInterval: 'hour' }

export function useDashboardFilterOptions() {
  return useQuery({ queryKey: ['dashboard', 'filterOptions'], queryFn: getFilterOptions, staleTime: 5 * 60_000 })
}

export function useDashboardMetrics(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'metrics', filters],
    queryFn:  () => getMetrics(filters),
  })
}

export function useTopProcesses(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'topProcesses', filters],
    queryFn:  () => getTopProcesses(filters),
  })
}

export function useTransactionTrend(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'trend', filters],
    queryFn:  () => getTransactionTrend(filters),
  })
}

export function useTransactionsByCountry(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'country', filters],
    queryFn:  () => getTransactionsByCountry(filters),
  })
}

export function useSubprocessCounts(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'subprocess', filters],
    queryFn:  () => getSubprocessTransactions(filters),
  })
}

export function useOriginByStatus(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'originStatus', filters],
    queryFn:  () => getOriginByStatus(filters),
  })
}

export function useDashboardFilters(initial: DashboardFilters = DEFAULT_FILTERS) {
  const [filters, setFilters] = useState<DashboardFilters>(initial)
  const update = useCallback((patch: Partial<DashboardFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch })), [])
  return { filters, update }
}
