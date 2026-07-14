import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import Chart, { Series, ArgumentAxis, ValueAxis, Legend, Tooltip, CommonSeriesSettings } from 'devextreme-react/chart'
import PieChart, { Series as PieSeries, Label, Connector } from 'devextreme-react/pie-chart'
import apiClient from '../../services/apiClient'

// ── Types ──────────────────────────────────────────────────────────────────────
interface DashboardFilters {
  timePeriod: string
  environmentId: number | null
  businessProcessId: number | null
  businessSubprocessId: number | null
  countryId: number | null
  brandId: number | null
  direction: string | null
  documentType: string | null
}

interface FilterOptions {
  environments: { environmentId: number; environmentName: string }[]
  businessProcesses: { businessProcessId: number; processName: string }[]
  businessSubprocesses: { businessSubprocessId: number; subprocessName: string; businessProcessId: number }[]
  countries: { countryId: number; countryName: string }[]
  brands: { brandId: number; brandName: string; businessSegmentId: number }[]
  documentTypes: string[]
}

interface Metrics { total: number; successful: number; failed: number }
interface NameCount { name?: string; processName?: string; subprocessName?: string; countryName?: string; code?: string; count: number }
interface TrendData { labels: string[]; counts: number[] }
interface TrendChartData { labels: string[]; datasets: { label: string; data: number[] }[] }
interface TreemapItem { name: string; value: number; color: string; successCount: number; errorCount: number; successRate: number }

const DEFAULT_FILTERS: DashboardFilters = {
  timePeriod: 'Last24Hours',
  environmentId: null,
  businessProcessId: null,
  businessSubprocessId: null,
  countryId: null,
  brandId: null,
  direction: null,
  documentType: null,
}

// ── Chart Colors ───────────────────────────────────────────────────────────────
const CHART_COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#95a5a6', '#34495e', '#16a085']

// ── Sub-components ─────────────────────────────────────────────────────────────
function MetricCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      background: 'rgba(15,23,42,.85)', border: `1px solid rgba(46,134,193,.2)`, borderLeft: `4px solid ${color}`,
      borderRadius: 8, padding: '24px 20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, fontWeight: 700, color, lineHeight: 1 }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 12, color: '#aed6f1', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

function CardWrap({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ background: 'rgba(46,134,193,.15)', borderBottom: '1px solid rgba(46,134,193,.2)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className={icon} style={{ color: '#3b82f6', fontSize: 13 }} />
        <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>{title}</span>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

// ── Treemap layout (squarified algorithm) ──────────────────────────────────────
interface TmRect { x: number; y: number; w: number; h: number }
interface TmLayoutItem { item: TreemapItem; rect: TmRect }

function tmWorstAspect(areas: number[], rowArea: number, shortSide: number): number {
  if (shortSide === 0) return Infinity
  const stripW = rowArea / shortSide
  if (stripW === 0) return Infinity
  return Math.max(...areas.map(a => {
    const itemShort = a / stripW
    if (itemShort === 0) return Infinity
    return Math.max(stripW, itemShort) / Math.min(stripW, itemShort)
  }))
}

function squarifySlice(
  items: { item: TreemapItem; area: number }[],
  x: number, y: number, w: number, h: number,
  result: TmLayoutItem[],
) {
  if (!items.length || w <= 0 || h <= 0) return
  if (items.length === 1) {
    result.push({ item: items[0].item, rect: { x, y, w, h } })
    return
  }

  const shortSide = Math.min(w, h)
  let row: { item: TreemapItem; area: number }[] = []
  let rowArea = 0
  let prevWorst = Infinity

  for (let i = 0; i < items.length; i++) {
    const candidate = [...row, items[i]]
    const candidateArea = rowArea + items[i].area
    const worst = tmWorstAspect(candidate.map(c => c.area), candidateArea, shortSide)
    if (row.length === 0 || worst <= prevWorst) {
      row = candidate
      rowArea = candidateArea
      prevWorst = worst
    } else {
      break
    }
  }

  const rest = items.slice(row.length)
  if (w >= h) {
    const bandW = rowArea / h
    let cy = y
    for (const r of row) {
      const rh = r.area / bandW
      result.push({ item: r.item, rect: { x, y: cy, w: bandW, h: rh } })
      cy += rh
    }
    squarifySlice(rest, x + bandW, y, w - bandW, h, result)
  } else {
    const bandH = rowArea / w
    let cx = x
    for (const r of row) {
      const rw = r.area / bandH
      result.push({ item: r.item, rect: { x: cx, y, w: rw, h: bandH } })
      cx += rw
    }
    squarifySlice(rest, x, y + bandH, w, h - bandH, result)
  }
}

function squarifiedTreemap(items: TreemapItem[], w: number, h: number): TmLayoutItem[] {
  if (!items.length || w <= 0 || h <= 0) return []
  const totalValue = items.reduce((s, i) => s + i.value, 0)
  if (totalValue === 0) return []
  const totalArea = w * h
  const sorted = [...items]
    .sort((a, b) => b.value - a.value)
    .map(item => ({ item, area: (item.value / totalValue) * totalArea }))
  const result: TmLayoutItem[] = []
  squarifySlice(sorted, 0, 0, w, h, result)
  return result
}

// ── Treemap component ──────────────────────────────────────────────────────────
const TREEMAP_H = 280

function Treemap({ items }: { items: TreemapItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(0)
  const [tooltip, setTooltip] = useState<{ item: TreemapItem; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerW(el.clientWidth)
    const obs = new ResizeObserver(() => setContainerW(el.clientWidth))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const layout = items.length > 0 && containerW > 0
    ? squarifiedTreemap(items, containerW, TREEMAP_H)
    : []

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: TREEMAP_H, overflow: 'hidden' }}>
      {!items.length && (
        <div style={{ color: '#808b96', textAlign: 'center', padding: 24, fontSize: 13, lineHeight: `${TREEMAP_H}px` }}>No data</div>
      )}
      {layout.map(({ item, rect }) => (
        <div
          key={item.name}
          style={{
            position: 'absolute',
            left: rect.x + 1,
            top: rect.y + 1,
            width: Math.max(rect.w - 2, 0),
            height: Math.max(rect.h - 2, 0),
            background: item.color || '#3498db',
            borderRadius: 3,
            cursor: 'pointer',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '4px 6px',
            boxSizing: 'border-box',
          }}
          onMouseEnter={e => setTooltip({ item, x: e.clientX, y: e.clientY })}
          onMouseMove={e => setTooltip({ item, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setTooltip(null)}
        >
          {rect.w > 60 && rect.h > 20 && (
            <div style={{ fontSize: Math.min(11, Math.floor(rect.h / 3)), fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.name}
            </div>
          )}
          {rect.w > 60 && rect.h > 36 && (
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.8)', marginTop: 1 }}>
              {item.value.toLocaleString()}
            </div>
          )}
        </div>
      ))}
      {tooltip && (
        <div style={{ position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 40, background: 'rgba(0,0,0,.9)', color: '#fff', padding: '8px 12px', borderRadius: 4, fontSize: 12, pointerEvents: 'none', zIndex: 9999 }}>
          <strong>{tooltip.item.name}</strong><br />
          Messages: {tooltip.item.value.toLocaleString()}<br />
          Success: {tooltip.item.successCount.toLocaleString()} ({tooltip.item.successRate}%)<br />
          Errors: {tooltip.item.errorCount.toLocaleString()}
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)
  const [applied, setApplied] = useState<DashboardFilters>(DEFAULT_FILTERS)
  const [filtersVisible, setFiltersVisible] = useState(true)
  // Incrementing counter appended to every data query key so that clicking
  // Refresh forces a re-fetch even when filter values have not changed
  // (React Query deduplicates by deep-equal key, so a plain object spread is
  // not enough when the values are identical).
  const [refetchCount, setRefetchCount] = useState(0)

  // Auto-refresh every 30 s — increment the counter instead of spreading the
  // same object, which had the same deep-equal deduplication problem.
  useEffect(() => {
    const id = setInterval(() => setRefetchCount(c => c + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Auto-apply on filter change: update both the UI state and the applied
  // state in one shot so React Query sees a new query key immediately.
  // This mirrors the Razor behaviour where dxTagBox/dxSelectBox onValueChanged
  // triggers loadData() without requiring an explicit Refresh click.
  const setF = (key: keyof DashboardFilters, val: string | number | null) =>
    setFilters(f => {
      const updated = { ...f, [key]: val }
      setApplied(updated)
      return updated
    })

  // Manual refresh: re-apply current filters AND bump the counter so React
  // Query re-issues queries even when filter values are unchanged.
  const handleRefresh = useCallback(() => {
    setApplied({ ...filters })
    setRefetchCount(c => c + 1)
  }, [filters])

  const qOpts = {
    queryKey: ['dashboard-rt', 'filterOptions'],
    queryFn: () => apiClient.get<FilterOptions>('/Dashboard/GetFilterOptions').then(r => r.data),
  }
  const qMetrics = {
    queryKey: ['dashboard-rt', 'metrics', applied, refetchCount],
    queryFn: () => apiClient.get<Metrics>('/Dashboard/GetMetrics', { params: applied }).then(r => r.data),
  }
  const qProcesses = {
    queryKey: ['dashboard-rt', 'topProcesses', applied, refetchCount],
    queryFn: () => apiClient.get<NameCount[]>('/Dashboard/GetTopProcesses', { params: applied }).then(r => r.data),
  }
  const qSubproc = {
    queryKey: ['dashboard-rt', 'subprocesses', applied, refetchCount],
    queryFn: () => apiClient.get<NameCount[]>('/Dashboard/GetSubprocessTransactions', { params: applied }).then(r => r.data),
  }
  const qCountry = {
    queryKey: ['dashboard-rt', 'countries', applied, refetchCount],
    queryFn: () => apiClient.get<NameCount[]>('/Dashboard/GetTransactionsByCountry', { params: applied }).then(r => r.data),
  }
  const qTrend = {
    queryKey: ['dashboard-rt', 'trend', applied, refetchCount],
    queryFn: () => apiClient.get<TrendChartData>('/Dashboard/GetTransactionTrend', { params: applied }).then(r => r.data),
  }
  const qErrorTrend = {
    queryKey: ['dashboard-rt', 'errorTrend', applied, refetchCount],
    queryFn: () => apiClient.get<TrendData>('/Dashboard/GetErrorRateTrend', { params: applied }).then(r => r.data),
  }
  const qFailingInt = {
    queryKey: ['dashboard-rt', 'failingIntegrations', applied, refetchCount],
    queryFn: () => apiClient.get<NameCount[]>('/Dashboard/GetTopFailingIntegrations', { params: applied }).then(r => r.data),
  }
  const qErrorCodes = {
    queryKey: ['dashboard-rt', 'errorCodes', applied, refetchCount],
    queryFn: () => apiClient.get<NameCount[]>('/Dashboard/GetTopErrorCodes', { params: applied }).then(r => r.data),
  }
  const qTreemap = {
    queryKey: ['dashboard-rt', 'treemap', applied, refetchCount],
    queryFn: () => apiClient.get<TreemapItem[]>('/Dashboard/GetIntegrationTreemap', { params: applied }).then(r => r.data),
  }

  const { data: opts } = useQuery(qOpts)
  const { data: metrics } = useQuery(qMetrics)
  const { data: processes } = useQuery(qProcesses)
  const { data: subproc } = useQuery(qSubproc)
  const { data: countries } = useQuery(qCountry)
  const { data: trend } = useQuery(qTrend)
  const { data: errorTrend } = useQuery(qErrorTrend)
  const { data: failingInt } = useQuery(qFailingInt)
  const { data: errorCodes } = useQuery(qErrorCodes)
  const { data: treemap } = useQuery(qTreemap)

  // Normalize NameCount items
  const processItems = (processes ?? []).map(d => ({ name: d.processName ?? d.name ?? '', count: d.count }))
  const subprocItems = (subproc ?? []).map(d => ({ name: d.subprocessName ?? d.name ?? '', count: d.count }))
  const countryItems = (countries ?? []).map(d => ({ name: d.countryName ?? d.name ?? '', count: d.count }))
  const errorTrendItems = (errorTrend?.labels ?? []).map((l, i) => ({ label: l, count: errorTrend?.counts[i] ?? 0 }))
  const trendItems = (trend?.labels ?? []).map((l, i) => {
    const row: Record<string, unknown> = { label: l }
    trend?.datasets.forEach(ds => { row[ds.label] = ds.data[i] ?? 0 })
    return row
  })
  const trendSeries = trend?.datasets.map(ds => ds.label) ?? []
  const failItems = (failingInt ?? []).map(d => ({ name: d.name ?? '', count: d.count }))
  const codeItems = (errorCodes ?? []).map(d => ({ name: d.code ?? d.name ?? '', count: d.count }))

  const selectStyle: React.CSSProperties = {
    background: 'rgba(30,41,59,.5)', border: '1px solid rgba(46,134,193,.3)', borderRadius: 6,
    color: '#fff', fontSize: 13, padding: '6px 10px', width: '100%',
  }

  const visSubproc = opts?.businessSubprocesses?.filter(
    s => !filters.businessProcessId || s.businessProcessId === Number(filters.businessProcessId)
  ) ?? []

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>
      <div className="mb-4">
        <h1 className="h3 text-white mb-1">
          <i className="fas fa-tv me-2 text-primary" />Real Time Monitoring Dashboard
        </h1>
        <p className="text-muted mb-0" style={{ fontSize: 14 }}>Real-time transaction monitoring and analytics</p>
      </div>

      {/* Filters */}
      {filtersVisible && (
        <div style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div className="row g-2">
            <div className="col-md-2">
              <label style={{ fontSize: 11, color: '#aed6f1', display: 'block', marginBottom: 4, fontWeight: 500 }}>TIME PERIOD</label>
              <select style={selectStyle} value={filters.timePeriod} onChange={e => setF('timePeriod', e.target.value)}>
                <option value="">All Time</option>
                <option value="Today">Today</option>
                <option value="Last24Hours">Last 24 Hours</option>
                <option value="Last7Days">Last 7 Days</option>
                <option value="Last30Days">Last 30 Days</option>
              </select>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: 11, color: '#aed6f1', display: 'block', marginBottom: 4, fontWeight: 500 }}>ENVIRONMENT</label>
              <select style={selectStyle} value={filters.environmentId ?? ''} onChange={e => setF('environmentId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">All</option>
                {opts?.environments?.map(e => <option key={e.environmentId} value={e.environmentId}>{e.environmentName}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: 11, color: '#aed6f1', display: 'block', marginBottom: 4, fontWeight: 500 }}>BUSINESS PROCESS</label>
              <select style={selectStyle} value={filters.businessProcessId ?? ''} onChange={e => setF('businessProcessId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">All</option>
                {opts?.businessProcesses?.map(p => <option key={p.businessProcessId} value={p.businessProcessId}>{p.processName}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: 11, color: '#aed6f1', display: 'block', marginBottom: 4, fontWeight: 500 }}>SUBPROCESS</label>
              <select style={selectStyle} value={filters.businessSubprocessId ?? ''} onChange={e => setF('businessSubprocessId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">All</option>
                {visSubproc.map(s => <option key={s.businessSubprocessId} value={s.businessSubprocessId}>{s.subprocessName}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: 11, color: '#aed6f1', display: 'block', marginBottom: 4, fontWeight: 500 }}>COUNTRY</label>
              <select style={selectStyle} value={filters.countryId ?? ''} onChange={e => setF('countryId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">All</option>
                {opts?.countries?.map(c => <option key={c.countryId} value={c.countryId}>{c.countryName}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: 11, color: '#aed6f1', display: 'block', marginBottom: 4, fontWeight: 500 }}>BRAND</label>
              <select style={selectStyle} value={filters.brandId ?? ''} onChange={e => setF('brandId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">All</option>
                {opts?.brands?.map(b => <option key={b.brandId} value={b.brandId}>{b.brandName}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: 11, color: '#aed6f1', display: 'block', marginBottom: 4, fontWeight: 500 }}>DIRECTION</label>
              <select style={selectStyle} value={filters.direction ?? ''} onChange={e => setF('direction', e.target.value || null)}>
                <option value="">All</option>
                <option value="Inbound">Inbound</option>
                <option value="Outbound">Outbound</option>
              </select>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: 11, color: '#aed6f1', display: 'block', marginBottom: 4, fontWeight: 500 }}>DOCUMENT TYPE</label>
              <select style={selectStyle} value={filters.documentType ?? ''} onChange={e => setF('documentType', e.target.value || null)}>
                <option value="">All</option>
                {opts?.documentTypes?.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-md-4 d-flex align-items-end gap-2">
              <button className="btn btn-primary btn-sm" onClick={handleRefresh}><i className="fas fa-sync-alt me-1" />Refresh</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setFiltersVisible(false)}>
                <i className="fas fa-eye-slash me-1" />Hide Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {!filtersVisible && (
        <div className="mb-3">
          <button className="btn btn-secondary btn-sm" onClick={() => setFiltersVisible(true)}>
            <i className="fas fa-eye me-1" />Show Filters
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-4"><MetricCard value={metrics?.total ?? 0} label="Total" color="#3498db" /></div>
        <div className="col-md-4"><MetricCard value={metrics?.successful ?? 0} label="Successful" color="#2ecc71" /></div>
        <div className="col-md-4"><MetricCard value={metrics?.failed ?? 0} label="Failure" color="#e74c3c" /></div>
      </div>

      {/* Row 1: Process pie, Subprocess bar, Country bar */}
      <div className="row g-3 mb-3">
        <div className="col-lg-4">
          <CardWrap title="Top Used Processes" icon="fas fa-chart-pie">
            <PieChart dataSource={processItems} palette={CHART_COLORS} height={260}>
              <PieSeries argumentField="name" valueField="count">
                <Label visible={true} position="outside" customizeText={(pt: { percentText: string }) => pt.percentText}>
                  <Connector visible={true} />
                </Label>
              </PieSeries>
              <Legend visible={true} verticalAlignment="bottom" horizontalAlignment="center" />
              <Tooltip enabled={true} customizeTooltip={(pt: { argument: string; value: number }) => ({ text: `${pt.argument}: ${pt.value.toLocaleString()}` })} />
            </PieChart>
          </CardWrap>
        </div>
        <div className="col-lg-4">
          <CardWrap title="Transaction Count by SubProcesses" icon="fas fa-chart-bar">
            <Chart dataSource={subprocItems} rotated={true} height={260}>
              <CommonSeriesSettings type="bar" argumentField="name" />
              <Series valueField="count" name="Transactions" color="#3498db" />
              <ArgumentAxis>
                <Tooltip enabled={true} />
              </ArgumentAxis>
              <ValueAxis />
              <Legend visible={false} />
              <Tooltip enabled={true} />
            </Chart>
          </CardWrap>
        </div>
        <div className="col-lg-4">
          <CardWrap title="Transaction Count by Country" icon="fas fa-globe">
            <Chart dataSource={countryItems} height={260}>
              <CommonSeriesSettings type="bar" argumentField="name" />
              <Series valueField="count" name="Transactions" color="#2ecc71" />
              <ArgumentAxis />
              <ValueAxis />
              <Legend visible={false} />
              <Tooltip enabled={true} />
            </Chart>
          </CardWrap>
        </div>
      </div>

      {/* Row 2: Trend line */}
      <div className="row g-3 mb-3">
        <div className="col-12">
          <CardWrap title="Trend of Transactions by Status Over Time" icon="fas fa-chart-line">
            <Chart dataSource={trendItems} height={280}>
              <CommonSeriesSettings type="line" argumentField="label" />
              {trendSeries.map((s, i) => (
                <Series key={s} valueField={s} name={s} color={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
              <ArgumentAxis />
              <ValueAxis />
              <Legend visible={true} verticalAlignment="bottom" horizontalAlignment="center" />
              <Tooltip enabled={true} shared={true} />
            </Chart>
          </CardWrap>
        </div>
      </div>

      {/* Row 3: Error trend, Top failing integrations, Top error codes */}
      <div className="row g-3 mb-3">
        <div className="col-lg-4">
          <CardWrap title="Trend of Errors Over Time" icon="fas fa-exclamation-triangle">
            <Chart dataSource={errorTrendItems} height={260}>
              <CommonSeriesSettings type="area" argumentField="label" />
              <Series valueField="count" name="Errors" color="#e74c3c" />
              <ArgumentAxis />
              <ValueAxis />
              <Legend visible={false} />
              <Tooltip enabled={true} />
            </Chart>
          </CardWrap>
        </div>
        <div className="col-lg-4">
          <CardWrap title="Top Failing Integrations" icon="fas fa-bug">
            <Chart dataSource={failItems} rotated={true} height={260}>
              <CommonSeriesSettings type="bar" argumentField="name" />
              <Series valueField="count" name="Errors" color="#e74c3c" />
              <ArgumentAxis />
              <ValueAxis />
              <Legend visible={false} />
              <Tooltip enabled={true} />
            </Chart>
          </CardWrap>
        </div>
        <div className="col-lg-4">
          <CardWrap title="Top Error Codes" icon="fas fa-code">
            <Chart dataSource={codeItems} rotated={true} height={260}>
              <CommonSeriesSettings type="bar" argumentField="name" />
              <Series valueField="count" name="Errors" color="#e74c3c" />
              <ArgumentAxis />
              <ValueAxis />
              <Legend visible={false} />
              <Tooltip enabled={true} />
            </Chart>
          </CardWrap>
        </div>
      </div>

      {/* Row 4: Treemap */}
      <div className="row g-3">
        <div className="col-12">
          <CardWrap title="Count of Messages per Integration Name" icon="fas fa-th">
            <Treemap items={treemap ?? []} />
          </CardWrap>
        </div>
      </div>
    </div>
  )
}
