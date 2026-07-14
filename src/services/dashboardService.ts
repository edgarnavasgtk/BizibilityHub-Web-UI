import apiClient from './apiClient'
import type {
  FilterOptions, DashboardMetrics, DashboardFilters,
  TopProcess, TrendPoint, CountryCount, SubprocessCount, OriginStatusEntry
} from '../types/api'

function buildParams(filters: DashboardFilters): Record<string, string> {
  const p: Record<string, string> = {}
  if (filters.TimePeriod)          p.TimePeriod          = filters.TimePeriod
  if (filters.Direction)           p.Direction           = filters.Direction
  if (filters.DocumentType)        p.DocumentType        = filters.DocumentType
  if (filters.TrendInterval)       p.TrendInterval       = filters.TrendInterval
  if (filters.EnvironmentIds?.length)       p.EnvironmentIds       = filters.EnvironmentIds.join(',')
  if (filters.BusinessProcessIds?.length)   p.BusinessProcessIds   = filters.BusinessProcessIds.join(',')
  if (filters.BusinessSubprocessIds?.length) p.BusinessSubprocessIds = filters.BusinessSubprocessIds.join(',')
  if (filters.CountryIds?.length)           p.CountryIds           = filters.CountryIds.join(',')
  if (filters.BrandIds?.length)             p.BrandIds             = filters.BrandIds.join(',')
  if (filters.BusinessSegmentIds?.length)   p.BusinessSegmentIds   = filters.BusinessSegmentIds.join(',')
  return p
}

export const getFilterOptions = () =>
  apiClient.get<FilterOptions>('/Dashboard/GetFilterOptions').then((r) => r.data)

export const getMetrics = (filters: DashboardFilters) =>
  apiClient.get<DashboardMetrics>('/Dashboard/GetMetrics', { params: buildParams(filters) }).then((r) => r.data)

export const getTopProcesses = (filters: DashboardFilters) =>
  apiClient.get<TopProcess[]>('/Dashboard/GetTopProcesses', { params: buildParams(filters) }).then((r) => r.data)

export const getTransactionTrend = (filters: DashboardFilters) =>
  apiClient.get<TrendPoint[]>('/Dashboard/GetTransactionTrend', { params: buildParams(filters) }).then((r) => r.data)

export const getTransactionsByCountry = (filters: DashboardFilters) =>
  apiClient.get<CountryCount[]>('/Dashboard/GetTransactionsByCountry', { params: buildParams(filters) }).then((r) => r.data)

export const getSubprocessTransactions = (filters: DashboardFilters) =>
  apiClient.get<SubprocessCount[]>('/Dashboard/GetSubprocessTransactions', { params: buildParams(filters) }).then((r) => r.data)

export const getOriginByStatus = (filters: DashboardFilters) =>
  apiClient.get<OriginStatusEntry[]>('/MainDashboard/GetOriginByStatus', { params: buildParams(filters) }).then((r) => r.data)
