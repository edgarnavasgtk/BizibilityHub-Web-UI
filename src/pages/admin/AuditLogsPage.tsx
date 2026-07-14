import { useQuery } from '@tanstack/react-query'
import DataGrid, { Column, FilterRow, HeaderFilter, SearchPanel, Paging, Pager } from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'

interface AuditStats { total: number; login: number; query: number; admin: number }
interface AuditLog {
  userEmail: string
  actionType: string
  action: string
  details: string
  ipAddress: string
  createdAt: string
}

const ACTION_COLORS: Record<string, string> = {
  Login:   'success',
  Logout:  'danger',
  Query:   'primary',
  Admin:   'warning',
}

function TypeBadge({ value }: { value: string }) {
  const c = ACTION_COLORS[value] ?? 'secondary'
  return <span className={`badge bg-${c}`} style={{ fontSize: 11 }}>{value}</span>
}

function AvatarCell({ value }: { value: string }) {
  const initials = (value ?? '?').substring(0, 2).toUpperCase()
  return (
    <div className="d-flex align-items-center gap-2">
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: 'var(--gtek-primary-blue)',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>{initials}</div>
      <span style={{ fontSize: 12 }}>{value}</span>
    </div>
  )
}

const statCards = [
  { key: 'total', label: 'Total Events',   icon: 'fas fa-list',          color: '#3b82f6' },
  { key: 'login', label: 'Login Events',   icon: 'fas fa-sign-in-alt',   color: '#10b981' },
  { key: 'query', label: 'Query Events',   icon: 'fas fa-search',        color: '#8b5cf6' },
  { key: 'admin', label: 'Admin Actions',  icon: 'fas fa-cog',           color: '#f59e0b' },
] as const

export default function AuditLogsPage() {
  const {
    data: stats,
    isError: statsError,
    error: statsErrorObj,
    refetch: refetchStats,
  } = useQuery<AuditStats>({
    queryKey: ['admin', 'auditStats'],
    queryFn: () => apiClient.get<AuditStats>('/Admin/GetAuditLogStats').then(r => r.data),
  })

  const {
    data: logs,
    isFetching,
    isError: logsError,
    error: logsErrorObj,
    refetch: refetchLogs,
  } = useQuery<AuditLog[]>({
    queryKey: ['admin', 'auditLogs'],
    queryFn: () => apiClient.get<AuditLog[]>('/Admin/GetAuditLogsForGrid').then(r => r.data),
  })

  const hasError = statsError || logsError
  const errorMessage = (() => {
    const err = statsError ? statsErrorObj : logsErrorObj
    if (!err) return 'An unexpected error occurred.'
    if (err instanceof Error) {
      const axiosErr = err as unknown as { response?: { status?: number; data?: { message?: string } } }
      if (axiosErr.response) {
        const status = axiosErr.response.status ?? ''
        const msg = axiosErr.response.data?.message ?? err.message
        return status ? `HTTP ${status} — ${msg}` : msg
      }
      return err.message
    }
    return String(err)
  })()

  function handleRetry() {
    if (statsError) void refetchStats()
    if (logsError) void refetchLogs()
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      <div className="mb-4">
        <h1 className="h3 text-white mb-1">
          <i className="fas fa-history me-2 text-primary" />Audit Logs
        </h1>
        <p className="text-muted mb-0" style={{ fontSize: 14 }}>System activity and user action tracking</p>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {statCards.map((c) => (
          <div key={c.key} className="col-6 col-md-3">
            <div className="text-center p-3 rounded" style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)' }}>
              <i className={c.icon} style={{ fontSize: 24, color: c.color }} />
              <div className="text-white fw-bold mt-2" style={{ fontSize: 26 }}>{stats?.[c.key] ?? 0}</div>
              <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {hasError && (
        <div
          className="d-flex align-items-center justify-content-between mb-3 px-3 py-2 rounded"
          style={{ background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.45)', color: '#fca5a5' }}
        >
          <div className="d-flex align-items-center gap-2" style={{ fontSize: 13 }}>
            <i className="fas fa-exclamation-triangle" style={{ color: '#f87171' }} />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: 'rgba(220,38,38,.25)', border: '1px solid rgba(220,38,38,.5)', color: '#fca5a5', fontSize: 12 }}
            onClick={handleRetry}
          >
            <i className="fas fa-redo me-1" />Retry
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="rounded overflow-hidden" style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)' }}>
        <DataGrid
          dataSource={logs ?? []}
          showBorders={false}
          showRowLines={true}
          rowAlternationEnabled={true}
          columnAutoWidth={true}
          allowColumnResizing={true}
          height={580}
          noDataText={isFetching ? 'Loading…' : 'No audit logs found'}
        >
          <FilterRow visible={true} />
          <HeaderFilter visible={true} />
          <SearchPanel visible={true} placeholder="Search logs..." width={240} />
          <Paging pageSize={25} />
          <Pager showPageSizeSelector={true} allowedPageSizes={[25, 50, 100]} showInfo={true} />

          <Column dataField="userEmail"  caption="User"      minWidth={200} cellRender={({ value }) => <AvatarCell value={value} />} />
          <Column dataField="actionType" caption="Type"      width={120}    cellRender={({ value }) => <TypeBadge value={value} />} />
          <Column dataField="action"     caption="Action"    minWidth={180} />
          <Column dataField="details"    caption="Details"   minWidth={300} />
          <Column dataField="ipAddress"  caption="IP Address" width={140}   cellRender={({ value }) => <code style={{ fontSize: 11 }}>{value}</code>} />
          <Column
            dataField="createdAt"
            caption="Date / Time"
            dataType="datetime"
            format="MMM dd, yyyy HH:mm"
            width={180}
            defaultSortOrder="desc"
          />
        </DataGrid>
      </div>
    </div>
  )
}
