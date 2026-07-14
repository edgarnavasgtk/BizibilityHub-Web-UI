import { useState, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import DataGrid, { Column, Pager, Paging, Export, FilterRow, SearchPanel, HeaderFilter } from 'devextreme-react/data-grid'
import type { DataGridRef } from 'devextreme-react/data-grid'
import { exportDataGrid } from 'devextreme/excel_exporter'
import { Workbook } from 'exceljs'
import apiClient from '../../services/apiClient'

/* ── Types ─────────────────────────────────────────────── */
interface VolumeRow {
  groupKey: string
  role?: string
  executions: number
  successes: number
  failures: number
  priorExecutions?: number
  executionsDelta?: number
  executionsPctChange?: number
  changeStatus?: 'new' | 'removed' | 'flat' | 'up' | 'down'
  successRate: number
  totalPayloadBytes: number
  averageExecutionTimeMs: number
  lastExecutionTimestamp: string
}

interface VolumeSummary {
  level: string
  totalExecutions: number
  totalSuccesses: number
  totalFailures: number
  totalBytes: number
  rowCount: number
  compare: boolean
  growers?: number
  decliners?: number
  newRows?: number
  removed?: number
  startUtc: string
  endUtc: string
}

interface VolumeResponse {
  data: VolumeRow[]
  summary: VolumeSummary
}

/* ── Helpers ────────────────────────────────────────────── */
type Level = 'platform' | 'environment' | 'flow' | 'endpoint'
type QuickRange = '24h' | 'yesterday' | '7d' | '30d' | 'this-month' | 'last-month' | 'custom'

const QUICK_RANGES: { label: string; value: QuickRange }[] = [
  { label: 'Last 24 hours',   value: '24h'        },
  { label: 'Yesterday (UTC)', value: 'yesterday'  },
  { label: 'Last 7 days',     value: '7d'         },
  { label: 'Last 30 days',    value: '30d'        },
  { label: 'This month',      value: 'this-month' },
  { label: 'Last month',      value: 'last-month' },
  { label: 'Custom range',    value: 'custom'     },
]

function applyQuickRange(qr: QuickRange): { start: string; end: string } {
  const now = new Date()
  const nowIso = now.toISOString().slice(0, 16)

  if (qr === '24h') {
    return { start: new Date(now.getTime() - 24 * 3_600_000).toISOString().slice(0, 16), end: nowIso }
  }
  if (qr === '7d') {
    return { start: new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 16), end: nowIso }
  }
  if (qr === '30d') {
    return { start: new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 16), end: nowIso }
  }
  if (qr === 'yesterday') {
    const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const yesterdayMidnight = new Date(todayMidnight.getTime() - 86_400_000)
    return { start: yesterdayMidnight.toISOString().slice(0, 16), end: todayMidnight.toISOString().slice(0, 16) }
  }
  if (qr === 'this-month') {
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return { start: firstOfMonth.toISOString().slice(0, 16), end: nowIso }
  }
  if (qr === 'last-month') {
    const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const firstOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    return { start: firstOfLastMonth.toISOString().slice(0, 16), end: firstOfThisMonth.toISOString().slice(0, 16) }
  }
  // custom — caller keeps existing values
  return { start: nowIso, end: nowIso }
}

function escapeCsvValue(value: unknown): string {
  const str = value == null ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/* ── Component ──────────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  background: 'rgba(30,41,59,.8)',
  color: '#e2e8f0',
  border: '1px solid rgba(46,134,193,.3)',
  fontSize: 13,
}

const INTEGER_COLS = new Set(['executions', 'successes', 'failures', 'priorExecutions', 'executionsDelta', 'averageExecutionTimeMs', 'totalPayloadBytes'])

export default function VolumeReportPage() {
  const [level, setLevel]         = useState<Level>('flow')
  const [quickRange, setQuickRange] = useState<QuickRange>('24h')
  const [compare, setCompare]     = useState(false)
  const initial = applyQuickRange('24h')
  const [start, setStart]         = useState(initial.start)
  const [end, setEnd]             = useState(initial.end)

  // Query params only change when Run is clicked
  const [params, setParams]       = useState<null | { level: Level; start: string; end: string; compare: boolean }>(null)

  const gridRef = useRef<DataGridRef>(null)

  const { data, isFetching } = useQuery<VolumeResponse>({
    queryKey: ['reports', 'volume', params],
    queryFn: () =>
      apiClient
        .get<VolumeResponse>('/Reports/PerFlowVolumeData', {
          params: { level: params!.level, start: params!.start, end: params!.end, compare: params!.compare },
        })
        .then((r) => r.data),
    enabled: params !== null,
  })

  const handleRun = useCallback(() => {
    setParams({ level, start, end, compare })
  }, [level, start, end, compare])

  const handleQuickRange = useCallback((qr: QuickRange) => {
    setQuickRange(qr)
    if (qr !== 'custom') {
      const { start: s, end: e } = applyQuickRange(qr)
      setStart(s)
      setEnd(e)
    }
  }, [])

  const summary = data?.summary
  const rows    = data?.data ?? []
  const isEndpoint = level === 'endpoint'

  /* Export helpers */
  const exportData = useCallback((format: 'csv' | 'json') => {
    if (!rows.length) return
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = 'volume-report.json'; a.click()
    } else {
      const headers = Object.keys(rows[0]).map(escapeCsvValue).join(',')
      const csv = [headers, ...rows.map((r) => Object.values(r).map(escapeCsvValue).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = 'volume-report.csv'; a.click()
    }
  }, [rows])

  const exportExcel = useCallback(async () => {
    const instance = gridRef.current?.instance()
    if (!instance) return
    const workbook = new Workbook()
    const worksheet = workbook.addWorksheet('Volume Report')
    await exportDataGrid({
      component: instance,
      worksheet,
      autoFilterEnabled: true,
      customizeCell: ({ gridCell, excelCell }) => {
        if (!gridCell) return
        if (gridCell.rowType === 'header') {
          excelCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2E86C1' },
          }
          excelCell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        } else if (gridCell.rowType === 'data') {
          const field = gridCell.column?.dataField as string | undefined
          if (field === 'successRate') {
            if (excelCell.value != null) excelCell.value = (excelCell.value as number) / 100
            excelCell.numFmt = '0.00%'
          } else if (field && INTEGER_COLS.has(field)) {
            excelCell.numFmt = '#,##0'
          }
        }
      },
    })
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'volume-report.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <div style={{ padding: '2rem 2rem 2rem 2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-chart-column me-2 text-primary" />Volume Report
          </h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>
            Executions, successes, failures, and payload volume by flow or endpoint.
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-success btn-sm" onClick={exportExcel} disabled={!rows.length}>
            <i className="fas fa-file-excel me-1" />Excel
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => exportData('csv')} disabled={!rows.length}>
            <i className="fas fa-file-csv me-1" />CSV
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => exportData('json')} disabled={!rows.length}>
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
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Aggregation Level
          </label>
          <select
            className="form-select form-select-sm"
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
            style={{ ...inputStyle, width: 160 }}
          >
            <option value="platform">Platform</option>
            <option value="environment">Environment</option>
            <option value="flow">Flow</option>
            <option value="endpoint">Endpoint</option>
          </select>
        </div>

        {/* Quick range */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Quick Range
          </label>
          <select
            className="form-select form-select-sm"
            value={quickRange}
            onChange={(e) => handleQuickRange(e.target.value as QuickRange)}
            style={{ ...inputStyle, width: 150 }}
          >
            {QUICK_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Start UTC */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Start UTC
          </label>
          <input
            type="datetime-local"
            className="form-control form-control-sm"
            value={start}
            onChange={(e) => { setStart(e.target.value); setQuickRange('custom') }}
            style={{ ...inputStyle, width: 190 }}
          />
        </div>

        {/* End UTC */}
        <div>
          <label className="text-muted d-block" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            End UTC
          </label>
          <input
            type="datetime-local"
            className="form-control form-control-sm"
            value={end}
            onChange={(e) => { setEnd(e.target.value); setQuickRange('custom') }}
            style={{ ...inputStyle, width: 190 }}
          />
        </div>

        {/* Compare toggle */}
        <div className="d-flex align-items-center gap-2 pb-1">
          <label className="text-muted" style={{ fontSize: 12, userSelect: 'none', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="form-check-input me-2"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            Compare with prior period
          </label>
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

      {/* Summary tiles — shown only after run */}
      {summary && (
        <div className="row g-3 mb-4">
          {[
            { label: 'Rows',         value: summary.rowCount.toLocaleString(),            icon: 'fas fa-list',          color: '#3b82f6' },
            { label: 'Executions',   value: summary.totalExecutions.toLocaleString(),     icon: 'fas fa-bolt',          color: '#8b5cf6' },
            { label: 'Successes',    value: summary.totalSuccesses.toLocaleString(),      icon: 'fas fa-check-circle',  color: '#10b981' },
            { label: 'Failures',     value: summary.totalFailures.toLocaleString(),       icon: 'fas fa-times-circle',  color: '#ef4444' },
            { label: 'Total Volume', value: formatBytes(summary.totalBytes),              icon: 'fas fa-database',      color: '#f59e0b' },
            ...(summary.compare ? [
              { label: 'Growers',   value: (summary.growers ?? 0).toString(),   icon: 'fas fa-arrow-up',    color: '#10b981' },
              { label: 'Decliners', value: (summary.decliners ?? 0).toString(), icon: 'fas fa-arrow-down',  color: '#ef4444' },
            ] : []),
          ].map((t) => (
            <div key={t.label} className="col-6 col-sm-4 col-md-2">
              <div
                className="text-center p-3 rounded"
                style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)' }}
              >
                <i className={t.icon} style={{ fontSize: 22, color: t.color }} />
                <div className="text-white fw-bold mt-2" style={{ fontSize: 20 }}>{t.value}</div>
                <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state — before first run */}
      {!params && !isFetching && (
        <div className="text-center py-5 text-muted">
          <i className="fas fa-chart-column mb-3" style={{ fontSize: 48, opacity: .3 }} />
          <p className="mb-0">Set the filters above and click <strong>Run Report</strong> to load data.</p>
        </div>
      )}

      {/* Grid */}
      {params && !isFetching && rows.length === 0 && (
        <div className="text-center py-5 text-muted">
          <i className="fas fa-inbox mb-2" style={{ fontSize: 40, opacity: .3 }} /><br />
          No data found for the selected filters.
        </div>
      )}

      {rows.length > 0 && (
        <div
          className="rounded overflow-hidden"
          style={{ border: '1px solid rgba(46,134,193,.2)' }}
        >
          <DataGrid
            ref={gridRef}
            dataSource={rows}
            showBorders={false}
            showColumnLines={true}
            showRowLines={true}
            rowAlternationEnabled={true}
            columnAutoWidth={true}
            allowColumnResizing={true}
            wordWrapEnabled={false}
            height={560}
          >
            <FilterRow visible={true} />
            <HeaderFilter visible={true} />
            <SearchPanel visible={true} width={240} />
            <Paging pageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[25, 50, 100]} showInfo />
            <Export enabled={true} allowExportSelectedData={false} />

            <Column dataField="groupKey"                caption="Name"              width={260} fixed />
            {isEndpoint && <Column dataField="role"    caption="Role"              width={100} />}
            <Column dataField="executions"             caption="Executions"        dataType="number" width={120} alignment="right" />
            <Column dataField="successes"              caption="Successes"         dataType="number" width={110} alignment="right" />
            <Column dataField="failures"               caption="Failures"          dataType="number" width={100} alignment="right" />
            {compare && <>
              <Column dataField="priorExecutions"      caption="Prior Exec"        dataType="number" width={110} alignment="right" />
              <Column dataField="executionsDelta"      caption="Delta"             dataType="number" width={90}  alignment="right" />
              <Column
                dataField="executionsPctChange"
                caption="% Change"
                dataType="number"
                width={100}
                alignment="right"
                format={{ type: 'fixedPoint', precision: 1 }}
                cellRender={({ value, data }: { value: number | undefined; data: VolumeRow }) => {
                  const status = data?.changeStatus
                  if (status === 'new') {
                    return (
                      <span style={{
                        display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(59,130,246,.2)', color: '#60a5fa',
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                      }}>NEW</span>
                    )
                  }
                  if (status === 'removed') {
                    return (
                      <span style={{
                        display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(148,163,184,.15)', color: '#94a3b8',
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                      }}>REMOVED</span>
                    )
                  }
                  if (status === 'flat' || value === 0) {
                    return <span style={{ color: '#94a3b8' }}>—</span>
                  }
                  if (value == null) return null
                  return (
                    <span style={{ color: value >= 0 ? '#10b981' : '#ef4444' }}>
                      {value >= 0 ? '+' : ''}{value.toFixed(1)}%
                    </span>
                  )
                }}
              />
            </>}
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
              dataField="totalPayloadBytes"
              caption="Total Volume"
              dataType="number"
              width={120}
              alignment="right"
              cellRender={({ value }) => formatBytes(value)}
            />
            <Column
              dataField="averageExecutionTimeMs"
              caption="Avg Time (ms)"
              dataType="number"
              width={120}
              alignment="right"
              format={{ type: 'fixedPoint', precision: 0 }}
            />
            <Column
              dataField="lastExecutionTimestamp"
              caption="Last Execution"
              dataType="datetime"
              format="dd/MM/yyyy HH:mm"
              width={160}
            />
          </DataGrid>
        </div>
      )}
    </div>
  )
}
