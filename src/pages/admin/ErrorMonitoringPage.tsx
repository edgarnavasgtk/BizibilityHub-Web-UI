import { useState, useCallback } from 'react'
import DataGrid, {
  Column, Paging, Pager, FilterRow, SearchPanel, MasterDetail, Summary, TotalItem,
} from 'devextreme-react/data-grid'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'
import { getAntiForgeryToken } from '../../services/csrf'

/* ── Types ──────────────────────────────────────────────────── */

interface IngestionError {
  id: number
  occurredAt: string
  source: string
  errorType: string
  processingStage: string
  errorMessage: string
  stackTrace?: string
  payloadContent?: string
  entityId?: string
  messageId?: string
  retryCount: number
  isResolved: boolean
  resolvedBy?: string
  resolvedAt?: string
  resolution?: string
}

interface ErrorGroup {
  groupKey: string
  errorType: string
  sampleMessage: string
  count: number
  openCount: number
  resolvedCount: number
  sources: string
  processingStages: string
  firstSeen: string
  lastSeen: string
  instances: IngestionError[]
}

interface Investigation {
  error: IngestionError & { stackTrace?: string; payloadContent?: string; resolution?: string }
  extracted: {
    correlationId?: string; messageId?: string; executionId?: string
    integrationName?: string; direction?: string; partner?: string
    sourceSystem?: string; targetSystem?: string; documentNumber?: string
    parseFailed?: boolean; parseNote?: string
  }
  siblings: Array<{
    integrationName?: string; direction?: string; sourceSystem?: string
    targetSystem?: string; status?: string; documentNumber?: string
    startTimestamp?: string; isFailingRecord?: boolean
  }>
  ingestedAfterAll?: boolean
}

/* ── Helpers ─────────────────────────────────────────────────── */

function signatureOf(err: IngestionError): string {
  const type = err.errorType || ''
  let msg = err.errorMessage || ''
  if (msg.length > 600) msg = msg.substring(0, 600)
  msg = msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '*')
    .replace(/\b[0-9a-f]{16,}\b/gi, '*')
    .replace(/'[^']{0,200}'/g, "'*'")
    .replace(/"[^"]{0,200}"/g, '"*"')
    .replace(/\b\d+\b/g, '*')
    .replace(/\s+/g, ' ')
    .trim()
  return `${type} | ${msg}`
}

function groupErrors(errors: IngestionError[]): ErrorGroup[] {
  const map = new Map<string, ErrorGroup>()
  errors.forEach((e) => {
    const sig = signatureOf(e)
    let g = map.get(sig)
    if (!g) {
      g = {
        groupKey: sig,
        errorType: e.errorType,
        sampleMessage: e.errorMessage,
        count: 0, openCount: 0, resolvedCount: 0,
        firstSeen: e.occurredAt, lastSeen: e.occurredAt,
        sources: '', processingStages: '',
        instances: [],
      }
      map.set(sig, g)
    }
    g.count++
    if (e.isResolved) g.resolvedCount++; else g.openCount++
    if (new Date(e.occurredAt) < new Date(g.firstSeen)) g.firstSeen = e.occurredAt
    if (new Date(e.occurredAt) > new Date(g.lastSeen)) g.lastSeen = e.occurredAt
    g.instances.push(e)
  })
  map.forEach((g) => {
    const srcCounts = new Map<string, number>()
    const stageCounts = new Map<string, number>()
    g.instances.forEach((i) => {
      if (i.source) srcCounts.set(i.source, (srcCounts.get(i.source) || 0) + 1)
      if (i.processingStage) stageCounts.set(i.processingStage, (stageCounts.get(i.processingStage) || 0) + 1)
    })
    g.sources = Array.from(srcCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]).join(', ')
    g.processingStages = Array.from(stageCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]).join(', ')
  })
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

function sparkline24h(instances: IngestionError[]): React.ReactElement {
  const now = Date.now()
  const windowMs = 24 * 60 * 60 * 1000
  const bucketMs = 2 * 60 * 60 * 1000
  const buckets = new Array(12).fill(0) as number[]
  instances.forEach((e) => {
    const t = new Date(e.occurredAt).getTime()
    const age = now - t
    if (age >= 0 && age < windowMs) {
      const idx = Math.floor(age / bucketMs)
      buckets[11 - idx]++
    }
  })
  const max = Math.max(...buckets, 1)
  const W = 84
  const H = 24
  const pts = buckets
    .map((v, i) => {
      const x = (i / (buckets.length - 1)) * W
      const y = H - 2 - ((v / max) * (H - 6))
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        points={pts}
        fill="none"
        stroke="#3498DB"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function fmtDate(v?: string) {
  if (!v) return '-'
  try { return new Date(v).toLocaleString() } catch { return v }
}

function prettyJson(s?: string) {
  if (!s) return 'No payload available'
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}

/* ── Badge Components ──────────────────────────────────────── */

const pill = (label: string, value?: string) => value ? (
  <span key={label} style={{ display: 'inline-block', background: 'rgba(46,134,193,.18)', color: '#DBEAFE', border: '1px solid rgba(46,134,193,.4)', borderRadius: 6, padding: '3px 8px', margin: '0 6px 6px 0', fontSize: 12 }}>
    <span style={{ color: '#94A3B8', marginRight: 5, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.5px' }}>{label}</span>
    {value}
  </span>
) : null

function TypeBadge({ v }: { v: string }) {
  return <span style={{ background: 'linear-gradient(135deg,#9B59B6,#8E44AD)', color: 'white', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{v}</span>
}
function SourceBadge({ v }: { v: string }) {
  return <span style={{ background: 'linear-gradient(135deg,#3498DB,#2E86C1)', color: 'white', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{v}</span>
}
function StageBadge({ v }: { v: string }) {
  return <span style={{ background: 'linear-gradient(135deg,#F39C12,#E67E22)', color: 'white', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{v}</span>
}
function ResolvedBadge() {
  return <span style={{ background: 'linear-gradient(135deg,#2ECC71,#27AE60)', color: 'white', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>Resolved</span>
}
function PendingBadge() {
  return <span style={{ background: 'linear-gradient(135deg,#E74C3C,#C0392B)', color: 'white', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>Pending</span>
}

function RetryBadge({ count }: { count: number }) {
  const bg = count >= 5 ? 'linear-gradient(135deg,#E74C3C,#C0392B)' : count >= 2 ? 'linear-gradient(135deg,#F39C12,#E67E22)' : 'linear-gradient(135deg,#2ECC71,#27AE60)'
  return <span style={{ background: bg, color: 'white', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{count}</span>
}

/* ── Main Component ──────────────────────────────────────────── */

type FilterMode = 'all' | 'pending' | 'resolved' | 'today'
type ViewMode = 'grouped' | 'flat'

export default function ErrorMonitoringPage() {
  const queryClient = useQueryClient()
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grouped')

  // Investigation drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerErrorId, setDrawerErrorId] = useState<number | null>(null)
  const [drawerIsResolved, setDrawerIsResolved] = useState(false)

  // Resolve modal
  const [resolveModalOpen, setResolveModalOpen] = useState(false)
  const [resolveErrorId, setResolveErrorId] = useState<number | null>(null)
  const [resolveText, setResolveText] = useState('')

  // Group resolve modal
  const [groupResolveOpen, setGroupResolveOpen] = useState(false)
  const [groupResolveIds, setGroupResolveIds] = useState<number[]>([])
  const [groupResolveSample, setGroupResolveSample] = useState('')
  const [groupResolveNotes, setGroupResolveNotes] = useState('')

  // Per-modal and page-level error banners for server-side failure responses
  const [resolveModalError, setResolveModalError] = useState<string | null>(null)
  const [groupResolveError, setGroupResolveError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)

  const { data: allErrors = [], isFetching, refetch } = useQuery<IngestionError[]>({
    queryKey: ['admin', 'ingestionErrors'],
    queryFn: () => apiClient.get('/Admin/GetIngestionErrorsOData').then(r => r.data),
  })

  const { data: investigation, isFetching: investigationLoading } = useQuery<Investigation>({
    queryKey: ['admin', 'errorInvestigation', drawerErrorId],
    queryFn: () => apiClient.get('/Admin/GetErrorInvestigation', { params: { ingestionErrorId: drawerErrorId } }).then(r => r.data),
    enabled: drawerErrorId !== null && drawerOpen,
  })

  const resolveMutation = useMutation({
    mutationFn: async ({ errorId, resolution }: { errorId: number; resolution: string }) => {
      const token = await getAntiForgeryToken('/Admin/ErrorMonitoring')
      const headers: Record<string, string> = {}
      if (token) headers['RequestVerificationToken'] = token
      return apiClient.post('/Admin/ResolveError', { errorId, resolution }, { headers }).then(r => r.data)
    },
    onSuccess: (resp) => {
      if (resp?.success === false) {
        setResolveModalError(resp.message ?? 'Operation failed.')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'ingestionErrors'] })
      setResolveModalOpen(false)
      setDrawerOpen(false)
    },
  })

  const unresolveMutation = useMutation({
    mutationFn: async (errorId: number) => {
      const token = await getAntiForgeryToken('/Admin/ErrorMonitoring')
      const headers: Record<string, string> = {}
      if (token) headers['RequestVerificationToken'] = token
      return apiClient.post('/Admin/UnresolveError', { errorId }, { headers }).then(r => r.data)
    },
    onSuccess: (resp) => {
      if (resp?.success === false) {
        setOperationError(resp.message ?? 'Reopen operation failed.')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'ingestionErrors'] })
      setDrawerOpen(false)
    },
  })

  const resolveGroupMutation = useMutation({
    mutationFn: async ({ errorIds, resolution }: { errorIds: number[]; resolution: string }) => {
      const token = await getAntiForgeryToken('/Admin/ErrorMonitoring')
      const headers: Record<string, string> = {}
      if (token) headers['RequestVerificationToken'] = token
      return apiClient.post('/Admin/ResolveErrorGroup', { errorIds, resolution }, { headers }).then(r => r.data)
    },
    onSuccess: (resp) => {
      if (resp?.success === false) {
        setGroupResolveError(resp.message ?? 'Group resolve failed.')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'ingestionErrors'] })
      setGroupResolveOpen(false)
    },
  })

  const filteredErrors = useCallback(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    switch (filterMode) {
      case 'pending':  return allErrors.filter(e => !e.isResolved)
      case 'resolved': return allErrors.filter(e => e.isResolved)
      case 'today':    return allErrors.filter(e => new Date(e.occurredAt) >= today)
      default:         return allErrors
    }
  }, [allErrors, filterMode])

  const errors = filteredErrors()
  const total    = allErrors.length
  const pending  = allErrors.filter(e => !e.isResolved).length
  const resolved = allErrors.filter(e => e.isResolved).length
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayCount = allErrors.filter(e => new Date(e.occurredAt) >= todayStart).length

  const grouped = groupErrors(errors)

  function openInvestigation(id: number, isResolved: boolean) {
    setDrawerErrorId(id)
    setDrawerIsResolved(isResolved)
    setDrawerOpen(true)
  }

  function openGroupResolve(g: ErrorGroup) {
    const ids = g.instances.filter(i => !i.isResolved).map(i => i.id)
    if (ids.length === 0) return
    setGroupResolveIds(ids)
    setGroupResolveSample((g.sampleMessage || '').slice(0, 200))
    setGroupResolveNotes('')
    setGroupResolveError(null)
    setGroupResolveOpen(true)
  }

  const statCards = [
    { label: 'Total Errors',  value: total,    color: '#3498DB' },
    { label: 'Pending',       value: pending,  color: '#E74C3C' },
    { label: 'Resolved',      value: resolved, color: '#2ECC71' },
    { label: 'Today',         value: todayCount, color: '#F39C12' },
  ]

  const filterBtns: { label: string; mode: FilterMode; icon: string }[] = [
    { label: 'All Errors',    mode: 'all',      icon: 'fas fa-list' },
    { label: 'Pending Only',  mode: 'pending',  icon: 'fas fa-clock' },
    { label: 'Resolved Only', mode: 'resolved', icon: 'fas fa-check-circle' },
    { label: 'Today Only',    mode: 'today',    icon: 'fas fa-calendar-day' },
  ]

  const btnBase: React.CSSProperties = {
    background: 'rgba(255,255,255,.1)', border: '1px solid rgba(46,134,193,.3)',
    color: '#FFFFFF', padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
    transition: 'all .2s',
  }
  const btnActive: React.CSSProperties = {
    background: 'var(--gtek-primary-blue, #2E86C1)', borderColor: '#2E86C1',
  }

  const MasterDetailTemplate = ({ data }: { data: ErrorGroup }) => (
    <DataGrid
      dataSource={data.instances}
      keyExpr="id"
      showBorders
      rowAlternationEnabled
      hoverStateEnabled
      columnAutoWidth
    >
      <Paging defaultPageSize={10} />
      <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50]} showInfo showNavigationButtons />
      <Column dataField="occurredAt" caption="Occurred" dataType="datetime" format="yyyy-MM-dd HH:mm" width={150} defaultSortOrder="desc" />
      <Column dataField="source" caption="Source" width={110} />
      <Column dataField="processingStage" caption="Stage" width={130} />
      <Column dataField="entityId" caption="Entity ID" width={160} />
      <Column dataField="messageId" caption="Message ID" width={250} />
      <Column dataField="retryCount" caption="Retries" width={70} alignment="center" />
      <Column
        dataField="isResolved" caption="Status" width={90}
        cellRender={({ value }) => value ? <ResolvedBadge /> : <PendingBadge />}
      />
      <Column
        caption="Actions" width={110} allowSorting={false} allowFiltering={false}
        cellRender={({ data: row }) => (
          <button
            className="btn btn-sm"
            style={{ background: 'linear-gradient(135deg,#3498DB,#2E86C1)', color: 'white', fontSize: 12, padding: '4px 10px', border: 'none', borderRadius: 6 }}
            onClick={() => openInvestigation(row.id, row.isResolved)}
          >
            <i className="fas fa-eye me-1" />Details
          </button>
        )}
      />
    </DataGrid>
  )

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Header */}
      <div className="mb-4">
        <h1 className="h3 text-white mb-1">
          <i className="fas fa-exclamation-triangle me-2" />Ingestion Errors
        </h1>
        <p className="text-muted mb-0" style={{ fontSize: 14 }}>
          View and manage processing errors from the ingestion service.
        </p>
      </div>

      {/* Stats cards */}
      <div className="row g-3 mb-4">
        {statCards.map((c) => (
          <div key={c.label} className="col-6 col-md-3">
            <div
              className="text-center p-3 rounded"
              style={{ background: 'linear-gradient(135deg,#1E293B,#334155)', border: '1px solid rgba(46,134,193,.3)', transition: 'all .3s' }}
            >
              <div style={{ fontSize: '2.2rem', fontWeight: 700, color: c.color, marginBottom: 4 }}>
                {isFetching ? '—' : c.value.toLocaleString()}
              </div>
              <div style={{ color: '#BDC3C7', fontSize: 13 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter + View buttons */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        {filterBtns.map((b) => (
          <button
            key={b.mode}
            style={{ ...btnBase, ...(filterMode === b.mode ? btnActive : {}) }}
            onClick={() => setFilterMode(b.mode)}
          >
            <i className={`${b.icon} me-1`} />{b.label}
          </button>
        ))}
        <span className="ms-auto" style={{ color: '#BDC3C7', fontSize: 13 }}>View:</span>
        {(['grouped', 'flat'] as ViewMode[]).map((v) => (
          <button
            key={v}
            style={{ ...btnBase, ...(viewMode === v ? btnActive : {}) }}
            onClick={() => setViewMode(v)}
          >
            <i className={`fas fa-${v === 'grouped' ? 'layer-group' : 'bars'} me-1`} />
            {v === 'grouped' ? 'Grouped' : 'Flat'}
          </button>
        ))}
        <button
          style={{ ...btnBase }}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <i className={`fas fa-sync-alt me-1 ${isFetching ? 'fa-spin' : ''}`} />Refresh
        </button>
      </div>

      {/* Operation error banner (unresolve failures) */}
      {operationError && (
        <div
          className="d-flex align-items-center justify-content-between mb-3"
          style={{ background: 'rgba(231,76,60,.15)', border: '1px solid rgba(231,76,60,.4)', borderRadius: 8, padding: '10px 16px', color: '#F87171', fontSize: 13 }}
        >
          <span><i className="fas fa-exclamation-circle me-2" />{operationError}</span>
          <button
            style={{ background: 'transparent', border: 'none', color: '#F87171', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}
            onClick={() => setOperationError(null)}
          >×</button>
        </div>
      )}

      {/* Grid card */}
      <div
        className="rounded p-3"
        style={{ background: '#1E293B', border: '1px solid rgba(46,134,193,.2)', boxShadow: '0 4px 16px rgba(0,0,0,.5)' }}
      >
        {viewMode === 'grouped' ? (
          <DataGrid
            dataSource={grouped}
            keyExpr="groupKey"
            showBorders
            showRowLines
            rowAlternationEnabled
            hoverStateEnabled
            wordWrapEnabled
            allowColumnResizing
            columnResizingMode="widget"
            width="100%"
          >
            <FilterRow visible />
            <SearchPanel visible width={240} placeholder="Search groups..." />
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50, 100]} showInfo />
            <MasterDetail enabled component={MasterDetailTemplate} />
            <Column
              dataField="errorType" caption="Type" width={160}
              cellRender={({ value }) => <TypeBadge v={value || '—'} />}
            />
            <Column
              dataField="sampleMessage" caption="Sample Error Message" width={320}
              cellRender={({ value }) => (
                <span style={{ color: '#E74C3C' }}>{(value || '').length > 120 ? (value || '').substring(0, 120) + '…' : value}</span>
              )}
            />
            <Column
              dataField="count" caption="Count" width={90} alignment="center" defaultSortOrder="desc"
              cellRender={({ value }) => <span style={{ color: '#E74C3C', fontWeight: 700, fontSize: 14 }}>{value}</span>}
            />
            <Column
              caption="Status" width={160} alignment="center" allowSorting={false}
              cellRender={({ data: g }) => (
                <span className="d-flex gap-1 justify-content-center flex-wrap">
                  {g.openCount > 0 && <PendingBadge />}
                  {g.resolvedCount > 0 && <ResolvedBadge />}
                  {g.openCount > 0 && <small style={{ color: '#94A3B8', fontSize: 10 }}>{g.openCount} open</small>}
                  {g.resolvedCount > 0 && <small style={{ color: '#94A3B8', fontSize: 10 }}>{g.resolvedCount} resolved</small>}
                </span>
              )}
            />
            <Column dataField="sources" caption="Sources" width={140} />
            <Column dataField="processingStages" caption="Stages" width={140} />
            <Column
              caption="Trend (24h)" width={110} allowSorting={false} allowFiltering={false}
              cellRender={({ data: g }: { data: ErrorGroup }) => sparkline24h(g.instances)}
            />
            <Column dataField="firstSeen" caption="First Seen" dataType="datetime" format="yyyy-MM-dd HH:mm" width={140} />
            <Column dataField="lastSeen" caption="Last Seen" dataType="datetime" format="yyyy-MM-dd HH:mm" width={140} />
            <Column
              caption="Actions" width={150} allowSorting={false} allowFiltering={false}
              cellRender={({ data: g }) => g.openCount > 0 ? (
                <button
                  style={{ background: 'linear-gradient(135deg,#2ECC71,#27AE60)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                  onClick={(ev) => { ev.stopPropagation(); openGroupResolve(g) }}
                >
                  <i className="fas fa-check me-1" />Resolve {g.openCount}
                </button>
              ) : <span style={{ color: '#94A3B8' }}>—</span>}
            />
            <Summary>
              <TotalItem column="groupKey" summaryType="count" displayFormat="{0} groups" />
              <TotalItem column="count" summaryType="sum" displayFormat="{0} total errors" />
            </Summary>
          </DataGrid>
        ) : (
          <DataGrid
            dataSource={errors}
            keyExpr="id"
            showBorders
            showRowLines
            showColumnLines
            rowAlternationEnabled
            hoverStateEnabled
            wordWrapEnabled
            allowColumnResizing
            columnResizingMode="widget"
            width="100%"
          >
            <FilterRow visible />
            <SearchPanel visible width={240} placeholder="Search errors..." />
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50, 100]} showInfo />
            <Column dataField="occurredAt" caption="Occurred" width={150} dataType="datetime" format="yyyy-MM-dd HH:mm" defaultSortOrder="desc" />
            <Column dataField="source" caption="Source" width={120} cellRender={({ value }) => value ? <SourceBadge v={value} /> : null} />
            <Column dataField="errorType" caption="Type" width={150} cellRender={({ value }) => value ? <TypeBadge v={value} /> : null} />
            <Column dataField="processingStage" caption="Stage" width={130} cellRender={({ value }) => value ? <StageBadge v={value} /> : null} />
            <Column
              dataField="errorMessage" caption="Error Message" minWidth={200}
              cellRender={({ value }) => (
                <span style={{ color: '#E74C3C' }}>{(value || '').length > 100 ? (value || '').substring(0, 100) + '…' : value}</span>
              )}
            />
            <Column dataField="retryCount" caption="Retries" width={70} alignment="center" cellRender={({ value }) => <RetryBadge count={value || 0} />} />
            <Column dataField="isResolved" caption="Status" width={90} cellRender={({ value }) => value ? <ResolvedBadge /> : <PendingBadge />} />
            <Column
              dataField="resolvedBy" caption="Resolved By" width={120}
              cellRender={({ value }) => value
                ? <span style={{ color: '#2ECC71' }}>{value}</span>
                : <span style={{ color: '#95A5A6', fontStyle: 'italic' }}>—</span>}
            />
            <Column
              dataField="resolvedAt" caption="Resolved At" dataType="datetime" format="yyyy-MM-dd HH:mm" width={150}
              cellRender={({ value }) => value
                ? <span style={{ color: '#2ECC71' }}>{value}</span>
                : <span style={{ color: '#95A5A6', fontStyle: 'italic' }}>—</span>}
            />
            <Column
              caption="Actions" width={170} allowSorting={false} allowFiltering={false}
              cellRender={({ data: row }) => (
                <div className="d-flex gap-1">
                  <button
                    style={{ background: 'linear-gradient(135deg,#3498DB,#2E86C1)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                    title="View Details"
                    onClick={() => openInvestigation(row.id, row.isResolved)}
                  >
                    <i className="fas fa-eye" />
                  </button>
                  {!row.isResolved ? (
                    <button
                      style={{ background: 'linear-gradient(135deg,#2ECC71,#27AE60)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                      onClick={() => { setResolveErrorId(row.id); setResolveText(''); setResolveModalError(null); setResolveModalOpen(true) }}
                    >
                      <i className="fas fa-check me-1" />Resolve
                    </button>
                  ) : (
                    <button
                      style={{ background: 'linear-gradient(135deg,#E74C3C,#C0392B)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                      onClick={() => { if (confirm('Reopen this error?')) unresolveMutation.mutate(row.id) }}
                    >
                      <i className="fas fa-undo me-1" />Reopen
                    </button>
                  )}
                </div>
              )}
            />
            <Summary>
              <TotalItem column="id" summaryType="count" displayFormat="{0} errors" />
            </Summary>
          </DataGrid>
        )}
      </div>

      {/* ── Investigation Drawer ─────────────────────────────── */}
      {drawerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1040, background: 'rgba(0,0,0,.5)' }}
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: 720, zIndex: 1045,
          background: '#0F172A', color: '#FFFFFF', boxShadow: '-4px 0 24px rgba(0,0,0,.6)',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .3s ease', overflowY: 'auto',
          borderLeft: '1px solid rgba(46,134,193,.3)',
        }}
      >
        {/* Drawer header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(46,134,193,.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h5 style={{ margin: 0 }}><i className="fas fa-search me-2" />Investigation</h5>
            <small style={{ color: '#94A3B8' }}>Error #{drawerErrorId}</small>
          </div>
          <div className="d-flex gap-2 align-items-center">
            {!drawerIsResolved && investigation?.error && (
              <button
                style={{ background: 'linear-gradient(135deg,#2ECC71,#27AE60)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                onClick={() => { setResolveErrorId(drawerErrorId); setResolveText(''); setResolveModalError(null); setDrawerOpen(false); setResolveModalOpen(true) }}
              >
                <i className="fas fa-check me-1" />Resolve
              </button>
            )}
            {drawerIsResolved && investigation?.error && (
              <button
                style={{ background: 'linear-gradient(135deg,#E74C3C,#C0392B)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                onClick={() => { if (confirm('Reopen this error?')) unresolveMutation.mutate(drawerErrorId!) }}
              >
                <i className="fas fa-undo me-1" />Reopen
              </button>
            )}
            <button
              style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer' }}
              onClick={() => setDrawerOpen(false)}
            >×</button>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          {investigationLoading && (
            <div className="text-center py-5">
              <i className="fas fa-spinner fa-spin me-2" />Loading…
            </div>
          )}

          {investigation && !investigationLoading && (() => {
            const e = investigation.error
            const x = investigation.extracted || {}
            return (
              <>
                {/* Section 1: Error */}
                <h6 style={{ color: '#93C5FD', fontWeight: 700, textTransform: 'uppercase', fontSize: 12, letterSpacing: '0.5px', borderBottom: '1px solid rgba(46,134,193,.3)', paddingBottom: 6, marginBottom: 12 }}>Error</h6>
                <div className="row mb-2">
                  <div className="col-md-4"><div style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Type</div><TypeBadge v={e.errorType || '—'} /></div>
                  <div className="col-md-4"><div style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Source</div><SourceBadge v={e.source || '—'} /></div>
                  <div className="col-md-4"><div style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Stage</div><StageBadge v={e.processingStage || '—'} /></div>
                </div>
                <div className="row mb-2">
                  <div className="col-md-6"><div style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4 }}>Occurred</div><span>{fmtDate(e.occurredAt)}</span></div>
                  <div className="col-md-3"><div style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4 }}>Retries</div><RetryBadge count={e.retryCount || 0} /></div>
                  <div className="col-md-3"><div style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4 }}>Status</div>{e.isResolved ? <ResolvedBadge /> : <PendingBadge />}</div>
                </div>

                <div className="mb-2">
                  <div style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4 }}>Error Message</div>
                  <pre style={{ background: '#0B1224', color: '#E5E7EB', border: '1px solid rgba(46,134,193,.3)', borderRadius: 6, padding: 10, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflowY: 'auto', margin: 0 }}>{e.errorMessage || 'No error message'}</pre>
                </div>
                <div className="mb-2">
                  <div style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4 }}>Stack Trace</div>
                  <pre style={{ background: '#0B1224', color: '#E5E7EB', border: '1px solid rgba(46,134,193,.3)', borderRadius: 6, padding: 10, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 240, overflowY: 'auto', margin: 0 }}>{e.stackTrace || 'No stack trace available'}</pre>
                </div>
                <div className="mb-3">
                  <div style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4 }}>Payload</div>
                  <pre style={{ background: '#0B1224', color: '#3498DB', border: '1px solid rgba(46,134,193,.3)', borderRadius: 6, padding: 10, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 240, overflowY: 'auto', margin: 0 }}>{prettyJson(e.payloadContent)}</pre>
                </div>

                {e.isResolved && e.resolution && (
                  <div className="mb-3">
                    <div style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4 }}>Resolution</div>
                    <div className="row mb-1">
                      <div className="col-md-6"><small style={{ color: '#94A3B8' }}>By</small> <span style={{ color: '#2ECC71' }}>{e.resolvedBy || 'Unknown'}</span></div>
                      <div className="col-md-6"><small style={{ color: '#94A3B8' }}>At</small> <span style={{ color: '#2ECC71' }}>{fmtDate(e.resolvedAt)}</span></div>
                    </div>
                    <pre style={{ background: '#0B1224', color: '#2ECC71', border: '1px solid rgba(46,134,193,.3)', borderRadius: 6, padding: 10, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflowY: 'auto', margin: 0 }}>{e.resolution}</pre>
                  </div>
                )}

                {/* Section 2: Linked Transactions */}
                <h6 style={{ color: '#93C5FD', fontWeight: 700, textTransform: 'uppercase', fontSize: 12, letterSpacing: '0.5px', borderBottom: '1px solid rgba(46,134,193,.3)', paddingBottom: 6, marginBottom: 12, marginTop: 24 }}>Linked Transactions</h6>
                <div className="mb-2">
                  {[['Correlation', x.correlationId], ['Message ID', x.messageId], ['Execution ID', x.executionId], ['Integration', x.integrationName], ['Direction', x.direction], ['Partner', x.partner], ['Source', x.sourceSystem], ['Target', x.targetSystem], ['Doc#', x.documentNumber]].map(([label, val]) => pill(label as string, val as string))}
                  {x.parseFailed && <div style={{ color: '#F39C12', fontSize: 12, marginTop: 4 }}><i className="fas fa-exclamation-triangle me-1" />{x.parseNote || 'Could not parse payload.'}</div>}
                  {!x.correlationId && !x.messageId && !x.executionId && <span style={{ color: '#94A3B8' }}>No fields could be extracted from the payload.</span>}
                </div>

                {!x.correlationId ? (
                  <p style={{ color: '#94A3B8', fontSize: 13 }}>No correlation key — cannot search for sibling transactions.</p>
                ) : investigation.siblings.length === 0 ? (
                  <p style={{ color: '#94A3B8', fontSize: 13 }}>No transactions found for correlation "{x.correlationId}". The whole flow may have failed before reaching the DB.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm" style={{ color: '#FFFFFF', fontSize: 12 }}>
                      <thead style={{ color: '#BDC3C7' }}>
                        <tr><th>#</th><th>Step</th><th>Direction</th><th>System</th><th>Status</th><th>Doc#</th><th>Started</th></tr>
                      </thead>
                      <tbody>
                        {investigation.siblings.map((s, i) => (
                          <tr key={i} style={{ background: s.isFailingRecord ? 'rgba(231,76,60,.18)' : undefined }}>
                            <td>{i + 1}</td>
                            <td>{s.integrationName || '—'}</td>
                            <td>{s.direction || '—'}</td>
                            <td>{s.sourceSystem || s.targetSystem || '—'}</td>
                            <td>{s.status === 'SUCCESS' ? <ResolvedBadge /> : <PendingBadge />}</td>
                            <td>{s.documentNumber || '—'}</td>
                            <td>{fmtDate(s.startTimestamp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {investigation.ingestedAfterAll && (
                  <div style={{ color: '#F39C12', fontSize: 12 }}>
                    <i className="fas fa-info-circle me-1" />The failing message was ingested into the DB on a later retry.
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* ── Resolve Modal ────────────────────────────────────── */}
      {resolveModalOpen && (
        <div className="modal fade show d-block" style={{ zIndex: 1060 }}>
          <div className="modal-dialog">
            <div className="modal-content" style={{ background: '#1E293B', border: '1px solid rgba(46,134,193,.3)', color: '#FFFFFF' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid rgba(46,134,193,.3)' }}>
                <h5 className="modal-title"><i className="fas fa-check-circle me-2" />Resolve Error</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setResolveModalOpen(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label" style={{ color: '#BDC3C7' }}>Resolution Notes</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    placeholder="Describe how the error was resolved..."
                    value={resolveText}
                    onChange={(e) => setResolveText(e.target.value)}
                    style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(46,134,193,.3)', color: '#FFFFFF' }}
                  />
                </div>
                {resolveModalError && (
                  <div style={{ background: 'rgba(231,76,60,.15)', border: '1px solid rgba(231,76,60,.4)', borderRadius: 6, padding: '8px 12px', color: '#F87171', fontSize: 13 }}>
                    <i className="fas fa-exclamation-circle me-2" />{resolveModalError}
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid rgba(46,134,193,.3)' }}>
                <button className="btn btn-secondary" onClick={() => setResolveModalOpen(false)}>Cancel</button>
                <button
                  className="btn"
                  style={{ background: 'linear-gradient(135deg,#2ECC71,#27AE60)', color: 'white', border: 'none' }}
                  disabled={resolveMutation.isPending}
                  onClick={() => resolveErrorId !== null && resolveMutation.mutate({ errorId: resolveErrorId, resolution: resolveText })}
                >
                  <i className="fas fa-check me-1" />Mark as Resolved
                </button>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" style={{ zIndex: 1055 }} onClick={() => setResolveModalOpen(false)} />
        </div>
      )}

      {/* ── Group Resolve Modal ──────────────────────────────── */}
      {groupResolveOpen && (
        <div className="modal fade show d-block" style={{ zIndex: 1060 }}>
          <div className="modal-dialog">
            <div className="modal-content" style={{ background: '#1E293B', border: '1px solid rgba(46,134,193,.3)', color: '#FFFFFF' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid rgba(46,134,193,.3)' }}>
                <h5 className="modal-title"><i className="fas fa-layer-group me-2" />Resolve Group</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setGroupResolveOpen(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-2" style={{ fontSize: 13, color: '#475569' }}>
                  Marking <strong>{groupResolveIds.length}</strong> open instance(s) of this error class as resolved.
                </div>
                <div className="mb-2" style={{ fontSize: 12, color: '#64748B' }}>
                  Sample message: <em>{groupResolveSample}{groupResolveSample.length === 200 ? '…' : ''}</em>
                </div>
                <div className="mb-3">
                  <label className="form-label" style={{ color: '#BDC3C7' }}>Resolution Notes</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    placeholder="Describe the root cause and the fix applied..."
                    value={groupResolveNotes}
                    onChange={(e) => setGroupResolveNotes(e.target.value)}
                    style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(46,134,193,.3)', color: '#FFFFFF' }}
                  />
                </div>
                {groupResolveError && (
                  <div style={{ background: 'rgba(231,76,60,.15)', border: '1px solid rgba(231,76,60,.4)', borderRadius: 6, padding: '8px 12px', color: '#F87171', fontSize: 13 }}>
                    <i className="fas fa-exclamation-circle me-2" />{groupResolveError}
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid rgba(46,134,193,.3)' }}>
                <button className="btn btn-secondary" onClick={() => setGroupResolveOpen(false)}>Cancel</button>
                <button
                  className="btn"
                  style={{ background: 'linear-gradient(135deg,#2ECC71,#27AE60)', color: 'white', border: 'none' }}
                  disabled={resolveGroupMutation.isPending}
                  onClick={() => resolveGroupMutation.mutate({ errorIds: groupResolveIds, resolution: groupResolveNotes })}
                >
                  <i className="fas fa-check me-1" />Resolve All Open
                </button>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" style={{ zIndex: 1055 }} onClick={() => setGroupResolveOpen(false)} />
        </div>
      )}

    </div>
  )
}
