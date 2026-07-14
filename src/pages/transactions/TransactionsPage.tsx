import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import mermaid from 'mermaid'
import DataGrid, {
  Column, Paging, Pager, FilterRow, ColumnChooser, HeaderFilter, MasterDetail,
} from 'devextreme-react/data-grid'
import TagBox from 'devextreme-react/tag-box'
import FiltersSidebar from '../../components/common/FiltersSidebar'
import { useTransactions, useTransactionFilters } from '../../hooks/useTransactions'
import { useDashboardFilterOptions } from '../../hooks/useDashboard'
import apiClient from '../../services/apiClient'
import type { Transaction } from '../../types/api'

// ── Local types ───────────────────────────────────────────────────────────────

interface StepRow {
  stepName:            string
  system:              string
  status:              string
  durationMs:          number
  timestamp:           string
  // computed columns
  timeSincePrevious?:  number
  cumulativeDuration?: number
  cumulativeInterval?: number
}

interface TransactionDetail {
  status:        string
  steps:         number
  totalTimeMs:   number
  slaSummary?:   string
  errorMessage?: string
  errorDetails?: string
  timeline?:     { name: string; startMs: number; endMs: number }[]
  sequence?:     { from: string; to: string; label: string }[]
  stepRows?:     StepRow[]
}

// Raw shape returned by /Transactions/GetTransactionDetails
interface RawTimelineEntry {
  startTimestamp:  string
  integrationName: string
  executionTimeMs: number | null
  sourceSystem:    string | null
  targetSystem:    string | null
  status:          string
  errorCode:       string | null
  errorMessage:    string | null
}

interface RawTransactionDetail {
  mainTransaction: Transaction
  timeline:        RawTimelineEntry[]
  summary: {
    totalSteps:     number
    totalElapsedMs: number
    overallStatus:  string
  }
  sla: {
    isConfigured: boolean
    status?:      string
  } | null
}

// Fix: API returns { data, totalCount, page, pageSize, totalPages }
interface ChildTxResponse {
  data:       Transaction[]
  totalCount: number
  page:       number
  pageSize:   number
  totalPages: number
}

// ── Response adapter ──────────────────────────────────────────────────────────

function adaptDetailResponse(raw: RawTransactionDetail): TransactionDetail {
  const timeline = raw.timeline ?? []
  const base     = timeline[0]?.startTimestamp

  // Build stepRows sorted by timestamp, then add computed columns
  const rawRows: StepRow[] = timeline.map(t => ({
    stepName:  t.integrationName ?? '',
    system:    `${t.sourceSystem ?? ''} > ${t.targetSystem ?? ''}`,
    status:    t.status,
    durationMs: t.executionTimeMs ?? 0,
    timestamp:  t.startTimestamp,
  }))
  rawRows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const baseTs = rawRows.length > 0 ? new Date(rawRows[0].timestamp).getTime() : 0
  let cumDuration = 0
  const stepRows = rawRows.map((s, i) => {
    const curTs            = new Date(s.timestamp).getTime()
    const timeSincePrevious = i === 0 ? 0 : curTs - new Date(rawRows[i - 1].timestamp).getTime()
    cumDuration            += s.durationMs
    const cumulativeInterval = curTs - baseTs
    return { ...s, timeSincePrevious, cumulativeDuration: cumDuration, cumulativeInterval }
  })

  // Derive error info from failed timeline entries
  const failedEntries = timeline.filter(t => ['ERROR', 'FAILED'].includes(t.status?.toUpperCase()))
  const errorMessage  = failedEntries
    .map(t => [t.errorCode, t.errorMessage].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('\n') || undefined

  return {
    status:     raw.summary?.overallStatus ?? raw.mainTransaction?.status ?? '',
    steps:      raw.summary?.totalSteps    ?? 0,
    totalTimeMs: raw.summary?.totalElapsedMs ?? 0,
    slaSummary: raw.sla?.isConfigured ? raw.sla.status : undefined,
    errorMessage,
    timeline: timeline.map(t => ({
      name:    t.integrationName ?? '',
      startMs: base ? new Date(t.startTimestamp).getTime() - new Date(base).getTime() : 0,
      endMs:   base
        ? new Date(t.startTimestamp).getTime() - new Date(base).getTime() + (t.executionTimeMs ?? 0)
        : (t.executionTimeMs ?? 0),
    })),
    stepRows,
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  SUCCESS:    'success',
  FAILED:     'danger',
  ERROR:      'danger',
  TIMEOUT:    'warning',
  PROCESSING: 'primary',
  PENDING:    'secondary',
  CANCELLED:  'secondary',
}

const STATUSES = ['SUCCESS', 'FAILED', 'ERROR', 'TIMEOUT', 'PROCESSING', 'PENDING', 'CANCELLED']

const SLIDER_MAX_DEFAULT  = 1440
const SLIDER_MAX_BUSINESS = 10080

// Initialise mermaid once (outside components so it runs exactly once)
mermaid.initialize({ startOnLoad: false, theme: 'dark' })

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMinutes(min: number): string {
  if (min < 60)   return `${min} minute${min !== 1 ? 's' : ''}`
  if (min < 1440) {
    const h = min / 60
    return `${h % 1 === 0 ? h : h.toFixed(1)} hour${h > 1 ? 's' : ''}`
  }
  const d = min / 1440
  return `${d % 1 === 0 ? d : d.toFixed(1)} day${d > 1 ? 's' : ''}`
}

function fmtMs(ms?: number | null): string {
  if (ms == null) return '–'
  if (ms < 1000)  return `${ms} ms`
  const s = ms / 1000
  if (s < 60)     return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s % 60)}s`
}

// ── Primitive UI pieces ───────────────────────────────────────────────────────

function StatusBadge({ value, onClick }: { value: string; onClick?: () => void }) {
  const variant = STATUS_COLORS[value?.toUpperCase()] ?? 'info'
  const clickable = !!onClick && ['ERROR', 'FAILED'].includes(value?.toUpperCase())
  return (
    <span
      className={`badge bg-${variant}`}
      style={{ fontSize: 11, fontWeight: 600, cursor: clickable ? 'pointer' : 'default' }}
      title={clickable ? 'Click for error details' : undefined}
      onClick={onClick}
    >
      {value}
    </span>
  )
}

function SummaryCard({ label, value, accent = '#3498DB' }: {
  label: string; value: React.ReactNode; accent?: string
}) {
  return (
    <div style={{
      background: 'rgba(30,41,59,.85)',
      border: '1px solid rgba(46,134,193,.2)',
      borderLeft: `3px solid ${accent}`,
      borderRadius: 8,
      padding: '10px 14px',
    }}>
      <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 15 }}>{value}</div>
    </div>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: '#AED6F1', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, margin: '14px 0 8px' }}>
      {children}
    </div>
  )
}

// ── Reusable modal shell ──────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1050,
        background: 'rgba(0,0,0,.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'rgba(15,23,42,.97)',
        border: '1px solid rgba(46,134,193,.35)',
        borderRadius: 12,
        width: wide ? 'min(1100px,95vw)' : 'min(820px,95vw)',
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(46,134,193,.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 15 }}>{title}</span>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={onClose}
            style={{ padding: '2px 8px', lineHeight: 1.5 }}
          >
            <i className="fas fa-times" />
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── CSS execution-timeline chart ──────────────────────────────────────────────

function TimelineChart({ timeline }: { timeline: { name: string; startMs: number; endMs: number }[] }) {
  const maxEnd = Math.max(...timeline.map(t => t.endMs), 1)
  const colors = ['#3498DB', '#2ECC71', '#E67E22', '#E74C3C', '#9B59B6', '#1ABC9C', '#F39C12']
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 360 }}>
        {timeline.map((t, i) => {
          const left  = (t.startMs / maxEnd) * 100
          const width = Math.max(((t.endMs - t.startMs) / maxEnd) * 100, 1)
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 140, flexShrink: 0, color: '#94a3b8', fontSize: 11, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.name}
              </div>
              <div style={{ flex: 1, height: 18, position: 'relative', background: 'rgba(255,255,255,.06)', borderRadius: 3 }}>
                <div
                  style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 0, bottom: 0, background: colors[i % colors.length], opacity: .8, borderRadius: 3 }}
                  title={`${t.name}: ${fmtMs(t.endMs - t.startMs)}`}
                />
              </div>
              <div style={{ width: 60, flexShrink: 0, color: '#64748b', fontSize: 11 }}>{fmtMs(t.endMs - t.startMs)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Transaction Details Modal ─────────────────────────────────────────────────

function TransactionDetailsModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const [viewMode, setViewMode] = useState<'transaction' | 'correlation'>('transaction')
  const txId = tx.transactionId ?? tx.messageId

  const { data: detail, isFetching } = useQuery<TransactionDetail>({
    queryKey: ['tx-detail', txId, viewMode],
    queryFn: () =>
      apiClient.get<RawTransactionDetail>(
        `/Transactions/GetTransactionDetails?transactionId=${encodeURIComponent(txId)}&viewMode=${viewMode}`
      ).then(r => adaptDetailResponse(r.data)),
    enabled: !!txId,
  })

  return (
    <Modal title={`Transaction Details — ${tx.documentNumber || tx.messageId}`} onClose={onClose} wide>

      {/* View-mode toggle */}
      <div className="d-flex align-items-center gap-3 mb-3">
        <div className="btn-group btn-group-sm" role="group">
          <button
            type="button"
            className={`btn btn-outline-info${viewMode === 'transaction' ? ' active' : ''}`}
            onClick={() => setViewMode('transaction')}
          >Transaction</button>
          <button
            type="button"
            className={`btn btn-outline-info${viewMode === 'correlation' ? ' active' : ''}`}
            onClick={() => setViewMode('correlation')}
          >Correlation</button>
        </div>
      </div>

      {isFetching && !detail && (
        <div className="text-center py-4">
          <span className="spinner-border text-primary" style={{ width: 32, height: 32 }} />
        </div>
      )}

      {detail && (
        <>
          {/* Summary cards */}
          <div className="row g-2 mb-2">
            <div className="col-6 col-md-3">
              <SummaryCard label="Status"     value={<StatusBadge value={detail.status} />} />
            </div>
            <div className="col-6 col-md-3">
              <SummaryCard label="Steps"      value={detail.steps} />
            </div>
            <div className="col-6 col-md-3">
              <SummaryCard label="Total Time" value={fmtMs(detail.totalTimeMs)} />
            </div>
            <div className="col-6 col-md-3">
              <SummaryCard label="SLA"        value={detail.slaSummary ?? '–'} accent="#6c757d" />
            </div>
          </div>

          {/* Execution timeline chart */}
          {detail.timeline?.length ? (
            <>
              <SectionHead>Execution Timeline</SectionHead>
              <TimelineChart timeline={detail.timeline} />
            </>
          ) : null}

          {/* Steps — DevExtreme DataGrid */}
          {detail.stepRows?.length ? (
            <>
              <SectionHead>Steps</SectionHead>
              <DataGrid
                dataSource={detail.stepRows}
                showBorders={false}
                showColumnLines={true}
                showRowLines={true}
                rowAlternationEnabled={true}
                columnAutoWidth={true}
                height="auto"
              >
                <Column dataField="stepName"  caption="Step"       />
                <Column dataField="system"    caption="System"     />
                <Column
                  dataField="status"
                  caption="Status"
                  width={100}
                  alignment="center"
                  cellRender={({ value }: { value: string }) => <StatusBadge value={value} />}
                />
                <Column
                  dataField="durationMs"
                  caption="Duration"
                  width={110}
                  cellRender={({ value }: { value: number }) => <span>{fmtMs(value)}</span>}
                />
                <Column dataField="timestamp" caption="Timestamp" width={170} />
                <Column
                  dataField="timeSincePrevious"
                  caption="Interval"
                  width={100}
                  cellRender={({ value }: { value: number }) => <span style={{ color: '#94a3b8' }}>{fmtMs(value)}</span>}
                />
                <Column
                  dataField="cumulativeDuration"
                  caption="Cum. Dur."
                  width={100}
                  cellRender={({ value }: { value: number }) => <span style={{ color: '#AED6F1' }}>{fmtMs(value)}</span>}
                />
                <Column
                  dataField="cumulativeInterval"
                  caption="Elapsed"
                  width={100}
                  cellRender={({ value }: { value: number }) => <span style={{ color: '#F39C12' }}>{fmtMs(value)}</span>}
                />
              </DataGrid>
            </>
          ) : null}
        </>
      )}
    </Modal>
  )
}

// ── Sequence Diagram Modal ────────────────────────────────────────────────────

function SequenceDiagramModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const [zoom, setZoom]                 = useState(13)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [svgContent, setSvgContent]     = useState<string>('')
  const [renderError, setRenderError]   = useState<string>('')
  const svgRef = useRef<HTMLDivElement>(null)
  const txId   = tx.transactionId ?? tx.messageId

  const { data, isFetching } = useQuery<{ diagram: string }>({
    queryKey: ['tx-seq', txId],
    queryFn: () =>
      apiClient.get<{ diagram: string }>(
        `/Transactions/GetSequenceDiagram?transactionId=${encodeURIComponent(txId)}`
      ).then(r => r.data),
    enabled: !!txId,
  })

  const diagram = data?.diagram ?? ''

  // Render mermaid diagram whenever the diagram text changes
  useEffect(() => {
    if (!diagram) { setSvgContent(''); setRenderError(''); return }
    let cancelled = false
    // Sanitise txId so the element id is a valid CSS identifier
    const safeId = `seq-${txId.replace(/[^a-zA-Z0-9]/g, '_')}`
    mermaid.render(safeId, diagram)
      .then(({ svg }) => { if (!cancelled) { setSvgContent(svg); setRenderError('') } })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRenderError(String(err))
          setSvgContent('')
        }
      })
    return () => { cancelled = true }
  }, [diagram, txId])

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(diagram)
  }, [diagram])

  const handleDownload = useCallback(() => {
    const blob = new Blob([diagram], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `sequence-${txId}.mmd`
    a.click()
    URL.revokeObjectURL(url)
  }, [diagram, txId])

  const handleExportPdf = useCallback(() => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(
      `<!doctype html><html><head><title>Sequence Diagram</title>` +
      `<style>body{font-family:sans-serif;padding:20px;}svg{max-width:100%;}</style></head>` +
      `<body>${svgContent || diagram.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body></html>`
    )
    w.document.close()
    w.print()
  }, [diagram, svgContent])

  const containerStyle: React.CSSProperties = {
    background: 'rgba(10,15,30,.9)',
    border: '1px solid rgba(46,134,193,.2)',
    borderRadius: 8,
    padding: '14px 18px',
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: isFullscreen ? 'calc(100vh - 120px)' : 400,
    transform: `scale(${zoom / 13})`,
    transformOrigin: 'top left',
  }

  const content = (
    <>
      {/* Toolbar */}
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <div className="btn-group btn-group-sm">
          <button className="btn btn-outline-secondary" onClick={() => setZoom(z => Math.max(9, z - 1))} title="Zoom out">
            <i className="fas fa-search-minus" />
          </button>
          <button className="btn btn-outline-secondary" disabled style={{ minWidth: 38, color: '#94a3b8' }}>
            {zoom}
          </button>
          <button className="btn btn-outline-secondary" onClick={() => setZoom(z => Math.min(24, z + 1))} title="Zoom in">
            <i className="fas fa-search-plus" />
          </button>
        </div>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => setIsFullscreen(f => !f)} title="Toggle fullscreen">
          <i className={`fas fa-${isFullscreen ? 'compress' : 'expand'}`} />
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={handleCopy} title="Copy source">
          <i className="fas fa-copy me-1" />Copy
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={handleDownload} title="Download .mmd">
          <i className="fas fa-download me-1" />Download
        </button>
        <button className="btn btn-sm btn-outline-primary" onClick={handleExportPdf} title="Export PDF">
          <i className="fas fa-file-pdf me-1" />Export PDF
        </button>
      </div>

      {isFetching && !data && (
        <div className="text-center py-4">
          <span className="spinner-border text-primary" />
        </div>
      )}

      {renderError && (
        <div className="alert alert-warning" style={{ fontSize: 12 }}>
          <i className="fas fa-exclamation-triangle me-2" />
          Could not render diagram: {renderError}
          <pre style={{ fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap', color: '#a5d8ff' }}>{diagram}</pre>
        </div>
      )}

      {svgContent ? (
        <div ref={svgRef} style={containerStyle} dangerouslySetInnerHTML={{ __html: svgContent }} />
      ) : (!isFetching && !renderError && (
        <div className="text-center py-4 text-muted" style={{ fontSize: 13 }}>
          No sequence diagram available for this transaction.
        </div>
      ))}
    </>
  )

  if (isFullscreen) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(15,23,42,.99)',
          display: 'flex', flexDirection: 'column',
          padding: '1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
            Sequence Diagram — {tx.documentNumber || tx.messageId}
          </span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setIsFullscreen(false)}>
            <i className="fas fa-compress me-1" />Exit
          </button>
        </div>
        {content}
      </div>
    )
  }

  return (
    <Modal title={`Sequence Diagram — ${tx.documentNumber || tx.messageId}`} onClose={onClose} wide>
      {content}
    </Modal>
  )
}

// ── Error Details Modal ───────────────────────────────────────────────────────

function ErrorDetailsModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const txId = tx.transactionId ?? tx.messageId

  const { data: detail, isFetching } = useQuery<TransactionDetail>({
    queryKey: ['tx-error', txId],
    queryFn: () =>
      apiClient.get<RawTransactionDetail>(
        `/Transactions/GetTransactionDetails?transactionId=${encodeURIComponent(txId)}&viewMode=transaction`
      ).then(r => adaptDetailResponse(r.data)),
    enabled: !!txId,
  })

  const failedSteps = detail?.stepRows?.filter(
    s => ['ERROR', 'FAILED'].includes(s.status?.toUpperCase())
  ) ?? []

  return (
    <Modal title={`Error Details — ${tx.documentNumber || tx.messageId}`} onClose={onClose}>
      {isFetching && !detail && (
        <div className="text-center py-4">
          <span className="spinner-border text-danger" />
        </div>
      )}

      {detail && (
        <>
          <div style={{
            background: 'rgba(231,76,60,.1)',
            border: '1px solid rgba(231,76,60,.3)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 14,
          }}>
            <div style={{ color: '#E74C3C', fontWeight: 600, marginBottom: 6, fontSize: 13 }}>
              <i className="fas fa-exclamation-triangle me-2" />Status: {detail.status}
            </div>
            {detail.errorMessage && (
              <div style={{ color: '#e2e8f0', fontSize: 13 }}>{detail.errorMessage}</div>
            )}
          </div>

          {detail.errorDetails && (
            <>
              <SectionHead>Stack / Details</SectionHead>
              <pre style={{
                background: 'rgba(10,15,30,.9)',
                border: '1px solid rgba(231,76,60,.2)',
                borderRadius: 8, padding: '12px', fontSize: 12,
                color: '#fca5a5', overflowX: 'auto', whiteSpace: 'pre-wrap',
                wordBreak: 'break-word', maxHeight: 280,
              }}>
                {detail.errorDetails}
              </pre>
            </>
          )}

          {failedSteps.length > 0 && (
            <>
              <SectionHead>Failed Steps</SectionHead>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Step', 'System', 'Status', 'Duration'].map(h => (
                        <th key={h} style={{ color: '#AED6F1', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,.15)', fontWeight: 600, textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {failedSteps.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                        <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>{s.stepName}</td>
                        <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{s.system}</td>
                        <td style={{ padding: '6px 8px' }}><StatusBadge value={s.status} /></td>
                        <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>{fmtMs(s.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!detail.errorMessage && !detail.errorDetails && failedSteps.length === 0 && (
            <div className="text-muted text-center py-3" style={{ fontSize: 13 }}>
              No specific error details available.
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

// ── Child steps (MasterDetail template) ──────────────────────────────────────

function ChildStepsView({ data: rowData }: { data: { data: Transaction; key: string } }) {
  const tx = rowData.data

  const { data: childData, isFetching } = useQuery<ChildTxResponse>({
    queryKey: ['tx-children', tx.transactionId],
    queryFn: () =>
      apiClient.get<ChildTxResponse>('/Transactions/GetTransactions', {
        params: { parentTransactionId: tx.transactionId, pageSize: 100 },
      }).then(r => r.data),
    enabled: !!tx.transactionId,
  })

  if (!tx.transactionId) {
    return (
      <div style={{ padding: '12px 20px', color: '#64748b', fontSize: 13 }}>
        No child steps available for this transaction.
      </div>
    )
  }

  if (isFetching) {
    return (
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13 }}>
        <span className="spinner-border spinner-border-sm" />
        Loading child steps…
      </div>
    )
  }

  const children = childData?.data ?? []

  if (!children.length) {
    return (
      <div style={{ padding: '12px 20px', color: '#64748b', fontSize: 13 }}>
        No child steps found for transaction <code style={{ fontSize: 11 }}>{tx.transactionId}</code>.
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 20px 12px', background: 'rgba(10,20,40,.4)' }}>
      <div style={{ color: '#AED6F1', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
        Child Steps ({children.length})
      </div>
      <DataGrid
        dataSource={children}
        keyExpr="messageId"
        showBorders={false}
        showColumnLines={true}
        showRowLines={true}
        rowAlternationEnabled={false}
        columnAutoWidth={true}
        height="auto"
      >
        <Column dataField="documentNumber"  caption="Document #"  width={140} />
        <Column dataField="documentType"    caption="Doc Type"    width={110} />
        <Column dataField="integrationName" caption="Integration" width={180} />
        <Column
          dataField="status"
          caption="Status"
          width={100}
          alignment="center"
          cellRender={({ value }: { value: string }) => <StatusBadge value={value} />}
        />
        <Column
          dataField="startTimestamp"
          caption="Start Time"
          dataType="datetime"
          format="dd/MM/yyyy HH:mm:ss"
          width={160}
        />
        <Column
          dataField="executionTimeMs"
          caption="Exec (ms)"
          dataType="number"
          width={90}
          alignment="right"
        />
        <Column dataField="sourceSystem" caption="Source" width={120} />
        <Column dataField="targetSystem" caption="Target" width={120} />
      </DataGrid>
    </div>
  )
}

// ── Diagnostics panel ─────────────────────────────────────────────────────────

function DiagnosticsPanel({
  result,
  onClose,
}: {
  result: { endpoint: string; data: unknown }
  onClose: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{
      marginTop: 16,
      background: 'rgba(15,23,42,.9)',
      border: '1px solid rgba(46,134,193,.25)',
      borderRadius: 8,
      overflow: 'hidden',
      width: '100%',
    }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', cursor: 'pointer', borderBottom: collapsed ? 'none' : '1px solid rgba(46,134,193,.15)' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ color: '#AED6F1', fontSize: 13, fontWeight: 600 }}>
          <i className={`fas fa-chevron-${collapsed ? 'right' : 'down'} me-2`} style={{ fontSize: 11 }} />
          Diagnostics — {result.endpoint}
        </span>
        <button
          className="btn btn-sm btn-outline-secondary"
          style={{ padding: '1px 6px', fontSize: 11 }}
          onClick={(e) => { e.stopPropagation(); onClose() }}
        >
          <i className="fas fa-times" />
        </button>
      </div>
      {!collapsed && (
        <pre style={{
          margin: 0, padding: '10px 14px',
          fontSize: 11, color: '#a5d8ff',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 300, overflowY: 'auto',
        }}>
          {JSON.stringify(result.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { filters, update } = useTransactionFilters()
  const { data: opts }      = useDashboardFilterOptions()
  const queryClient         = useQueryClient()

  // Multi-select draft state (committed on Search)
  const [envIds,           setEnvIds]           = useState<number[]>([])
  const [segmentIds,       setSegmentIds]       = useState<number[]>([])
  const [processIds,       setProcessIds]       = useState<number[]>([])
  const [subprocessIds,    setSubprocessIds]    = useState<number[]>([])
  const [brandIds,         setBrandIds]         = useState<number[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

  // Slider + search text (draft)
  const [sliderValue, setSliderValue] = useState(filters.timeMinutes ?? 10)
  const [searchDoc,   setSearchDoc]   = useState(filters.searchDocument ?? '')

  // Cascaded subprocess options filtered by selected process IDs
  const subprocessOpts = useMemo(() => {
    const all = opts?.businessSubprocesses ?? []
    if (processIds.length === 0) return all
    const pids = new Set(processIds)
    return all.filter(s => pids.has(s.businessProcessId))
  }, [opts?.businessSubprocesses, processIds])

  // Clear subprocess selections that no longer belong to selected processes
  useEffect(() => {
    if (processIds.length > 0 && subprocessIds.length > 0) {
      const validIds = new Set(subprocessOpts.map(s => s.value))
      const next = subprocessIds.filter(id => validIds.has(id))
      if (next.length !== subprocessIds.length) setSubprocessIds(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processIds])

  const hasBusinessFilter = segmentIds.length > 0 || processIds.length > 0 || subprocessIds.length > 0 || brandIds.length > 0
  const sliderMax = hasBusinessFilter ? SLIDER_MAX_BUSINESS : SLIDER_MAX_DEFAULT

  // Clamp slider if max shrinks
  useEffect(() => {
    if (!hasBusinessFilter && sliderValue > SLIDER_MAX_DEFAULT) {
      setSliderValue(SLIDER_MAX_DEFAULT)
    }
  }, [hasBusinessFilter, sliderValue])

  // Submitted filters — query fires only when this state changes
  const [submitted, setSubmitted] = useState({ ...filters })
  const { data, isFetching } = useTransactions(submitted)

  const handleSearch = useCallback(() => {
    const patch = {
      timeMinutes:           sliderValue,
      searchDocument:        searchDoc || undefined,
      environmentIds:        envIds.join(',')        || undefined,
      businessSegmentIds:    segmentIds.join(',')    || undefined,
      businessProcessIds:    processIds.join(',')    || undefined,
      businessSubprocessIds: subprocessIds.join(',') || undefined,
      brandIds:              brandIds.join(',')      || undefined,
      statuses:              selectedStatuses.join(',') || undefined,
    }
    update(patch)
    setSubmitted(prev => ({ ...prev, ...patch, page: 1 }))
  }, [envIds, segmentIds, processIds, subprocessIds, brandIds, selectedStatuses, sliderValue, searchDoc, update])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['transactions'] })
  }, [queryClient])

  // Modal state
  const [detailsTx, setDetailsTx] = useState<Transaction | null>(null)
  const [seqTx,     setSeqTx]     = useState<Transaction | null>(null)
  const [errorTx,   setErrorTx]   = useState<Transaction | null>(null)

  // Diagnostics
  const [diagResult,  setDiagResult]  = useState<{ endpoint: string; data: unknown } | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)

  const checkDiagnostics = useCallback(async (endpoint: string) => {
    setDiagLoading(true)
    try {
      const res = await apiClient.get<unknown>(endpoint)
      setDiagResult({ endpoint, data: res.data })
    } catch (err: unknown) {
      setDiagResult({ endpoint, data: { error: String(err) } })
    } finally {
      setDiagLoading(false)
    }
  }, [])

  const totalCount   = data?.totalCount   ?? 0
  const transactions = data?.transactions ?? []
  const isEmpty      = !isFetching && transactions.length === 0

  // Hide expand chevron for rows without transactionId
  const onRowPrepared = useCallback((e: { rowType?: string; data?: Transaction; rowElement?: Element }) => {
    if (e.rowType === 'data' && !e.data?.transactionId) {
      const cell = e.rowElement?.querySelector?.('.dx-command-expand') as HTMLElement | null
      if (cell) cell.style.visibility = 'hidden'
    }
  }, [])

  // Cell renderers (stable references, avoid re-registering on every render)
  const actionsCellRender = useCallback(({ data: tx }: { data: Transaction }) => (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
      <button
        title="View Timeline"
        style={{
          background: 'rgba(52,152,219,.18)', color: '#5DADE2',
          border: '1px solid rgba(52,152,219,.3)', borderRadius: 4,
          padding: '2px 7px', fontSize: 12, cursor: 'pointer',
        }}
        onClick={() => setDetailsTx(tx)}
      >
        <i className="fas fa-stream" />
      </button>
      <button
        title="Sequence Diagram"
        style={{
          background: 'rgba(46,204,113,.15)', color: '#2ECC71',
          border: '1px solid rgba(46,204,113,.3)', borderRadius: 4,
          padding: '2px 7px', fontSize: 12, cursor: 'pointer',
        }}
        onClick={() => setSeqTx(tx)}
      >
        <i className="fas fa-project-diagram" />
      </button>
    </div>
  ), [])

  const statusCellRender = useCallback(({ data: tx, value }: { data: Transaction; value: string }) => (
    <StatusBadge
      value={value}
      onClick={['ERROR', 'FAILED'].includes(value?.toUpperCase()) ? () => setErrorTx(tx) : undefined}
    />
  ), [])

  const txIdCellRender = useCallback(({ value }: { value: string }) =>
    value ? <code style={{ fontSize: 11, color: '#a5d8ff' }}>{value}</code> : null
  , [])

  return (
    <div className="dashboard-layout" style={{ background: 'var(--gtek-dark-blue)' }}>

      {/* ── Filter sidebar ────────────────────────────────── */}
      <FiltersSidebar loading={isFetching}>

        {/* Environment */}
        <div className="filter-group">
          <label className="filter-label">Environment</label>
          <TagBox
            dataSource={opts?.environments ?? []}
            displayExpr="text"
            valueExpr="value"
            value={envIds}
            onValueChanged={(e) => setEnvIds((e.value ?? []) as number[])}
            placeholder="All Environments"
            showClearButton showSelectionControls applyValueMode="useButtons" searchEnabled
          />
        </div>

        {/* Time Range slider */}
        <div className="filter-group">
          <label className="filter-label">Time Range</label>
          <div style={{ color: 'var(--gtek-accent-blue)', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            {formatMinutes(sliderValue)}
          </div>
          <input
            type="range" className="form-range"
            min={10} max={sliderMax} step={5}
            value={sliderValue}
            onChange={(e) => setSliderValue(Number(e.target.value))}
            style={{ accentColor: 'var(--gtek-accent-blue)' }}
          />
          <div className="d-flex justify-content-between" style={{ fontSize: 10, color: '#64748b' }}>
            <span>10m</span>
            <span>{formatMinutes(sliderMax)}</span>
          </div>
          <small style={{ color: '#64748b', fontSize: 10, display: 'block', marginTop: 4 }}>
            Tip: select a Business Segment, Process, or Subprocess to extend up to 7 days.
          </small>
        </div>

        {/* Search */}
        <div className="filter-group">
          <label className="filter-label">Search</label>
          <input
            className="form-control form-control-sm"
            placeholder="MessageId, TransactionId, CorrelationId, Document..."
            value={searchDoc}
            onChange={(e) => setSearchDoc(e.target.value)}
            style={{ background: 'rgba(30,41,59,.8)', color: '#e2e8f0', border: '1px solid rgba(46,134,193,.3)', fontSize: 13 }}
          />
        </div>

        {/* Business Segment */}
        <div className="filter-group">
          <label className="filter-label">Business Segment</label>
          <TagBox
            dataSource={opts?.businessSegments ?? []}
            displayExpr="text"
            valueExpr="value"
            value={segmentIds}
            onValueChanged={(e) => setSegmentIds((e.value ?? []) as number[])}
            placeholder="All Segments"
            showClearButton showSelectionControls applyValueMode="useButtons" searchEnabled
          />
        </div>

        {/* Business Process */}
        <div className="filter-group">
          <label className="filter-label">Business Process</label>
          <TagBox
            dataSource={opts?.businessProcesses ?? []}
            displayExpr="text"
            valueExpr="value"
            value={processIds}
            onValueChanged={(e) => setProcessIds((e.value ?? []) as number[])}
            placeholder="All Processes"
            showClearButton showSelectionControls applyValueMode="useButtons" searchEnabled
          />
        </div>

        {/* Business Subprocess — cascades from process selection */}
        <div className="filter-group">
          <label className="filter-label">Business Subprocess</label>
          <TagBox
            dataSource={subprocessOpts}
            displayExpr="text"
            valueExpr="value"
            value={subprocessIds}
            onValueChanged={(e) => setSubprocessIds((e.value ?? []) as number[])}
            placeholder="All Subprocesses"
            showClearButton showSelectionControls applyValueMode="useButtons" searchEnabled
          />
        </div>

        {/* Brand */}
        <div className="filter-group">
          <label className="filter-label">Brand</label>
          <TagBox
            dataSource={opts?.brands ?? []}
            displayExpr="text"
            valueExpr="value"
            value={brandIds}
            onValueChanged={(e) => setBrandIds((e.value ?? []) as number[])}
            placeholder="All Brands"
            showClearButton showSelectionControls applyValueMode="useButtons" searchEnabled
          />
        </div>

        {/* Status */}
        <div className="filter-group">
          <label className="filter-label">Status</label>
          <TagBox
            dataSource={STATUSES}
            value={selectedStatuses}
            onValueChanged={(e) => setSelectedStatuses((e.value ?? []) as string[])}
            placeholder="All Statuses"
            showClearButton showSelectionControls applyValueMode="useButtons"
          />
        </div>

        {/* Action buttons */}
        <div className="filter-group mt-2 d-grid gap-2">
          <button className="btn btn-primary btn-sm" onClick={handleSearch} disabled={isFetching}>
            {isFetching
              ? <><span className="spinner-border spinner-border-sm me-2" />Searching…</>
              : <><i className="fas fa-search me-2" />Search</>
            }
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={handleRefresh} disabled={isFetching}>
            <i className="fas fa-sync-alt me-2" />Refresh
          </button>
        </div>

      </FiltersSidebar>

      {/* ── Main content ──────────────────────────────────── */}
      <div className="dashboard-content">

        {/* Page header */}
        <div className="mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>
            <h1 className="h3 text-white mb-1">
              <i className="fas fa-exchange-alt me-2 text-primary" />
              Transaction Monitor
            </h1>
            <p className="text-muted mb-0" style={{ fontSize: 14 }}>
              Monitor and search business transactions
            </p>
          </div>
          <div className="d-flex align-items-center gap-3">
            {isFetching && (
              <span className="text-muted" style={{ fontSize: 13 }}>
                <span className="spinner-border spinner-border-sm me-1" />
                Loading…
              </span>
            )}
            {!isFetching && (
              <span className="badge bg-primary" style={{ fontSize: 13, padding: '6px 12px' }}>
                {totalCount.toLocaleString()} transactions
              </span>
            )}
          </div>
        </div>

        {/* Grid card */}
        <div
          className="card"
          style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)', overflow: 'hidden' }}
        >
          {isEmpty ? (
            /* Empty state */
            <div className="card-body d-flex flex-column align-items-center justify-content-center py-5">
              <div className="mb-3" style={{ fontSize: 56, opacity: .35 }}>
                <i className="fas fa-inbox" />
              </div>
              <h5 className="text-white mb-1">No transactions found</h5>
              <p className="text-muted mb-4" style={{ fontSize: 13 }}>
                Try adjusting the filters above to see more data.
              </p>
              <div className="d-flex gap-3 flex-wrap justify-content-center">
                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => void checkDiagnostics('/api/diagnostics/status')}
                  disabled={diagLoading}
                >
                  {diagLoading
                    ? <span className="spinner-border spinner-border-sm me-2" />
                    : <i className="fas fa-heartbeat me-2" />
                  }
                  Check System Status
                </button>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => void checkDiagnostics('/api/diagnostics/redis')}
                  disabled={diagLoading}
                >
                  {diagLoading
                    ? <span className="spinner-border spinner-border-sm me-2" />
                    : <i className="fas fa-database me-2" />
                  }
                  Check Redis Cache
                </button>
              </div>
              {diagResult && (
                <div style={{ width: '100%', maxWidth: 700 }}>
                  <DiagnosticsPanel result={diagResult} onClose={() => setDiagResult(null)} />
                </div>
              )}
            </div>
          ) : (
            <div className="card-body p-0">
              <DataGrid
                dataSource={transactions}
                keyExpr="messageId"
                showBorders={false}
                showColumnLines={true}
                showRowLines={true}
                rowAlternationEnabled={true}
                columnAutoWidth={true}
                allowColumnResizing={true}
                allowColumnReordering={true}
                wordWrapEnabled={false}
                height={640}
                onRowPrepared={onRowPrepared}
              >
                <FilterRow visible={true} />
                <HeaderFilter visible={true} />
                <ColumnChooser enabled={true} />

                <MasterDetail enabled={true} component={ChildStepsView} />

                <Paging
                  pageSize={filters.pageSize ?? 25}
                  pageIndex={(filters.page ?? 1) - 1}
                  onPageSizeChange={(size: number) => update({ pageSize: size })}
                  onPageIndexChange={(idx: number) => {
                    const newPage = idx + 1
                    update({ page: newPage })
                    setSubmitted(prev => ({ ...prev, page: newPage }))
                  }}
                />
                <Pager
                  showPageSizeSelector={true}
                  allowedPageSizes={[25, 50, 100]}
                  showInfo={true}
                  infoText="Page {0} of {1} ({2} items)"
                  visible={true}
                />

                {/* Actions column — pinned right */}
                <Column
                  caption="Actions"
                  width={80}
                  allowSorting={false}
                  allowFiltering={false}
                  allowReordering={false}
                  cellRender={actionsCellRender}
                  fixed={true}
                  fixedPosition="right"
                  alignment="center"
                />

                {/* Transaction ID */}
                <Column
                  dataField="transactionId"
                  caption="Transaction ID"
                  width={220}
                  cellRender={txIdCellRender}
                />
                {/* Document */}
                <Column dataField="documentNumber"          caption="Document #"         width={160} fixed={true} />
                <Column dataField="documentType"            caption="Doc Type"           width={120} />
                <Column dataField="referenceDocumentType"   caption="Ref Doc Type"       width={130} visible={false} />
                <Column dataField="referenceDocumentNumber" caption="Ref Doc #"          width={140} visible={false} />
                {/* Status */}
                <Column
                  dataField="status"
                  caption="Status"
                  width={120}
                  alignment="center"
                  cellRender={statusCellRender}
                />
                <Column dataField="direction"               caption="Direction"          width={100} />
                {/* Business dimensions */}
                <Column dataField="businessSegmentName"     caption="Business Segment"   width={160} />
                <Column dataField="businessProcessName"     caption="Business Process"   width={180} />
                <Column dataField="businessProcessStage"    caption="Process Stage"      width={140} visible={false} />
                <Column dataField="businessSubprocessName"  caption="Subprocess"         width={180} />
                <Column dataField="brandName"               caption="Brand"              width={130} />
                <Column dataField="countryName"             caption="Country"            width={110} />
                <Column dataField="environmentName"         caption="Environment"        width={130} />
                {/* Time */}
                <Column
                  dataField="startTimestamp"
                  caption="Start Time"
                  dataType="datetime"
                  format="dd/MM/yyyy HH:mm:ss"
                  width={170}
                />
                <Column
                  dataField="executionTimeMs"
                  caption="Exec (ms)"
                  dataType="number"
                  format={{ type: 'fixedPoint', precision: 0 }}
                  width={100}
                  alignment="right"
                />
                <Column dataField="integrationName"         caption="Integration"        width={200} />
                {/* Combined Source → Target — always visible */}
                <Column
                  caption="Route"
                  width={240}
                  allowSorting={false}
                  allowFiltering={false}
                  cellRender={({ data: rowTx }: { data: Transaction }) => (
                    <span style={{ fontSize: 12 }}>
                      <span style={{ color: '#94a3b8' }}>{rowTx.sourceSystem}</span>
                      <span style={{ color: '#AED6F1', margin: '0 4px' }}>→</span>
                      <span style={{ color: '#94a3b8' }}>{rowTx.targetSystem}</span>
                    </span>
                  )}
                />
                <Column dataField="sourceSystem"            caption="Source"             width={150} visible={false} />
                <Column dataField="targetSystem"            caption="Target"             width={150} visible={false} />
                <Column dataField="correlationId"           caption="Correlation ID"     width={240} visible={false} />
                <Column dataField="messageId"               caption="Message ID"         width={240} visible={false} />
              </DataGrid>
            </div>
          )}
        </div>

      </div>

      {/* ── Modals ───────────────────────────────────────── */}
      {detailsTx && <TransactionDetailsModal tx={detailsTx} onClose={() => setDetailsTx(null)} />}
      {seqTx     && <SequenceDiagramModal    tx={seqTx}     onClose={() => setSeqTx(null)}     />}
      {errorTx   && <ErrorDetailsModal       tx={errorTx}   onClose={() => setErrorTx(null)}   />}

    </div>
  )
}
