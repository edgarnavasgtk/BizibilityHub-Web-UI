import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import DataGrid, { Column, Pager, Paging, FilterRow, HeaderFilter, SearchPanel } from 'devextreme-react/data-grid'
import Chart, { Series, Legend, Tooltip, ArgumentAxis, ValueAxis } from 'devextreme-react/chart'
import TagBox from 'devextreme-react/tag-box'
import * as XLSX from 'xlsx'
import apiClient from '../../services/apiClient'

/* ── Types ─────────────────────────────────────────────── */
type Level   = 'flow' | 'endpoint'
type Measure = 'executions' | 'successes' | 'failures' | 'avgTime'
type Bucket  = 'hour' | 'day' | 'week' | 'month'
type Quick   = '1d' | '7d' | '30d' | '90d' | '6mo' | '12mo' | 'thisMonth' | 'lastMonth' | 'custom'

interface TrendRow {
  bucketStart: string
  name: string
  role?: string
  executions: number
  successes: number
  failures: number
  successRate: number
  averageExecutionTimeMs: number
}

interface TrendSummary {
  level: string
  bucket: string
  source: string
  rowCount: number
  nameCount: number
  topNApplied: boolean
  totalExecutions: number
  totalSuccesses: number
  totalFailures: number
  startUtc: string
  endUtc: string
}

interface TrendResponse {
  data: TrendRow[]
  topNames: string[]
  summary: TrendSummary
}

/* wide-pivot: one row per bucketStart, one key per integration name */
type WideRow = Record<string, string | number>

function pivotWide(rows: TrendRow[], measure: Measure): WideRow[] {
  const map = new Map<string, WideRow>()
  for (const r of rows) {
    let row = map.get(r.bucketStart)
    if (!row) { row = { bucketStart: r.bucketStart }; map.set(r.bucketStart, row) }
    const val = measure === 'executions' ? r.executions
      : measure === 'successes' ? r.successes
      : measure === 'failures'  ? r.failures
      : r.averageExecutionTimeMs
    row[r.name] = val
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.bucketStart).localeCompare(String(b.bucketStart))
  )
}

/* ── Quick-range helper ─────────────────────────────────── */
const QUICK_RANGES: { label: string; value: Quick }[] = [
  { label: 'Last 24 hours',  value: '1d'        },
  { label: 'Last 7 days',    value: '7d'        },
  { label: 'Last 30 days',   value: '30d'       },
  { label: 'Last 90 days',   value: '90d'       },
  { label: 'Last 6 months',  value: '6mo'       },
  { label: 'Last 12 months', value: '12mo'      },
  { label: 'This month',     value: 'thisMonth' },
  { label: 'Last month',     value: 'lastMonth' },
  { label: 'Custom range',   value: 'custom'    },
]

function resolveRange(q: Quick): { start: string; end: string } {
  const now = new Date()
  const end = now.toISOString().slice(0, 16)

  if (q === 'thisMonth') {
    const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return { start: s.toISOString().slice(0, 16), end }
  }
  if (q === 'lastMonth') {
    const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return { start: s.toISOString().slice(0, 16), end: e.toISOString().slice(0, 16) }
  }
  if (q === 'custom') return { start: '', end: '' }

  const hrs: Record<string, number> = { '1d': 24, '7d': 168, '30d': 720, '90d': 2160, '6mo': 4380, '12mo': 8760 }
  const start = new Date(now.getTime() - hrs[q] * 3_600_000).toISOString().slice(0, 16)
  return { start, end }
}

/* Auto-select bucket to match the day span (mirrors Razor's pickBucketForRange) */
function pickBucket(start: string, end: string): Bucket {
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000
  if (days <= 2)   return 'hour'
  if (days <= 31)  return 'day'
  if (days <= 183) return 'week'
  return 'month'
}

const TOP_N_OPTIONS = [5, 10, 20, 50, 100, -1] // -1 = All (matches Razor's server-side skip-limit sentinel)

const inputStyle: React.CSSProperties = {
  background: 'rgba(30,41,59,.8)',
  color: '#e2e8f0',
  border: '1px solid rgba(46,134,193,.3)',
  fontSize: 13,
}

const MEASURE_LABELS: Record<Measure, string> = {
  executions: 'Executions',
  successes:  'Successes',
  failures:   'Failures',
  avgTime:    'Avg Time (ms)',
}

export default function UsageTrendPage() {
  const [level, setLevel]       = useState<Level>('flow')
  const [measure, setMeasure]   = useState<Measure>('executions')
  const [bucket, setBucket]     = useState<Bucket>('day')
  const [quickRange, setQuickRange] = useState<Quick>('30d')
  const [topN, setTopN]         = useState(10)
  const initial = resolveRange('30d')
  const [start, setStart]       = useState(initial.start)
  const [end, setEnd]           = useState(initial.end)
  // Fix 4: multi-value string array instead of single string
  const [nameFilter, setNameFilter] = useState<string[]>([])

  const [params, setParams] = useState<null | {
    level: Level; measure: Measure; bucket: Bucket; topN: number
    start: string; end: string; nameFilter: string[]
  }>(null)

  const { data, isFetching } = useQuery<TrendResponse>({
    queryKey: ['reports', 'usage-trend', params],
    queryFn: () => {
      const qp: Record<string, string | number | string[]> = {
        level: params!.level,
        bucket: params!.bucket,
        topN: params!.topN,
        start: params!.start,
        end: params!.end,
        // Pass array directly so axios serializes as repeated params: names=a&names=b
        // (matching jQuery traditional:true that Razor uses, required for ASP.NET array binding)
        ...(params!.nameFilter.length > 0 ? { names: params!.nameFilter } : {}),
      }
      return apiClient
        .get<TrendResponse>('/Reports/UsageTrendData', { params: qp })
        .then((r) => r.data)
    },
    enabled: params !== null,
  })

  const handleRun = useCallback(() => {
    setParams({ level, measure, bucket, topN, start, end, nameFilter })
  }, [level, measure, bucket, topN, start, end, nameFilter])

  // Fix 5: auto-select bucket when a quick-range preset is applied
  const handleQuickRange = useCallback((q: Quick) => {
    setQuickRange(q)
    if (q !== 'custom') {
      const { start: s, end: e } = resolveRange(q)
      setStart(s); setEnd(e)
      setBucket(pickBucket(s, e))
    }
  }, [])

  const summary   = data?.summary
  const rows      = data?.data ?? []
  // Fix 4: topNames from API response feeds TagBox suggestions
  const topNames  = data?.topNames ?? []
  const wideRows  = pivotWide(rows, params?.measure ?? measure)
  const isEndpoint = level === 'endpoint'

  const exportCsv = useCallback(() => {
    if (!rows.length) return
    const headers = Object.keys(rows[0]).join(',')
    const csv = [headers, ...rows.map((r) => Object.values(r).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'usage-trend.csv'; a.click()
  }, [rows])

  const exportJson = useCallback(() => {
    if (!rows.length) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }))
    a.download = 'usage-trend.json'; a.click()
  }, [rows])

  // Fix 2: Excel export with successRate as decimal and numeric avgTime formatting
  const exportExcel = useCallback(() => {
    if (!rows.length) return

    const exportData = rows.map((r) => ({
      'Bucket Start':  r.bucketStart,
      'Integration':   r.name,
      ...(isEndpoint ? { 'Role': r.role ?? '' } : {}),
      'Executions':              r.executions,
      'Successes':               r.successes,
      'Failures':                r.failures,
      // successRate stored as 0–100; export as decimal (0.955) to match Razor customizeCell
      'Success Rate':            +(r.successRate / 100).toFixed(6),
      // averageExecutionTimeMs as numeric for #,##0.00 format in Excel
      'Avg Execution Time (ms)': r.averageExecutionTimeMs,
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)

    // Apply percentage format to the Success Rate column
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
    // Success Rate is column G (index 6) or H (index 7) when endpoint role is shown
    const srColIndex = isEndpoint ? 7 : 6
    const atColIndex = isEndpoint ? 8 : 7
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const srCell = XLSX.utils.encode_cell({ r: row, c: srColIndex })
      const atCell = XLSX.utils.encode_cell({ r: row, c: atColIndex })
      if (ws[srCell]) ws[srCell].z = '0.00%'
      if (ws[atCell]) ws[atCell].z = '#,##0.00'
    }

    // Bold header row
    for (let col = range.s.c; col <= range.e.c; col++) {
      const hCell = XLSX.utils.encode_cell({ r: 0, c: col })
      if (ws[hCell]) {
        ws[hCell].s = { font: { bold: true }, fill: { fgColor: { rgb: '1E3A5F' } } }
      }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Usage Trend')
    XLSX.writeFile(wb, 'usage-trend.xlsx')
  }, [rows, isEndpoint])

  return (
    <div style={{ padding: '2rem 2rem 2rem 2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-chart-line me-2 text-success" />Usage Trend
          </h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>
            Execution trends per integration flow or endpoint over time.
          </p>
        </div>
        <div className="d-flex gap-2">
          {/* Fix 2: Excel export button */}
          <button className="btn btn-outline-success btn-sm" onClick={exportExcel} disabled={!rows.length}>
            <i className="fas fa-file-excel me-1" />Excel
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={exportCsv}  disabled={!rows.length}>
            <i className="fas fa-file-csv me-1" />CSV
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={exportJson} disabled={!rows.length}>
            <i className="fas fa-file-code me-1" />JSON
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div
        className="rounded p-3 mb-4 d-flex flex-wrap gap-3 align-items-end"
        style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)' }}
      >
        {/* Level */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Level</label>
          <select className="form-select form-select-sm" value={level} onChange={(e) => setLevel(e.target.value as Level)} style={{ ...inputStyle, width: 130 }}>
            <option value="flow">Flow</option>
            <option value="endpoint">Endpoint</option>
          </select>
        </div>

        {/* Measure */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Measure</label>
          <select className="form-select form-select-sm" value={measure} onChange={(e) => setMeasure(e.target.value as Measure)} style={{ ...inputStyle, width: 150 }}>
            <option value="executions">Executions</option>
            <option value="successes">Successes</option>
            <option value="failures">Failures</option>
            <option value="avgTime">Avg Time (ms)</option>
          </select>
        </div>

        {/* Bucket */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Bucket</label>
          <select className="form-select form-select-sm" value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)} style={{ ...inputStyle, width: 120 }}>
            <option value="hour">Hour</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>

        {/* Quick range — Fix 3: includes 'This month' and 'Last month' */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Quick Range</label>
          <select className="form-select form-select-sm" value={quickRange} onChange={(e) => handleQuickRange(e.target.value as Quick)} style={{ ...inputStyle, width: 160 }}>
            {QUICK_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {/* Top N */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Top N</label>
          <select className="form-select form-select-sm" value={topN} onChange={(e) => setTopN(Number(e.target.value))} style={{ ...inputStyle, width: 100 }}>
            {TOP_N_OPTIONS.map((n) => <option key={n} value={n}>{n === -1 ? 'All' : n}</option>)}
          </select>
        </div>

        {/* Start */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Start UTC</label>
          <input type="datetime-local" className="form-control form-control-sm" value={start}
            onChange={(e) => { setStart(e.target.value); setQuickRange('custom') }}
            style={{ ...inputStyle, width: 190 }}
          />
        </div>

        {/* End */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>End UTC</label>
          <input type="datetime-local" className="form-control form-control-sm" value={end}
            onChange={(e) => { setEnd(e.target.value); setQuickRange('custom') }}
            style={{ ...inputStyle, width: 190 }}
          />
        </div>

        {/* Fix 4: Multi-value TagBox for name filter, suggestions repopulate from topNames */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Filter by Name</label>
          <TagBox
            dataSource={topNames}
            value={nameFilter}
            onValueChanged={(e) => setNameFilter(e.value ?? [])}
            acceptCustomValue={true}
            searchEnabled={true}
            showClearButton={true}
            placeholder="Integration name…"
            width={240}
          />
        </div>

        {/* Run */}
        <div>
          <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={isFetching}>
            {isFetching
              ? <><span className="spinner-border spinner-border-sm me-2" />Running…</>
              : <><i className="fas fa-play me-2" />Run Report</>
            }
          </button>
        </div>
      </div>

      {/* Source pill + summary */}
      {summary && (
        <div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
          <span
            className="badge"
            style={{
              background: summary.source?.toLowerCase() === 'cagg' ? 'rgba(139,92,246,.25)' : 'rgba(16,185,129,.2)',
              color: summary.source?.toLowerCase() === 'cagg' ? '#c4b5fd' : '#6ee7b7',
              fontSize: 11, padding: '5px 10px', borderRadius: 6,
            }}
          >
            {summary.source ?? 'Raw'}
          </span>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {summary.rowCount.toLocaleString()} rows · {summary.nameCount} integrations
            {summary.topNApplied ? ` (Top ${topN} applied)` : ''}
          </span>
        </div>
      )}

      {/* Empty pre-run state */}
      {!params && !isFetching && (
        <div className="text-center py-5 text-muted">
          <i className="fas fa-chart-line mb-3" style={{ fontSize: 48, opacity: .3 }} />
          <p className="mb-0">Set the filters above and click <strong>Run Report</strong> to load data.</p>
        </div>
      )}

      {/* Chart */}
      {wideRows.length > 0 && (
        <div
          className="rounded p-3 mb-4"
          style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)' }}
        >
          <div className="text-white fw-semibold mb-3" style={{ fontSize: 14 }}>
            {MEASURE_LABELS[params?.measure ?? measure]} over time
          </div>
          <Chart
            dataSource={wideRows}
            height={320}
            palette="Soft"
          >
            <ArgumentAxis
              argumentType="datetime"
              label={{ overlappingBehavior: 'rotate', rotationAngle: -30, format: 'shortDateShortTime' }}
            />
            <ValueAxis />
            {topNames.map((name) => (
              <Series
                key={name}
                valueField={name}
                argumentField="bucketStart"
                name={name}
                type="line"
              />
            ))}
            <Legend verticalAlignment="bottom" horizontalAlignment="center" itemTextPosition="right" />
            <Tooltip enabled={true} shared={true} />
          </Chart>
        </div>
      )}

      {/* Grid */}
      {params && !isFetching && rows.length === 0 && (
        <div className="text-center py-5 text-muted">
          <i className="fas fa-inbox mb-2" style={{ fontSize: 40, opacity: .3 }} /><br />
          No data for the selected range and filters.
        </div>
      )}

      {rows.length > 0 && (
        <div
          className="rounded overflow-hidden"
          style={{ border: '1px solid rgba(46,134,193,.2)' }}
        >
          <DataGrid
            dataSource={rows}
            showBorders={false}
            showColumnLines={true}
            showRowLines={true}
            rowAlternationEnabled={true}
            columnAutoWidth={true}
            allowColumnResizing={true}
            height={480}
          >
            <FilterRow visible={true} />
            <HeaderFilter visible={true} />
            <SearchPanel visible={true} width={240} />
            <Paging pageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[25, 50, 100]} showInfo />

            <Column
              dataField="bucketStart"
              caption="Bucket"
              dataType="datetime"
              format="yyyy-MM-dd HH:mm"
              sortOrder="asc"
              width={170}
              fixed
            />
            <Column dataField="name"     caption="Integration"  width={260} />
            {isEndpoint && <Column dataField="role" caption="Role" width={100} />}
            <Column dataField="executions"           caption="Executions"  dataType="number" width={110} alignment="right" />
            <Column dataField="successes"            caption="Successes"   dataType="number" width={100} alignment="right" />
            <Column dataField="failures"             caption="Failures"    dataType="number" width={95}  alignment="right" />
            <Column
              dataField="successRate"
              caption="Success Rate"
              dataType="number"
              width={110}
              alignment="right"
              cellRender={({ value }) => (
                <span style={{ color: value >= 95 ? '#10b981' : value >= 80 ? '#f59e0b' : '#ef4444' }}>
                  {value?.toFixed(1)}%
                </span>
              )}
            />
            <Column
              dataField="averageExecutionTimeMs"
              caption="Avg Time (ms)"
              dataType="number"
              width={120}
              alignment="right"
              format={{ type: 'fixedPoint', precision: 0 }}
            />
          </DataGrid>
        </div>
      )}
    </div>
  )
}
