import apiClient from './apiClient'
import type {
  FilterOptions, DashboardMetrics, DashboardFilters,
  TopProcess, TrendPoint, CountryCount, SubprocessCount,
  OriginStatusEntry, IntegrationTreemapItem,
} from '../types/api'

function buildParams(filters: DashboardFilters): Record<string, string> {
  const p: Record<string, string> = {}
  if (filters.TimePeriod)                    p.TimePeriod            = filters.TimePeriod
  if (filters.Direction)                     p.Direction             = filters.Direction
  if (filters.DocumentTypes?.length)         p.DocumentTypes         = filters.DocumentTypes.join(',')
  if (filters.TrendIntervalMinutes !== undefined) p.TrendIntervalMinutes = String(filters.TrendIntervalMinutes)
  if (filters.EnvironmentIds?.length)        p.EnvironmentIds        = filters.EnvironmentIds.join(',')
  if (filters.BusinessProcessIds?.length)    p.BusinessProcessIds    = filters.BusinessProcessIds.join(',')
  if (filters.BusinessSubprocessIds?.length) p.BusinessSubprocessIds = filters.BusinessSubprocessIds.join(',')
  if (filters.CountryIds?.length)            p.CountryIds            = filters.CountryIds.join(',')
  if (filters.BrandIds?.length)              p.BrandIds              = filters.BrandIds.join(',')
  if (filters.BusinessSegmentIds?.length)    p.BusinessSegmentIds    = filters.BusinessSegmentIds.join(',')
  return p
}

export const getFilterOptions = () =>
  apiClient.get<FilterOptions>('/Dashboard/GetFilterOptions').then((r) => r.data)

export const getMetrics = (filters: DashboardFilters) =>
  apiClient.get<DashboardMetrics>('/Dashboard/GetMetrics', { params: buildParams(filters) }).then((r) => r.data)

export const getTopProcesses = (filters: DashboardFilters) =>
  apiClient.get<TopProcess[]>('/Dashboard/GetTopProcesses', { params: buildParams(filters) }).then((r) => r.data)

// ── Chart.js → DevExtreme adapter ───────────────────────────────────────────
// GET /MainDashboard/GetTransactionTrend returns Chart.js format:
//   { labels: string[], datasets: [{ label, data, backgroundColor }] }
// DevExtreme Chart expects an array of objects shaped { date, total, successful, failed }.

interface ChartJsTrendDataset {
  label:            string
  data:             number[]
  backgroundColor?: string
}

interface ChartJsTrendResponse {
  labels:   string[]
  datasets: ChartJsTrendDataset[]
}

function adaptTrendData(raw: ChartJsTrendResponse): TrendPoint[] {
  const find = (keyword: string) =>
    raw.datasets.find((d) => d.label.toLowerCase().includes(keyword))?.data ?? []

  const totalData      = find('total')
  const successfulData = find('success')
  const failedData     = find('fail')

  return (raw.labels ?? []).map((date, i) => ({
    date,
    total:      totalData[i]      ?? 0,
    successful: successfulData[i] ?? 0,
    failed:     failedData[i]     ?? 0,
  }))
}

export const getTransactionTrend = (filters: DashboardFilters) =>
  apiClient
    .get<ChartJsTrendResponse>('/MainDashboard/GetTransactionTrend', { params: buildParams(filters) })
    .then((r) => adaptTrendData(r.data))

export const getTransactionsByCountry = (filters: DashboardFilters) =>
  apiClient.get<CountryCount[]>('/Dashboard/GetTransactionsByCountry', { params: buildParams(filters) }).then((r) => r.data)

export const getSubprocessTransactions = (filters: DashboardFilters) =>
  apiClient.get<SubprocessCount[]>('/Dashboard/GetSubprocessTransactions', { params: buildParams(filters) }).then((r) => r.data)

export const getOriginByStatus = (filters: DashboardFilters) =>
  apiClient.get<OriginStatusEntry[]>('/MainDashboard/GetOriginByStatus', { params: buildParams(filters) }).then((r) => r.data)

export const getIntegrationTreemap = (filters: DashboardFilters) =>
  apiClient.get<IntegrationTreemapItem[]>('/MainDashboard/GetIntegrationTreemap', { params: buildParams(filters) }).then((r) => r.data)
