import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  PieChart, Series as PieSeries, Legend as PieLegend, Tooltip as PieTooltip,
} from 'devextreme-react/pie-chart'
import {
  Chart, Series, ArgumentAxis, ValueAxis, Legend, Tooltip, CommonSeriesSettings, Label,
} from 'devextreme-react/chart'
import TreeMap, { Tooltip as TreeMapTooltip } from 'devextreme-react/tree-map'
import FiltersSidebar from '../../components/common/FiltersSidebar'
import {
  useDashboardFilterOptions, useDashboardMetrics,
  useTopProcesses, useTransactionTrend,
  useTransactionsByCountry, useSubprocessCounts,
  useOriginByStatus, useDashboardFilters,
  useIntegrationTreemap,
} from '../../hooks/useDashboard'
import type { IntegrationTreemapItem } from '../../types/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const TIME_PERIODS = [
  { value: 'LastHour',    label: 'Last Hour' },
  { value: 'Last24Hours', label: 'Last 24 Hours' },
  { value: 'Today',       label: 'Today' },
  { value: 'Last7Days',   label: 'Last 7 Days' },
  { value: 'Last30Days',  label: 'Last 30 Days' },
]

const TREND_INTERVALS = [
  { value: 15,  label: '15 Minutes' },
  { value: 30,  label: '30 Minutes' },
  { value: 60,  label: '1 Hour' },
  { value: 120, label: '2 Hours' },
  { value: 240, label: '4 Hours' },
]

const SELECT_STYLE = {
  background: 'rgba(30,41,59,.8)',
  color: '#fff',
  border: '1px solid rgba(46,134,193,.3)',
}

const MULTI_SELECT_STYLE = {
  ...SELECT_STYLE,
  minHeight: 72,
  width: '100%',
}

// ── Multi-select helpers ──────────────────────────────────────────────────────

interface NumMultiSelectProps {
  value: number[]
  options: Array<{ value: number; text: string }>
  onChange: (vals: number[]) => void
  placeholder?: string
}

function NumMultiSelect({ value, options, onChange, placeholder }: NumMultiSelectProps) {
  return (
    <>
      <select
        multiple
        className="form-select form-select-sm"
        value={value.map(String)}
        onChange={(e) => {
          const vals = Array.from(e.target.selectedOptions).map((o) => Number(o.value))
          onChange(vals)
        }}
        style={MULTI_SELECT_STYLE}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.text}</option>
        ))}
      </select>
      {placeholder && (
        <div style={{ fontSize: 10, color: 'rgba(148,163,184,.6)', marginTop: 2 }}>
          {placeholder}
        </div>
      )}
    </>
  )
}

interface StrMultiSelectProps {
  value: string[]
  options: string[]
  onChange: (vals: string[]) => void
  placeholder?: string
}

function StrMultiSelect({ value, options, onChange, placeholder }: StrMultiSelectProps) {
  return (
    <>
      <select
        multiple
        className="form-select form-select-sm"
        value={value}
        onChange={(e) => {
          const vals = Array.from(e.target.selectedOptions).map((o) => o.value)
          onChange(vals)
        }}
        style={MULTI_SELECT_STYLE}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {placeholder && (
        <div style={{ fontSize: 10, color: 'rgba(148,163,184,.6)', marginTop: 2 }}>
          {placeholder}
        </div>
      )}
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MainDashboardPage() {
  const qc                     = useQueryClient()
  const { filters, update }    = useDashboardFilters()
  const { data: opts }         = useDashboardFilterOptions()
  const { data: metrics, isFetching: mFetch } = useDashboardMetrics(filters)
  const { data: topProcesses } = useTopProcesses(filters)
  const { data: trend }        = useTransactionTrend(filters)
  const { data: countries }    = useTransactionsByCountry(filters)
  const { data: subprocesses } = useSubprocessCounts(filters)
  const { data: originStatus } = useOriginByStatus(filters)
  const { data: treemapData }  = useIntegrationTreemap(filters)

  // ── Fix 7: 30-second auto-refresh ─────────────────────────────────────────
  const refresh = () => qc.invalidateQueries({ queryKey: ['dashboard'] })

  useEffect(() => {
    const id = setInterval(() => qc.invalidateQueries({ queryKey: ['dashboard'] }), 30_000)
    return () => clearInterval(id)
  }, [qc])

  // ── Fix 5: Cascading subprocess filter ────────────────────────────────────
  const filteredSubprocesses = useMemo(() => {
    if (!opts?.businessSubprocesses) return []
    if (!filters.BusinessProcessIds?.length) return opts.businessSubprocesses
    return opts.businessSubprocesses.filter((s) =>
      filters.BusinessProcessIds!.includes(s.businessProcessId),
    )
  }, [opts?.businessSubprocesses, filters.BusinessProcessIds])

  useEffect(() => {
    if (!filters.BusinessSubprocessIds?.length) return
    const validIds = new Set(filteredSubprocesses.map((s) => s.value))
    const stillValid = filters.BusinessSubprocessIds.filter((id) => validIds.has(id))
    if (stillValid.length !== filters.BusinessSubprocessIds.length) {
      update({ BusinessSubprocessIds: stillValid })
    }
  // only re-run when the process selection changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.BusinessProcessIds])

  // ── Fix 3: Flatten OriginByStatus into stacked-bar rows ──────────────────
  const originStatusFlat = useMemo(() => {
    if (!originStatus) return []
    const map = new Map<string, { origin: string; success: number; failed: number; error: number; timeout: number }>()
    for (const entry of originStatus) {
      if (!map.has(entry.sourceSystem)) {
        map.set(entry.sourceSystem, { origin: entry.sourceSystem, success: 0, failed: 0, error: 0, timeout: 0 })
      }
      const row = map.get(entry.sourceSystem)!
      const s = entry.status.toLowerCase()
      if (s === 'success')       row.success  += entry.count
      else if (s === 'failed')   row.failed   += entry.count
      else if (s === 'error')    row.error    += entry.count
      else if (s === 'timeout')  row.timeout  += entry.count
    }
    return Array.from(map.values())
  }, [originStatus])

  return (
    <div className="dashboard-layout" style={{ background: 'var(--gtek-dark-blue)' }}>

      {/* ── Filter sidebar ───────────────────────────────────── */}
      <FiltersSidebar onRefresh={refresh} loading={mFetch}>

        {/* Time Period */}
        <div className="filter-group">
          <label className="filter-label">Time Period</label>
          <select
            className="form-select form-select-sm"
            value={filters.TimePeriod ?? 'Last24Hours'}
            onChange={(e) => update({ TimePeriod: e.target.value })}
            style={SELECT_STYLE}
          >
            {TIME_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Fix 4: Environment — multi-select */}
        <div className="filter-group">
          <label className="filter-label">Environment</label>
          <NumMultiSelect
            value={filters.EnvironmentIds ?? []}
            options={opts?.environments ?? []}
            onChange={(vals) => update({ EnvironmentIds: vals })}
            placeholder="Hold Ctrl / Cmd to select multiple"
          />
          {!filters.EnvironmentIds?.length && (
            <div
              className="mt-2 px-2 py-1 rounded"
              style={{ background: 'rgba(234,179,8,.12)', border: '1px solid rgba(234,179,8,.3)', fontSize: 11, color: '#fbbf24' }}
            >
              <i className="fas fa-exclamation-circle me-1" />Showing data from all environments
            </div>
          )}
        </div>

        {/* Fix 4: Business Process — multi-select */}
        <div className="filter-group">
          <label className="filter-label">Business Process</label>
          <NumMultiSelect
            value={filters.BusinessProcessIds ?? []}
            options={opts?.businessProcesses ?? []}
            onChange={(vals) => update({ BusinessProcessIds: vals })}
            placeholder="Hold Ctrl / Cmd to select multiple"
          />
        </div>

        {/* Fix 4 + 5: Business Subprocess — multi-select, cascaded */}
        <div className="filter-group">
          <label className="filter-label">Business Subprocess</label>
          <NumMultiSelect
            value={filters.BusinessSubprocessIds ?? []}
            options={filteredSubprocesses}
            onChange={(vals) => update({ BusinessSubprocessIds: vals })}
            placeholder="Hold Ctrl / Cmd to select multiple"
          />
        </div>

        {/* Fix 4: Country — multi-select */}
        <div className="filter-group">
          <label className="filter-label">Country</label>
          <NumMultiSelect
            value={filters.CountryIds ?? []}
            options={opts?.countries ?? []}
            onChange={(vals) => update({ CountryIds: vals })}
            placeholder="Hold Ctrl / Cmd to select multiple"
          />
        </div>

        {/* Fix 4: Brand — multi-select */}
        <div className="filter-group">
          <label className="filter-label">Brand</label>
          <NumMultiSelect
            value={filters.BrandIds ?? []}
            options={opts?.brands ?? []}
            onChange={(vals) => update({ BrandIds: vals })}
            placeholder="Hold Ctrl / Cmd to select multiple"
          />
        </div>

        {/* Direction */}
        <div className="filter-group">
          <label className="filter-label">Direction</label>
          <select
            className="form-select form-select-sm"
            value={filters.Direction ?? ''}
            onChange={(e) => update({ Direction: e.target.value || undefined })}
            style={SELECT_STYLE}
          >
            <option value="">All</option>
            <option value="Inbound">Inbound</option>
            <option value="Outbound">Outbound</option>
          </select>
        </div>

        {/* Fix 2: Document Type — multi-select */}
        <div className="filter-group">
          <label className="filter-label">Document Type</label>
          <StrMultiSelect
            value={filters.DocumentTypes ?? []}
            options={opts?.documentTypes ?? []}
            onChange={(vals) => update({ DocumentTypes: vals })}
            placeholder="Hold Ctrl / Cmd to select multiple"
          />
        </div>

        {/* Fix 6: Trend Interval — numeric minutes */}
        <div className="filter-group">
          <label className="filter-label">Trend Interval</label>
          <select
            className="form-select form-select-sm"
            value={filters.TrendIntervalMinutes ?? 60}
            onChange={(e) => update({ TrendIntervalMinutes: Number(e.target.value) })}
            style={SELECT_STYLE}
          >
            {TREND_INTERVALS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

      </FiltersSidebar>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="dashboard-content" id="dashboardContent">

        <div className="mb-3">
          <h1 className="h3 text-white mb-1">Business Process Monitoring Dashboard</h1>
          <p className="text-muted mb-0">Real-time transaction monitoring and analytics</p>
        </div>

        {/* Metric cards */}
        <div className="row mb-4">
          <div className="col-md-4 mb-3">
            <div className="metric-card total">
              <div className="metric-value total">{metrics?.total ?? 0}</div>
              <div className="metric-label">Total</div>
            </div>
          </div>
          <div className="col-md-4 mb-3">
            <div className="metric-card success">
              <div className="metric-value success">{metrics?.successful ?? 0}</div>
              <div className="metric-label">Successful</div>
            </div>
          </div>
          <div className="col-md-4 mb-3">
            <div className="metric-card error">
              <div className="metric-value error">{metrics?.failed ?? 0}</div>
              <div className="metric-label">Failure</div>
            </div>
          </div>
        </div>

        {/* Charts row 1 */}
        <div className="row">
          {/* Top Processes — Pie */}
          <div className="col-lg-4 mb-4">
            <div className="gtek-card card" style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}>
              <div className="gtek-card-header card-header" style={{ background: 'var(--gtek-primary-blue)', color: '#fff' }}>
                <i className="fas fa-chart-pie me-2" />Top Used Processes
              </div>
              <div className="card-body p-3">
                <PieChart
                  dataSource={topProcesses ?? []}
                  palette="Soft Blue"
                  height={300}
                >
                  <PieSeries argumentField="processName" valueField="count" />
                  <PieLegend visible={true} horizontalAlignment="right" verticalAlignment="top" />
                  <PieTooltip
                    enabled={true}
                    customizeTooltip={(arg) => ({
                      text: `${arg.argumentText}: ${arg.valueText} (${topProcesses?.find((p) => p.processName === arg.argumentText)?.percentage ?? 0}%)`,
                    })}
                  />
                </PieChart>
              </div>
            </div>
          </div>

          {/* Subprocess counts — Bar */}
          <div className="col-lg-4 mb-4">
            <div className="gtek-card card" style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}>
              <div className="gtek-card-header card-header" style={{ background: 'var(--gtek-primary-blue)', color: '#fff' }}>
                <i className="fas fa-chart-bar me-2" />Transaction Count by SubProcesses
              </div>
              <div className="card-body p-3">
                <Chart dataSource={subprocesses ?? []} height={300} palette="Ocean">
                  <CommonSeriesSettings argumentField="subprocessName" type="bar" />
                  <Series valueField="count" name="Count" color="#3498DB" />
                  <ArgumentAxis>
                    <Label overlappingBehavior="rotate" rotationAngle={-30} />
                  </ArgumentAxis>
                  <Legend visible={false} />
                  <Tooltip enabled={true} />
                </Chart>
              </div>
            </div>
          </div>

          {/* Fix 3: Source System by Status — stacked bar */}
          <div className="col-lg-4 mb-4">
            <div className="gtek-card card" style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}>
              <div className="gtek-card-header card-header" style={{ background: 'var(--gtek-primary-blue)', color: '#fff' }}>
                <i className="fas fa-server me-2" />Count Per Source System by Status
              </div>
              <div className="card-body p-3">
                <Chart dataSource={originStatusFlat} height={300}>
                  <CommonSeriesSettings argumentField="origin" type="stackedbar" />
                  <Series valueField="success" name="Success" color="#2ECC71" />
                  <Series valueField="failed"  name="Failed"  color="#E74C3C" />
                  <Series valueField="error"   name="Error"   color="#9B59B6" />
                  <Series valueField="timeout" name="Timeout" color="#F39C12" />
                  <ArgumentAxis>
                    <Label overlappingBehavior="rotate" rotationAngle={-30} />
                  </ArgumentAxis>
                  <Legend visible={true} horizontalAlignment="right" verticalAlignment="top" />
                  <Tooltip enabled={true} shared={true} />
                </Chart>
              </div>
            </div>
          </div>
        </div>

        {/* Charts row 2 */}
        <div className="row">
          {/* Countries — Bar horizontal */}
          <div className="col-lg-6 mb-4">
            <div className="gtek-card card" style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}>
              <div className="gtek-card-header card-header" style={{ background: 'var(--gtek-primary-blue)', color: '#fff' }}>
                <i className="fas fa-globe me-2" />Transaction Count by Country
              </div>
              <div className="card-body p-3">
                <Chart dataSource={countries ?? []} height={300} rotated={true} palette="Ocean">
                  <CommonSeriesSettings argumentField="countryName" type="bar" />
                  <Series valueField="count" name="Count" color="#2ECC71" />
                  <Legend visible={false} />
                  <Tooltip enabled={true} />
                </Chart>
              </div>
            </div>
          </div>

          {/* Fix 1: Integration TreeMap */}
          <div className="col-lg-6 mb-4">
            <div className="gtek-card card" style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}>
              <div className="gtek-card-header card-header" style={{ background: 'var(--gtek-primary-blue)', color: '#fff' }}>
                <i className="fas fa-th me-2" />Integration Volume TreeMap
              </div>
              <div className="card-body p-3">
                <TreeMap
                  id="integrationTreemap"
                  dataSource={treemapData ?? []}
                  valueField="value"
                  labelField="name"
                  height={300}
                >
                  <TreeMapTooltip
                    enabled={true}
                    customizeTooltip={(info) => {
                      const d = info.node.data as IntegrationTreemapItem | undefined
                      if (!d) return { text: '' }
                      return {
                        html: [
                          `<b>${d.name}</b>`,
                          `Messages: ${d.value}`,
                          `Success: ${d.successCount}`,
                          `Errors: ${d.errorCount}`,
                          `Rate: ${(d.successRate ?? 0).toFixed(1)}%`,
                        ].join('<br/>'),
                      }
                    }}
                  />
                </TreeMap>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Trend — full width */}
        <div className="row">
          <div className="col-12 mb-4">
            <div className="gtek-card card" style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)' }}>
              <div className="gtek-card-header card-header" style={{ background: 'var(--gtek-primary-blue)', color: '#fff' }}>
                <i className="fas fa-chart-line me-2" />Trend of Transactions by Status
              </div>
              <div className="card-body p-3">
                <Chart dataSource={trend ?? []} height={320}>
                  <CommonSeriesSettings argumentField="date" type="spline" />
                  <Series valueField="total"      name="Total"      color="#3498DB" />
                  <Series valueField="successful" name="Successful" color="#2ECC71" />
                  <Series valueField="failed"     name="Failed"     color="#E74C3C" />
                  <ArgumentAxis />
                  <ValueAxis />
                  <Legend visible={true} horizontalAlignment="right" verticalAlignment="top" />
                  <Tooltip enabled={true} shared={true} />
                </Chart>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
