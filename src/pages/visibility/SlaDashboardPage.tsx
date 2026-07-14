import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Chart, Series, ValueAxis, CommonSeriesSettings, Legend, Tooltip,
  ConstantLine, ConstantLineLabel,
} from 'devextreme-react/chart'
import apiClient from '../../services/apiClient'
import { useDashboardFilterOptions } from '../../hooks/useDashboard'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SlaKpiGroup {
  executed: number
  within: number
  warning: number
  outOfSla: number
  compliance: number
}

interface ByCause {
  cause: string
  count: number
}

interface TopOffender {
  name: string
  count: number
}

interface SlaKpiResponse {
  process: SlaKpiGroup
  subprocess: SlaKpiGroup
  byCause: ByCause[]
  topOffenders: TopOffender[]
}

// Raw API shape from /SlaDashboard/GetSlaDrillDown
interface ApiDrillRow {
  messageId?: string
  processName: string
  subprocessName?: string
  expectedMs?: number
  warningMs?: number
  criticalMs?: number
  elapsedMs?: number
  status: string
  errorCode?: string
  errorMessage?: string
}

interface DrillRow {
  messageId?: string
  processName: string
  subprocessName?: string
  expectedMs?: number
  warningMs?: number
  criticalMs?: number
  elapsedMs?: number
  status: string
  error?: string
}

interface SlaBounds {
  isConfigured: boolean
  expectedDurationMs: number
  warningThresholdMs: number
  criticalThresholdMs: number
}

interface TimelinePoint {
  step: string
  elapsedMs: number
  execMs: number
}

interface WaterfallPoint {
  stepLabel: string
  startOffset: number
  endOffset: number
  slaStatus: string
}

interface TransactionDetail {
  status: string
  steps: number
  totalTimeMs: number
  slaSummary?: string
  sla?: SlaBounds
  timeline?: { name: string; startMs: number; endMs: number }[]
  timelinePoints?: TimelinePoint[]
  waterfallPoints?: WaterfallPoint[]
  sequence?: { from: string; to: string; label: string }[]
  stepRows?: {
    stepName: string
    system: string
    status: string
    durationMs: number
    timestamp: string
  }[]
}

// Raw API shape from /Transactions/GetTransactionDetails
interface ApiTimelineEntry {
  startTimestamp: string
  integrationName: string
  executionTimeMs: number
  sourceSystem: string
  targetSystem: string
  status: string
  errorCode?: string
  errorMessage?: string
}

interface ApiTransactionDetailsResponse {
  mainTransaction?: { status?: string }
  timeline: ApiTimelineEntry[]
  summary: {
    totalSteps: number
    totalElapsedMs: number
    overallStatus: string
  }
  sla: {
    isConfigured: boolean
    expectedDurationMs: number
    warningThresholdMs: number
    criticalThresholdMs: number
    status: string
    source?: string
  }
}

// ── Response adapters ─────────────────────────────────────────────────────────

/** Map raw drill-down rows (with errorCode/errorMessage) to DrillRow (with error string) */
function adaptDrillRows(rows: ApiDrillRow[]): DrillRow[] {
  return rows.map(({ errorCode, errorMessage, ...rest }) => ({
    ...rest,
    error: errorCode
      ? `[${errorCode}] ${errorMessage ?? ''}`.trim()
      : errorMessage ?? undefined,
  }))
}

/** Map /Transactions/GetTransactionDetails raw response to TransactionDetail */
function adaptTransactionDetails(raw: ApiTransactionDetailsResponse): TransactionDetail {
  const timeline = raw.timeline ?? []

  // Build cumulative timeline points (elapsed = running total, execMs = step duration)
  let cumulativeMs = 0
  const timelinePoints: TimelinePoint[] = timeline.map(entry => {
    cumulativeMs += entry.executionTimeMs ?? 0
    return {
      step: entry.integrationName,
      elapsedMs: cumulativeMs,
      execMs: entry.executionTimeMs ?? 0,
    }
  })

  // Build waterfall (Gantt-style: startOffset → endOffset per step)
  let offsetMs = 0
  const waterfallPoints: WaterfallPoint[] = timeline.map(entry => {
    const start = offsetMs
    offsetMs += entry.executionTimeMs ?? 0
    return {
      stepLabel: entry.integrationName,
      startOffset: start,
      endOffset: offsetMs,
      slaStatus: entry.status,
    }
  })

  // Build sequence (unique system-to-system hops)
  const sequence = timeline.map(entry => ({
    from: entry.sourceSystem,
    to: entry.targetSystem,
    label: entry.integrationName,
  }))

  // Build step rows (used in the Steps detail table)
  const stepRows = timeline.map(entry => ({
    stepName: entry.integrationName,
    system: entry.targetSystem,
    status: entry.status,
    durationMs: entry.executionTimeMs ?? 0,
    timestamp: entry.startTimestamp,
  }))

  return {
    status: raw.summary?.overallStatus ?? raw.mainTransaction?.status ?? '',
    steps: raw.summary?.totalSteps ?? timeline.length,
    totalTimeMs: raw.summary?.totalElapsedMs ?? 0,
    slaSummary: raw.sla?.status,
    sla: raw.sla
      ? {
          isConfigured: raw.sla.isConfigured,
          expectedDurationMs: raw.sla.expectedDurationMs,
          warningThresholdMs: raw.sla.warningThresholdMs,
          criticalThresholdMs: raw.sla.criticalThresholdMs,
        }
      : undefined,
    timelinePoints,
    waterfallPoints,
    sequence,
    stepRows,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TIME_OPTIONS = [
  { value: 'LastHour',    label: 'Last hour' },
  { value: 'Last24Hours', label: 'Last 24 hours' },
  { value: 'Last7Days',   label: 'Last 7 days' },
  { value: 'Last30Days',  label: 'Last 30 days' },
]

function fmtDuration(ms?: number | null): string {
  if (ms == null) return '–'
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s % 60)}s`
}

const STATUS_LABEL: Record<string, string> = {
  success:  'Within SLA',
  warning:  'Warning',
  critical: 'Out of SLA',
  none:     'No SLA',
}

function slaColor(status: string): string {
  const map: Record<string, string> = {
    success:  '#2ECC71',
    warning:  '#F39C12',
    critical: '#E74C3C',
  }
  return map[status?.toLowerCase()] ?? '#94a3b8'
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    success:  ['rgba(46,204,113,.18)', '#2ECC71'],
    warning:  ['rgba(243,156,18,.18)', '#F39C12'],
    critical: ['rgba(231,76,60,.18)',  '#E74C3C'],
  }
  const [bg, fg] = colors[status?.toLowerCase()] ?? ['rgba(108,117,125,.18)', '#94a3b8']
  return (
    <span style={{ background: bg, color: fg, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
      {STATUS_LABEL[status?.toLowerCase()] ?? status}
    </span>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const CARD_BASE: React.CSSProperties = {
  background: 'rgba(30,41,59,.85)',
  border: '1px solid rgba(46,134,193,.25)',
  borderRadius: 12,
  padding: '18px 20px',
}

function KpiCard({ value, label, accent, onClick, active }: {
  value: string | number
  label: string
  accent: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <div
      style={{
        ...CARD_BASE,
        borderLeft: `4px solid ${accent}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform .12s ease, box-shadow .12s ease',
        boxShadow: active ? `0 0 0 2px #E67E22 inset` : undefined,
      }}
      onClick={onClick}
    >
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: label === 'Compliance' ? '#2ECC71' : undefined }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6 }}>{label}</div>
    </div>
  )
}

function CauseChart({ items }: { items: ByCause[] }) {
  if (!items.length) return <div style={{ color: '#64748b', padding: 16, textAlign: 'center' }}>No data</div>
  const max = Math.max(...items.map(i => i.count), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item) => (
        <div key={item.cause} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 200, color: '#cbd5e1', fontSize: 12, flexShrink: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.cause === 'TIME_EXCEEDED' ? 'Time exceeded (no error)' : item.cause}
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,.06)', borderRadius: 4, height: 20, position: 'relative' }}>
            <div style={{ width: `${(item.count / max) * 100}%`, background: '#E74C3C', borderRadius: 4, height: '100%' }} />
          </div>
          <div style={{ width: 40, color: '#cbd5e1', fontSize: 12, textAlign: 'right' }}>{item.count}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SlaDashboardPage() {
  const { data: filterOpts } = useDashboardFilterOptions()

  const [timePeriod, setTimePeriod]   = useState('Last30Days')
  const [environmentId, setEnvId]     = useState('')
  const [processId, setProcessId]     = useState('')

  // Applied params (only change on "Apply")
  const [applied, setApplied] = useState({ timePeriod: 'Last30Days', environmentId: '', processId: '' })

  // Last updated timestamp
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const handleApply = useCallback(() => {
    setApplied({ timePeriod, environmentId, processId })
    setActiveDrill(null)
    setFlowId(null)
  }, [timePeriod, environmentId, processId])

  // KPIs
  const { data: kpi, isFetching: kpiLoading } = useQuery<SlaKpiResponse>({
    queryKey: ['sla-kpis', applied],
    queryFn: () => {
      const p = new URLSearchParams({ TimePeriod: applied.timePeriod })
      if (applied.environmentId) p.set('EnvironmentId', applied.environmentId)
      if (applied.processId)     p.set('BusinessProcessId', applied.processId)
      return apiClient.get<SlaKpiResponse>(`/SlaDashboard/GetSlaKpis?${p}`).then(r => r.data)
    },
  })

  // Stamp last-updated time whenever KPI data arrives
  useEffect(() => {
    if (kpi) setLastUpdated(new Date().toLocaleTimeString())
  }, [kpi])

  // Drill-down
  const [activeDrill, setActiveDrill] = useState<{ status: string; level: string } | null>(null)

  const { data: drillRows, isFetching: drillLoading } = useQuery<DrillRow[]>({
    queryKey: ['sla-drill', applied, activeDrill],
    enabled: activeDrill != null,
    queryFn: () => {
      const p = new URLSearchParams({ TimePeriod: applied.timePeriod })
      if (applied.environmentId) p.set('EnvironmentId', applied.environmentId)
      if (applied.processId)     p.set('BusinessProcessId', applied.processId)
      p.set('status', activeDrill!.status)
      p.set('level',  activeDrill!.level)
      return apiClient
        .get<ApiDrillRow[]>(`/SlaDashboard/GetSlaDrillDown?${p}`)
        .then(r => adaptDrillRows(r.data))
    },
  })

  // Transaction Flow
  const [flowId, setFlowId]       = useState<string | null>(null)
  const [flowMode, setFlowMode]   = useState<'transaction' | 'correlation'>('transaction')

  const { data: flowDetail } = useQuery<TransactionDetail>({
    queryKey: ['sla-flow', flowId, flowMode],
    enabled: flowId != null,
    queryFn: () =>
      apiClient
        .get<ApiTransactionDetailsResponse>(
          `/Transactions/GetTransactionDetails?transactionId=${flowId}&viewMode=${flowMode}`
        )
        .then(r => adaptTransactionDetails(r.data)),
  })

  const selectStyle: React.CSSProperties = {
    background: 'rgba(30,41,59,.8)',
    color: '#e2e8f0',
    border: '1px solid rgba(46,134,193,.3)',
    fontSize: 13,
  }

  const sectionTitle = (text: string) => (
    <div style={{ color: '#AED6F1', fontSize: 14, textTransform: 'uppercase', letterSpacing: '.04em', margin: '8px 0 14px', fontWeight: 600 }}>
      {text}
    </div>
  )

  const panel = (children: React.ReactNode) => (
    <div style={{ ...CARD_BASE, height: '100%' }}>{children}</div>
  )

  function KpiRow({ data, level }: { data?: SlaKpiGroup; level: string }) {
    if (!data) return null
    return (
      <div className="row g-3 mb-2">
        <div className="col-6 col-lg">
          <KpiCard value={data.executed} label="Executed" accent="#3498DB" />
        </div>
        <div className="col-6 col-lg">
          <KpiCard
            value={data.within} label="Within SLA" accent="#2ECC71"
            active={activeDrill?.status === 'success' && activeDrill?.level === level}
            onClick={() => setActiveDrill({ status: 'success', level })}
          />
        </div>
        <div className="col-6 col-lg">
          <KpiCard
            value={data.warning} label="Warning" accent="#F39C12"
            active={activeDrill?.status === 'warning' && activeDrill?.level === level}
            onClick={() => setActiveDrill({ status: 'warning', level })}
          />
        </div>
        <div className="col-6 col-lg">
          <KpiCard
            value={data.outOfSla} label="Out of SLA" accent="#E74C3C"
            active={activeDrill?.status === 'critical' && activeDrill?.level === level}
            onClick={() => setActiveDrill({ status: 'critical', level })}
          />
        </div>
        <div className="col-6 col-lg">
          <KpiCard value={`${data.compliance}%`} label="Compliance" accent="#2ECC71" />
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem 1.5rem 2rem', minHeight: 'calc(100vh - 160px)', background: 'var(--gtek-dark-blue)' }}>

      {/* Page header */}
      <div className="mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-gauge-high me-2 text-primary" />
            SLA Dashboard
          </h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>
            SLA compliance monitoring and analysis by process and subprocess
          </p>
        </div>
        <div className="d-flex align-items-center gap-3">
          {lastUpdated && (
            <span style={{ fontSize: 12, color: '#64748b' }}>
              <i className="fas fa-clock me-1" />Last updated: {lastUpdated}
            </span>
          )}
          {kpiLoading && <span className="text-muted" style={{ fontSize: 13 }}><span className="spinner-border spinner-border-sm me-1" />Loading…</span>}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'linear-gradient(135deg, rgba(15,23,42,.95), rgba(30,41,59,.95))', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label" style={{ fontSize: 12 }}>Time period</label>
            <select className="form-select form-select-sm" value={timePeriod}
              onChange={e => { setTimePeriod(e.target.value); setActiveDrill(null); setFlowId(null) }}
              style={selectStyle}
            >
              {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label" style={{ fontSize: 12 }}>Environment</label>
            <select className="form-select form-select-sm" value={environmentId}
              onChange={e => { setEnvId(e.target.value); setActiveDrill(null); setFlowId(null) }}
              style={selectStyle}
            >
              <option value="">All</option>
              {filterOpts?.environments.map(e => <option key={e.value} value={String(e.value)}>{e.text}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label" style={{ fontSize: 12 }}>Business process</label>
            <select className="form-select form-select-sm" value={processId}
              onChange={e => { setProcessId(e.target.value); setActiveDrill(null); setFlowId(null) }}
              style={selectStyle}
            >
              <option value="">All</option>
              {filterOpts?.businessProcesses.map(p => <option key={p.value} value={String(p.value)}>{p.text}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <button className="btn btn-primary btn-sm w-100" onClick={handleApply} disabled={kpiLoading}>
              <i className="fas fa-rotate me-1" />Apply
            </button>
          </div>
        </div>
      </div>

      {/* Process KPIs */}
      {sectionTitle('Business processes (end-to-end)')}
      <KpiRow data={kpi?.process} level="process" />

      {/* Subprocess KPIs */}
      <div className="mt-4">{sectionTitle('Subprocesses (per step)')}</div>
      <KpiRow data={kpi?.subprocess} level="subprocess" />

      {/* Chart + Top offenders */}
      <div className="row g-3 mt-3">
        <div className="col-12">
          {panel(
            <>
              <h6 style={{ color: '#AED6F1' }} className="mb-3">Out of SLA by cause</h6>
              <div style={{ minHeight: 80 }}>
                <CauseChart items={kpi?.byCause ?? []} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top offenders + drill-down */}
      <div className="row g-3 mt-3">
        <div className="col-lg-5">
          {panel(
            <>
              <h6 style={{ color: '#AED6F1' }} className="mb-3">Top offenders</h6>
              <table style={{ width: '100%', fontSize: 13 }}>
                <tbody>
                  {kpi?.topOffenders?.length
                    ? kpi.topOffenders.map((o, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                          <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>{o.name}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: '#E74C3C', fontWeight: 700 }}>{o.count}</td>
                        </tr>
                      ))
                    : <tr><td style={{ padding: 8, color: '#64748b' }}>Nothing to show.</td></tr>
                  }
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="col-lg-7">
          {panel(
            <>
              <h6 style={{ color: '#AED6F1' }} className="mb-1">
                {activeDrill
                  ? `Detail — ${STATUS_LABEL[activeDrill.status] ?? activeDrill.status} · ${activeDrill.level}`
                  : 'Detail — click a KPI to drill down'
                }
              </h6>
              <div style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                Click a row to open its Transaction Flow.
              </div>
              {drillLoading && <div className="text-center py-3"><span className="spinner-border spinner-border-sm text-primary" /></div>}
              {!drillLoading && (
                <div style={{ maxHeight: 460, overflow: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ color: '#AED6F1', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.12)', padding: '6px 8px' }}>Process / Subprocess</th>
                        <th style={{ color: '#AED6F1', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.12)', padding: '6px 8px' }}>SLA (exp/warn/crit)</th>
                        <th style={{ color: '#AED6F1', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.12)', padding: '6px 8px' }}>Elapsed</th>
                        <th style={{ color: '#AED6F1', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.12)', padding: '6px 8px' }}>Status</th>
                        <th style={{ color: '#AED6F1', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.12)', padding: '6px 8px' }}>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillRows?.length
                        ? drillRows.map((row, i) => (
                            <tr
                              key={i}
                              style={{ cursor: row.messageId ? 'pointer' : 'default', borderBottom: '1px solid rgba(255,255,255,.06)' }}
                              onClick={() => row.messageId && setFlowId(row.messageId)}
                              title={row.messageId ? 'Open Transaction Flow' : undefined}
                            >
                              <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>
                                {row.processName}
                                {row.subprocessName && <span style={{ color: '#94a3b8' }}> / {row.subprocessName}</span>}
                              </td>
                              <td style={{ padding: '6px 8px', color: '#94a3b8', fontSize: 11 }}>
                                {fmtDuration(row.expectedMs)} / {fmtDuration(row.warningMs)} / {fmtDuration(row.criticalMs)}
                              </td>
                              <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>{fmtDuration(row.elapsedMs)}</td>
                              <td style={{ padding: '6px 8px' }}><StatusBadge status={row.status} /></td>
                              <td style={{ padding: '6px 8px', color: '#E74C3C', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {row.error ?? '–'}
                              </td>
                            </tr>
                          ))
                        : (
                          <tr>
                            <td colSpan={5} style={{ padding: 8, color: '#64748b', textAlign: 'center' }}>
                              {activeDrill ? 'No results.' : 'No selection.'}
                            </td>
                          </tr>
                        )
                      }
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Transaction Flow (expands when a drill row is clicked) */}
      {flowId && (
        <div className="row g-3 mt-3">
          <div className="col-12">
            {panel(
              <>
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <h6 style={{ color: '#AED6F1' }} className="mb-0">
                    <i className="fas fa-diagram-project me-2" />Transaction Flow
                    <span style={{ color: '#94a3b8', fontSize: 12 }}> — {flowId}</span>
                  </h6>
                  <div className="d-flex align-items-center gap-3">
                    <div className="btn-group btn-group-sm">
                      <button
                        className={`btn btn-outline-info${flowMode === 'transaction' ? ' active' : ''}`}
                        onClick={() => setFlowMode('transaction')}
                      >Transaction</button>
                      <button
                        className={`btn btn-outline-info${flowMode === 'correlation' ? ' active' : ''}`}
                        onClick={() => setFlowMode('correlation')}
                      >Correlation</button>
                    </div>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setFlowId(null)}>
                      <i className="fas fa-times" />
                    </button>
                  </div>
                </div>

                {flowDetail && (
                  <>
                    {/* Summary cards */}
                    <div className="row g-2 mb-3">
                      <div className="col-6 col-md-3">
                        <KpiCard value={flowDetail.status} label="Status" accent="#3498DB" />
                      </div>
                      <div className="col-6 col-md-3">
                        <KpiCard value={flowDetail.steps} label="Steps" accent="#3498DB" />
                      </div>
                      <div className="col-6 col-md-3">
                        <KpiCard value={fmtDuration(flowDetail.totalTimeMs)} label="Total time" accent="#3498DB" />
                      </div>
                      <div className="col-6 col-md-3">
                        <KpiCard value={flowDetail.slaSummary ?? '–'} label="SLA" accent="#6c757d" />
                      </div>
                    </div>

                    {/* Execution timeline chart */}
                    {flowDetail.timelinePoints?.length ? (
                      <>
                        <div style={{ color: '#AED6F1', fontSize: 14, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8, fontWeight: 600 }}>
                          Execution timeline
                        </div>
                        <Chart
                          dataSource={flowDetail.timelinePoints}
                          height={240}
                          className="mb-4"
                        >
                          <CommonSeriesSettings argumentField="step" type="line" />
                          <Series valueField="elapsedMs" name="Elapsed" color="#3498DB" />
                          <Series valueField="execMs" name="Step time" color="#2ECC71" />
                          <ValueAxis>
                            {flowDetail.sla?.isConfigured && (
                              <>
                                <ConstantLine value={flowDetail.sla.expectedDurationMs} color="#2ECC71" dashStyle="dash" width={1}>
                                  <ConstantLineLabel text="Expected" />
                                </ConstantLine>
                                <ConstantLine value={flowDetail.sla.warningThresholdMs} color="#F39C12" dashStyle="dash" width={1}>
                                  <ConstantLineLabel text="Warning" />
                                </ConstantLine>
                                <ConstantLine value={flowDetail.sla.criticalThresholdMs} color="#E74C3C" dashStyle="dash" width={1}>
                                  <ConstantLineLabel text="Critical" />
                                </ConstantLine>
                              </>
                            )}
                          </ValueAxis>
                          <Legend verticalAlignment="bottom" horizontalAlignment="center" />
                          <Tooltip enabled />
                        </Chart>
                      </>
                    ) : null}

                    {/* Step waterfall chart */}
                    {flowDetail.waterfallPoints?.length ? (
                      <>
                        <div style={{ color: '#AED6F1', fontSize: 14, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8, fontWeight: 600 }}>
                          Step waterfall
                        </div>
                        <Chart
                          dataSource={flowDetail.waterfallPoints}
                          rotated
                          height={Math.max(200, flowDetail.waterfallPoints.length * 34)}
                          className="mb-4"
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          customizePoint={(pt: any) => ({ color: slaColor(pt.data?.slaStatus) })}
                        >
                          <CommonSeriesSettings
                            type="rangebar"
                            argumentField="stepLabel"
                            rangeValue1Field="startOffset"
                            rangeValue2Field="endOffset"
                          />
                          <Series name="Step" />
                          <ValueAxis />
                          <Legend visible={false} />
                          <Tooltip
                            enabled
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            customizeTooltip={(arg: any) => ({
                              text: `${arg.argumentText}: ${fmtDuration(arg.rangeValue1)} – ${fmtDuration(arg.rangeValue2)}`,
                            })}
                          />
                        </Chart>
                      </>
                    ) : null}

                    {/* Sequence chips */}
                    {flowDetail.sequence?.length ? (
                      <>
                        <div style={{ color: '#AED6F1', fontSize: 14, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8, fontWeight: 600 }}>
                          Sequence (system to system)
                        </div>
                        <div style={{ overflowX: 'auto', whiteSpace: 'nowrap', padding: '8px 0', marginBottom: 16 }}>
                          {flowDetail.sequence.map((s, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 6 }}>
                              <span style={{ background: 'rgba(52,152,219,.18)', color: '#5DADE2', padding: '3px 10px', borderRadius: 12, fontSize: 12 }}>{s.from}</span>
                              <i className="fas fa-arrow-right" style={{ color: '#64748b', fontSize: 10 }} />
                              <span style={{ background: 'rgba(52,152,219,.18)', color: '#5DADE2', padding: '3px 10px', borderRadius: 12, fontSize: 12 }}>{s.to}</span>
                              {s.label && <span style={{ color: '#64748b', fontSize: 11 }}>({s.label})</span>}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : null}

                    {/* Steps grid */}
                    {flowDetail.stepRows?.length ? (
                      <>
                        <div style={{ color: '#AED6F1', fontSize: 14, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8, fontWeight: 600 }}>
                          Steps
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', fontSize: 12 }}>
                            <thead>
                              <tr>
                                {['Step', 'System', 'Status', 'Duration', 'Timestamp'].map(h => (
                                  <th key={h} style={{ color: '#AED6F1', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,.12)', fontWeight: 600 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {flowDetail.stepRows.map((s, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                                  <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>{s.stepName}</td>
                                  <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{s.system}</td>
                                  <td style={{ padding: '6px 8px' }}><StatusBadge status={s.status} /></td>
                                  <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>{fmtDuration(s.durationMs)}</td>
                                  <td style={{ padding: '6px 8px', color: '#64748b' }}>{s.timestamp}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : null}
                  </>
                )}

                {!flowDetail && (
                  <div className="text-center py-4">
                    <span className="spinner-border text-primary" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
