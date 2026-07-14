import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FilterOption { value: number | string; text: string }

interface FilterOptions {
  businessSegments: FilterOption[]
  brands: FilterOption[]
  environments: FilterOption[]
  businessProcesses: FilterOption[]
}

interface KpiData {
  totalTransactions: number
  successRate: number
  errorCount: number                // FIX: API returns errorCount (was totalErrors)
  avgResponseMs: number
  activeIntegrations: number
  // API returns raw prev-period absolutes — trends are calculated client-side
  prevTotalTransactions?: number
  prevSuccessRate?: number
  prevActiveIntegrations?: number
  prevAvgResponseMs?: number
  // Calculated trend percentages (populated by applyTrends)
  totalTransactionsTrend?: number
  successRateTrend?: number
  errorCountTrend?: number
  avgResponseMsTrend?: number
  activeIntegrationsTrend?: number
  dateFrom?: string
  dateTo?: string
}

interface DailyVolume { date: string; success: number; error: number; total: number }

// FIX: TopIntegration updated to match API field names
interface TopIntegration {
  integrationName: string   // API: integrationName (was name)
  totalCount: number        // API: totalCount (was volume)
  successRate: number
  errorCount: number
  avgResponseMs: number
}

// FIX: ErrorPattern updated to match API field names
interface ErrorPattern {
  date: string
  errorCount: number    // API: errorCount (was errors)
  warningCount: number  // API: warningCount (was warnings)
}

// FIX: SystemHealth updated to match API field names
interface SystemHealth {
  systemName: string        // API: systemName (was system)
  volume: number
  availabilityRate: number  // API: availabilityRate (was successRate)
}

// FIX: performanceTable removed — performance data comes from topIntegrations
interface DashboardData {
  kpi: KpiData
  dailyVolume: DailyVolume[]
  topIntegrations: TopIntegration[]
  errorPatterns: ErrorPattern[]
  systemHealth: SystemHealth[]
}

// ── Trend calculation ──────────────────────────────────────────────────────────

function calcTrend(current: number, prev: number | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((current - prev) / Math.abs(prev)) * 100
}

function applyTrends(raw: DashboardData): DashboardData {
  const k = raw.kpi
  return {
    ...raw,
    kpi: {
      ...k,
      totalTransactionsTrend:  calcTrend(k.totalTransactions,  k.prevTotalTransactions),
      successRateTrend:        calcTrend(k.successRate,        k.prevSuccessRate),
      activeIntegrationsTrend: calcTrend(k.activeIntegrations, k.prevActiveIntegrations),
      avgResponseMsTrend:      calcTrend(k.avgResponseMs,      k.prevAvgResponseMs),
    },
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type DateRange = '30d' | '60d' | '90d' | '6m' | 'custom'

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '30d',    label: '30 days'  },
  { value: '60d',    label: '60 days'  },
  { value: '90d',    label: '90 days'  },
  { value: '6m',     label: '6 months' },
  { value: 'custom', label: 'Custom'   },
]

function TrendBadge({ value }: { value?: number }) {
  if (value == null) return null
  const up = value > 0
  const color = up ? '#2ECC71' : '#E74C3C'
  return (
    <span style={{ fontSize: 11, color, marginLeft: 4 }}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  )
}

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(30,41,59,.85)',
  border: '1px solid rgba(46,134,193,.25)',
  borderRadius: 12,
  padding: '18px 20px',
  height: '100%',
}

function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,.06)', borderRadius: 4, height: 14, position: 'relative', minWidth: 80 }}>
      <div style={{ width: `${pct}%`, background: color, borderRadius: 4, height: '100%' }} />
    </div>
  )
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function VStack({ items }: { items: DailyVolume[] }) {
  const maxTotal = Math.max(...items.map(i => i.total), 1)
  const CHART_H = 160
  const step = Math.ceil(items.length / 7)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, overflowX: 'auto', paddingBottom: 20 }}>
      {items.map((item, i) => {
        const totalH   = (item.total / maxTotal) * CHART_H
        const errH     = (item.error / maxTotal) * CHART_H
        const okH      = totalH - errH
        const showLabel = step > 0 && i % step === 0
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }} title={`${item.date}: ${item.total} total`}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: 14, height: CHART_H }}>
              {errH > 0 && <div style={{ height: errH, background: '#E74C3C', borderRadius: '2px 2px 0 0' }} />}
              {okH  > 0 && <div style={{ height: okH,  background: '#2ECC71', borderRadius: errH > 0 ? 0 : '2px 2px 0 0' }} />}
            </div>
            {showLabel && (
              <span style={{ fontSize: 9, color: '#64748b', marginTop: 3, whiteSpace: 'nowrap', transform: 'rotate(-45deg)', transformOrigin: 'top left', display: 'block', width: 1 }}>
                {formatShortDate(item.date)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HistoryDashboardPage() {
  const [dateRange, setDateRange]           = useState<DateRange>('30d')
  const [dateFrom, setDateFrom]             = useState('')
  const [dateTo, setDateTo]                 = useState('')
  const [segmentIds, setSegmentIds]         = useState<string[]>([])
  const [brandIds, setBrandIds]             = useState<string[]>([])
  const [environmentIds, setEnvironmentIds] = useState<string[]>([])
  const [processIds, setProcessIds]         = useState<string[]>([])

  const [applied, setApplied] = useState({
    dateRange: '30d' as DateRange,
    dateFrom: '',
    dateTo: '',
    segmentIds: [] as string[],
    brandIds: [] as string[],
    environmentIds: [] as string[],
    processIds: [] as string[],
  })

  const handleApply = useCallback(() => {
    setApplied({ dateRange, dateFrom, dateTo, segmentIds, brandIds, environmentIds, processIds })
  }, [dateRange, dateFrom, dateTo, segmentIds, brandIds, environmentIds, processIds])

  // Filter options
  const { data: filterOpts } = useQuery<FilterOptions>({
    queryKey: ['history-filter-opts'],
    queryFn: () => apiClient.get<FilterOptions>('/HistoryDashboard/GetFilterOptions').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  // Dashboard data — applyTrends derives percentage trends from raw prev-period values
  const { data, isFetching } = useQuery<DashboardData>({
    queryKey: ['history-data', applied],
    queryFn: () => {
      const p = new URLSearchParams({ dateRange: applied.dateRange })
      if (applied.dateRange === 'custom') {
        if (applied.dateFrom) p.set('dateFrom', applied.dateFrom)
        if (applied.dateTo)   p.set('dateTo',   applied.dateTo)
      }
      applied.segmentIds.forEach(id => p.append('businessSegmentIds', id))
      applied.brandIds.forEach(id => p.append('brandIds', id))
      applied.environmentIds.forEach(id => p.append('environmentIds', id))
      applied.processIds.forEach(id => p.append('businessProcessIds', id))
      return apiClient
        .get<DashboardData>(`/HistoryDashboard/GetDashboardData?${p}`)
        .then(r => applyTrends(r.data))
    },
  })

  const kpi = data?.kpi
  const selectStyle: React.CSSProperties = {
    background: 'rgba(30,41,59,.8)',
    color: '#e2e8f0',
    border: '1px solid rgba(46,134,193,.3)',
    fontSize: 13,
  }

  function MultiSelect({ options, value, onChange }: {
    options: FilterOption[]
    value: string[]
    onChange: (v: string[]) => void
  }) {
    return (
      <select
        className="form-select form-select-sm"
        multiple
        value={value}
        onChange={e => onChange(Array.from(e.target.selectedOptions).map(o => o.value))}
        style={{ ...selectStyle, height: 70 }}
      >
        {options.map(o => <option key={o.value} value={String(o.value)}>{o.text}</option>)}
      </select>
    )
  }

  // FIX: use totalCount (API) instead of volume; use topIntegrations for perf table max
  const maxTopInt  = Math.max(...(data?.topIntegrations.map(i => i.totalCount) ?? []), 1)
  const maxSysVol  = Math.max(...(data?.systemHealth.map(s => s.volume)        ?? []), 1)
  const maxPerfVol = Math.max(...(data?.topIntegrations?.map(p => p.totalCount) ?? []), 1)

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 160px)', background: 'var(--gtek-dark-blue)' }}>

      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{
        width: 280,
        flexShrink: 0,
        background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
        borderRight: '2px solid rgba(46,134,193,.25)',
        padding: '24px 16px 100px',
        overflowY: 'auto',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 20 }}>
          <i className="fas fa-filter me-2" />Filters
        </div>

        {/* Date range buttons */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: 'rgba(255,255,255,.7)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 6 }}>
            Date Range
          </label>
          <div className="d-flex flex-wrap gap-2">
            {DATE_RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`btn btn-sm ${dateRange === opt.value ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ fontSize: 12, padding: '3px 10px' }}
                onClick={() => setDateRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {dateRange === 'custom' && (
            <div className="mt-2 d-flex flex-column gap-2">
              <input type="date" className="form-control form-control-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={selectStyle} />
              <input type="date" className="form-control form-control-sm" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={selectStyle} />
            </div>
          )}
        </div>

        {/* Multi-select filters */}
        {[
          { label: 'Business Segment', opts: filterOpts?.businessSegments ?? [], value: segmentIds, onChange: setSegmentIds },
          { label: 'Brand',            opts: filterOpts?.brands           ?? [], value: brandIds,    onChange: setBrandIds    },
          { label: 'Environment',      opts: filterOpts?.environments     ?? [], value: environmentIds, onChange: setEnvironmentIds },
          { label: 'Business Process', opts: filterOpts?.businessProcesses ?? [], value: processIds,  onChange: setProcessIds  },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 16 }}>
            <label style={{ color: 'rgba(255,255,255,.7)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 6 }}>
              {f.label}
            </label>
            <MultiSelect options={f.opts} value={f.value} onChange={f.onChange} />
          </div>
        ))}

        <div className="d-flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <button className="btn btn-primary btn-sm flex-fill" onClick={handleApply} disabled={isFetching}>
            <i className="fas fa-search me-1" />Apply
          </button>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => { setSegmentIds([]); setBrandIds([]); setEnvironmentIds([]); setProcessIds([]); setDateRange('30d') }}
          >
            <i className="fas fa-times" />
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '1.5rem 1.5rem 2rem', overflowX: 'hidden' }}>

        {/* Page header */}
        <div className="mb-4 d-flex align-items-start justify-content-between flex-wrap gap-2">
          <div>
            <h1 className="h3 text-white mb-1">
              <i className="fas fa-clock-rotate-left me-2 text-primary" />
              History Monitoring Dashboard
              <span className="badge bg-secondary ms-2" style={{ fontSize: 12, verticalAlign: 'middle' }}>Historical Data</span>
            </h1>
            <p className="text-muted mb-0" style={{ fontSize: 14 }}>
              Historical transaction analytics for 30+ day analysis
            </p>
            {kpi?.dateFrom && kpi?.dateTo && (
              <span
                id="activeRangeLabel"
                style={{
                  display: 'inline-block',
                  marginTop: 6,
                  fontSize: 12,
                  color: '#AED6F1',
                  background: 'rgba(46,134,193,.15)',
                  border: '1px solid rgba(46,134,193,.35)',
                  borderRadius: 6,
                  padding: '2px 10px',
                }}
              >
                <i className="fas fa-calendar-alt me-1" style={{ fontSize: 10 }} />
                {new Date(kpi.dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {' — '}
                {new Date(kpi.dateTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
          {isFetching && <span className="text-muted" style={{ fontSize: 13 }}><span className="spinner-border spinner-border-sm me-1" />Loading…</span>}
        </div>

        {/* KPI tiles */}
        <div className="row g-3 mb-4">
          {[
            // FIX: errorCount replaces totalErrors; errorCountTrend replaces totalErrorsTrend
            { label: 'Total Transactions',   value: kpi?.totalTransactions?.toLocaleString()   ?? '–', trend: kpi?.totalTransactionsTrend,  accent: '#3498DB', icon: 'fas fa-exchange-alt' },
            { label: 'Success Rate',         value: kpi ? `${kpi.successRate.toFixed(1)}%`      : '–', trend: kpi?.successRateTrend,         accent: '#2ECC71', icon: 'fas fa-check-circle' },
            { label: 'Total Errors',         value: kpi?.errorCount?.toLocaleString()           ?? '–', trend: kpi?.errorCountTrend,          accent: '#E74C3C', icon: 'fas fa-exclamation-triangle' },
            { label: 'Avg Response',         value: kpi ? `${Math.round(kpi.avgResponseMs)} ms` : '–', trend: kpi?.avgResponseMsTrend,        accent: '#F39C12', icon: 'fas fa-tachometer-alt' },
            { label: 'Active Integrations',  value: kpi?.activeIntegrations?.toString()         ?? '–', trend: kpi?.activeIntegrationsTrend,  accent: '#9B59B6', icon: 'fas fa-plug' },
          ].map(k => (
            <div key={k.label} className="col-6 col-xl">
              <div style={{ ...CARD_STYLE, borderLeft: `4px solid ${k.accent}` }}>
                <div className="d-flex justify-content-between align-items-start">
                  <i className={k.icon} style={{ color: k.accent, fontSize: 18, marginTop: 2 }} />
                  <TrendBadge value={k.trend} />
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginTop: 8, lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Row 1: Daily Volume + Top Integrations */}
        <div className="row g-3 mb-3">
          <div className="col-lg-8">
            <div style={CARD_STYLE}>
              <h6 style={{ color: '#AED6F1' }} className="mb-3">Daily Transaction Volume</h6>
              {data?.dailyVolume?.length ? (
                <>
                  <VStack items={data.dailyVolume} />
                  <div className="d-flex gap-3 mt-2" style={{ fontSize: 11 }}>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#2ECC71', borderRadius: 2, marginRight: 4 }} />Success</span>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#E74C3C', borderRadius: 2, marginRight: 4 }} />Error</span>
                  </div>
                </>
              ) : <div style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>No data</div>}
            </div>
          </div>
          <div className="col-lg-4">
            <div style={CARD_STYLE}>
              <h6 style={{ color: '#AED6F1' }} className="mb-3">Top Integrations by Volume</h6>
              {data?.topIntegrations?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* FIX: integrationName (was name), totalCount (was volume) */}
                  {data.topIntegrations.slice(0, 8).map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 120, fontSize: 11, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={item.integrationName}>
                        {item.integrationName}
                      </div>
                      <HBar value={item.totalCount} max={maxTopInt} color="#3498DB" />
                      <div style={{ width: 36, fontSize: 11, color: '#94a3b8', textAlign: 'right', flexShrink: 0 }}>{item.totalCount}</div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>No data</div>}
            </div>
          </div>
        </div>

        {/* Row 2: Error Pattern + System Health */}
        <div className="row g-3 mb-3">
          <div className="col-lg-8">
            <div style={CARD_STYLE}>
              <h6 style={{ color: '#AED6F1' }} className="mb-3">Error Pattern Timeline</h6>
              {data?.errorPatterns?.length ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, overflowX: 'auto' }}>
                  {(() => {
                    // FIX: errorCount + warningCount (were errors + warnings)
                    const maxE = Math.max(...data.errorPatterns.map(p => p.errorCount + p.warningCount), 1)
                    return data.errorPatterns.map((p, i) => {
                      const errH  = (p.errorCount   / maxE) * 120
                      const warnH = (p.warningCount / maxE) * 120
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }} title={`${p.date}`}>
                          <div style={{ display: 'flex', flexDirection: 'column', width: 10 }}>
                            {warnH > 0 && <div style={{ height: warnH, background: '#F39C12', borderRadius: '2px 2px 0 0' }} />}
                            {errH  > 0 && <div style={{ height: errH,  background: '#E74C3C', borderRadius: warnH > 0 ? 0 : '2px 2px 0 0' }} />}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              ) : <div style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>No data</div>}
              <div className="d-flex gap-3 mt-2" style={{ fontSize: 11 }}>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#E74C3C', borderRadius: 2, marginRight: 4 }} />Errors</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#F39C12', borderRadius: 2, marginRight: 4 }} />Warnings</span>
              </div>
            </div>
          </div>
          <div className="col-lg-4">
            <div style={CARD_STYLE}>
              <h6 style={{ color: '#AED6F1' }} className="mb-3">Source System Health</h6>
              {data?.systemHealth?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* FIX: systemName (was system), availabilityRate (was successRate) */}
                  {data.systemHealth.slice(0, 8).map((s, i) => {
                    const color = s.availabilityRate >= 95 ? '#2ECC71' : s.availabilityRate >= 80 ? '#F39C12' : '#E74C3C'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 100, fontSize: 11, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.systemName}</div>
                        <HBar value={s.volume} max={maxSysVol} color={color} />
                        <div style={{ width: 44, fontSize: 10, color, textAlign: 'right', flexShrink: 0 }}>{s.availabilityRate.toFixed(0)}%</div>
                      </div>
                    )
                  })}
                </div>
              ) : <div style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>No data</div>}
            </div>
          </div>
        </div>

        {/* Integration Performance Table */}
        {/* FIX: use topIntegrations (API) instead of missing performanceTable field */}
        {data?.topIntegrations?.length ? (
          <div style={CARD_STYLE}>
            <h6 style={{ color: '#AED6F1' }} className="mb-3">Integration Performance</h6>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Integration', 'Volume', 'Success', 'Errors', 'Success Rate', 'Avg (ms)'].map(h => (
                      <th key={h} style={{ color: '#AED6F1', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.12)', padding: '6px 8px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.topIntegrations.map((row, i) => {
                    const successCount = row.totalCount - row.errorCount
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                        <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>{row.integrationName}</td>
                        <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{row.totalCount.toLocaleString()}</td>
                        <td style={{ padding: '6px 8px', color: '#2ECC71' }}>{successCount.toLocaleString()}</td>
                        <td style={{ padding: '6px 8px', color: '#E74C3C' }}>{row.errorCount.toLocaleString()}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <HBar value={successCount > 0 ? successCount : 0} max={maxPerfVol} color={row.successRate >= 95 ? '#2ECC71' : row.successRate >= 80 ? '#F39C12' : '#E74C3C'} />
                            <span style={{ color: '#e2e8f0', fontSize: 12, width: 44, textAlign: 'right', flexShrink: 0 }}>{row.successRate.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '6px 8px', color: '#94a3b8', textAlign: 'right' }}>{row.avgResponseMs.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

      </div>
    </div>
  )
}
