import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import DataGrid, { Column, Paging, Pager, SearchPanel } from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'

interface MonitorHealth {
  completeness: { total: number; configured: number; needsAttention: number; percentage: number }
  errors: { last24h: number }
  pipeline: { lastPollTime: string | null; lastPollSuccess: boolean; lastRecordCount: number; lastError: string | null }
}

interface PendingPublish { id: number; executionId: string; errorMessage: string; retryCount: number; status: string; createdAt: string }

interface IncompleteIntegration {
  integrationFlowId: number
  integrationName: string
  missingSegment: boolean
  missingProcess: boolean
  missingSource: boolean
  missingTarget: boolean
  missingDirection: boolean
}

interface IngestionError {
  errorType: string
  errorMessage: string
  source: string
  occurredAt: string
  isResolved: boolean
}

const CARD = { background: '#1E293B', border: '1px solid rgba(46,134,193,.2)', borderRadius: 12, padding: 24, marginBottom: 20 }

const BADGE_STYLE: React.CSSProperties = { fontSize: 11, padding: '2px 7px', borderRadius: 4, display: 'inline-block', marginRight: 3 }

function MissingBadges({ row }: { row: IncompleteIntegration }) {
  const missing: string[] = []
  if (row.missingSegment) missing.push('Segment')
  if (row.missingProcess) missing.push('Process')
  if (row.missingSource) missing.push('Source')
  if (row.missingTarget) missing.push('Target')
  if (row.missingDirection) missing.push('Direction')
  if (missing.length === 0) return <span style={{ color: '#10B981', fontSize: 12 }}>None</span>
  return (
    <>
      {missing.map(m => (
        <span key={m} style={{ ...BADGE_STYLE, background: 'rgba(239,68,68,.2)', color: '#EF4444', border: '1px solid rgba(239,68,68,.3)' }}>{m}</span>
      ))}
    </>
  )
}

export default function BoomiMonitorPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: health, refetch } = useQuery<MonitorHealth>({
    queryKey: ['boomi', 'monitorHealth'],
    queryFn: () => apiClient.get('/Admin/GetMonitoringHealth').then(r => r.data?.success ? r.data : null),
  })

  const { data: incomplete } = useQuery<IncompleteIntegration[]>({
    queryKey: ['boomi', 'incomplete'],
    queryFn: () => apiClient.get('/Admin/GetIncompleteIntegrations').then(r => r.data?.integrations ?? []),
  })

  const { data: ingestionErrors } = useQuery<IngestionError[]>({
    queryKey: ['boomi', 'ingestionErrors'],
    queryFn: () => apiClient.get('/Admin/GetRecentIngestionErrors').then(r => r.data ?? []),
  })

  const { data: pending } = useQuery<PendingPublish[]>({
    queryKey: ['boomi', 'pendingPublishes'],
    queryFn: () => apiClient.get('/Admin/GetPendingPublishes').then(r => r.data ?? []),
  })

  const retryMut = useMutation({
    mutationFn: (id: number) => apiClient.post('/Admin/RetryPendingPublish', { id }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boomi', 'pendingPublishes'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.post('/Admin/DeletePendingPublish', { id }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boomi', 'pendingPublishes'] }),
  })

  const pct = health?.completeness.percentage ?? 0

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>
      <div className="mb-3">
        <button className="btn btn-link p-0" style={{ color: '#94A3B8', fontSize: 14 }} onClick={() => navigate('/orchestration/boomi')}>
          <i className="fas fa-arrow-left me-1" />Back to Boomi Onboarding
        </button>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 text-white mb-0"><i className="fas fa-heartbeat me-2" style={{ color: '#EF4444' }} />Monitor Health</h1>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => refetch()}>
          <i className="fas fa-sync-alt me-1" />Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Integrations', value: health?.completeness.total, color: '#3B82F6' },
          { label: 'Fully Configured', value: health?.completeness.configured, color: '#10B981' },
          { label: 'Needs Attention', value: health?.completeness.needsAttention, color: '#F59E0B' },
          { label: 'Errors (24h)', value: health?.errors.last24h, color: '#EF4444' },
        ].map(s => (
          <div key={s.label} className="col-6 col-md-3">
            <div style={CARD}>
              <div style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 700 }}>{s.value ?? '-'}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-4">
        {/* Left column */}
        <div className="col-lg-8">
          {/* Completeness */}
          <div style={CARD}>
            <h5 className="text-white mb-3"><i className="fas fa-tasks me-2" style={{ color: '#10B981' }} />Mapping Completeness</h5>
            <div style={{ background: 'rgba(15,23,42,.8)', borderRadius: 8, height: 28, overflow: 'hidden', border: '1px solid rgba(46,134,193,.2)', marginBottom: 10 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(135deg,#10B981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600, transition: 'width .5s', borderRadius: 8 }}>
                {pct > 8 ? `${pct}%` : ''}
              </div>
            </div>
            <p style={{ color: '#CBD5E1', fontSize: 13, marginBottom: 16 }}>
              {health ? `${health.completeness.configured} of ${health.completeness.total} fully configured (${pct}%)` : 'Loading...'}
            </p>
            {incomplete && incomplete.length > 0 ? (
              <DataGrid dataSource={incomplete} keyExpr="integrationFlowId" showBorders={false} showRowLines={true} columnAutoWidth={true} height={220}>
                <SearchPanel visible={true} placeholder="Search integrations..." width={250} />
                <Column dataField="integrationName" caption="Integration Name" minWidth={200} />
                <Column caption="Missing Fields" minWidth={220} cellRender={({ data }) => <MissingBadges row={data as IncompleteIntegration} />} />
                <Column caption="Actions" width={130} alignment="center" cellRender={({ data }) => (
                  <Link
                    to={`/orchestration/boomi/mappings?editId=${(data as IncompleteIntegration).integrationFlowId}`}
                    className="btn btn-sm btn-outline-warning"
                    style={{ padding: '2px 8px', fontSize: 12 }}
                  >
                    <i className="fas fa-edit me-1" />Edit Mapping
                  </Link>
                )} />
                <Paging pageSize={10} />
                <Pager showInfo={true} />
              </DataGrid>
            ) : (
              <p style={{ color: '#94A3B8', textAlign: 'center', padding: 20, margin: 0 }}>All integrations are fully configured!</p>
            )}
          </div>

          {/* Recent Ingestion Errors */}
          <div style={CARD}>
            <h5 className="text-white mb-1"><i className="fas fa-exclamation-triangle me-2" style={{ color: '#EF4444' }} />Recent Ingestion Errors</h5>
            <p style={{ color: '#94A3B8', fontSize: 12, marginBottom: 16 }}>Errors encountered during data ingestion</p>
            {ingestionErrors && ingestionErrors.length > 0 ? (
              <DataGrid
                dataSource={ingestionErrors}
                showBorders={false}
                showRowLines={true}
                columnAutoWidth={true}
                height={240}
              >
                <Column dataField="errorType" caption="Type" width={130} />
                <Column dataField="errorMessage" caption="Message" minWidth={200} />
                <Column dataField="source" caption="Source" width={140} />
                <Column dataField="occurredAt" caption="Occurred At" dataType="datetime" format="yyyy-MM-dd HH:mm" width={150} defaultSortOrder="desc" />
                <Column dataField="isResolved" caption="Status" width={100} alignment="center" cellRender={({ value }) => (
                  <span
                    className={value ? 'badge bg-success' : 'badge bg-danger'}
                    style={{ fontSize: 11 }}
                  >
                    {value ? 'Resolved' : 'Open'}
                  </span>
                )} />
                <Paging pageSize={10} />
                <Pager showPageSizeSelector={true} allowedPageSizes={[10, 25]} showInfo={true} />
              </DataGrid>
            ) : (
              <p style={{ color: '#94A3B8', textAlign: 'center', padding: 20, margin: 0 }}>No recent ingestion errors.</p>
            )}
          </div>

          {/* Pending Publish Queue */}
          <div style={CARD}>
            <h5 className="text-white mb-1"><i className="fas fa-paper-plane me-2" style={{ color: '#F59E0B' }} />Pending Publish Queue</h5>
            <p style={{ color: '#94A3B8', fontSize: 12, marginBottom: 16 }}>collector → Solace failures awaiting retry</p>
            {pending && pending.length > 0 ? (
              <DataGrid
                dataSource={pending}
                keyExpr="id"
                showBorders={false}
                showRowLines={true}
                columnAutoWidth={true}
                height={260}
              >
                <Column dataField="executionId" caption="Execution ID" width={200} />
                <Column dataField="errorMessage" caption="Error" minWidth={200} />
                <Column dataField="retryCount" caption="Retries" width={70} alignment="center" />
                <Column dataField="status" caption="Status" width={100} cellRender={({ value }) => <span className={`badge ${value === 'Failed' ? 'bg-danger' : 'bg-success'}`} style={{ fontSize: 11 }}>{value}</span>} />
                <Column dataField="createdAt" caption="Created" dataType="datetime" format="yyyy-MM-dd HH:mm" width={140} defaultSortOrder="desc" />
                <Column caption="" width={90} alignment="center" cellRender={({ data }) => (
                  <div className="d-flex gap-1">
                    <button className="btn btn-sm btn-outline-primary" style={{ padding: '2px 6px' }} onClick={() => retryMut.mutate((data as PendingPublish).id)} title="Retry"><i className="fas fa-redo" /></button>
                    <button className="btn btn-sm btn-outline-danger" style={{ padding: '2px 6px' }} onClick={() => deleteMut.mutate((data as PendingPublish).id)} title="Delete"><i className="fas fa-trash" /></button>
                  </div>
                )} />
                <Paging pageSize={10} />
                <Pager showPageSizeSelector={true} allowedPageSizes={[10, 25]} showInfo={true} />
              </DataGrid>
            ) : (
              <p style={{ color: '#94A3B8', textAlign: 'center', padding: 20, margin: 0 }}>Queue is empty — no failed publishes.</p>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="col-lg-4">
          {/* Pipeline Health */}
          <div style={CARD}>
            <h5 className="text-white mb-3"><i className="fas fa-network-wired me-2" style={{ color: '#3B82F6' }} />Pipeline Health</h5>
            {health?.pipeline.lastPollTime ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#CBD5E1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: health.pipeline.lastPollSuccess ? '#10B981' : '#EF4444' }}>
                  <i className={`fas ${health.pipeline.lastPollSuccess ? 'fa-check-circle' : 'fa-times-circle'}`} />
                  Last Poll: {new Date(health.pipeline.lastPollTime).toLocaleString()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fas fa-database text-primary" />
                  Records: {health.pipeline.lastRecordCount}
                </div>
                {health.pipeline.lastError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#EF4444' }}>
                    <i className="fas fa-exclamation-circle" />
                    {health.pipeline.lastError}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: '#94A3B8', fontSize: 13, margin: 0 }}>No polling data available yet.</p>
            )}
          </div>

          {/* Quick Actions */}
          <div style={CARD}>
            <h5 className="text-white mb-3"><i className="fas fa-bolt me-2" style={{ color: '#F59E0B' }} />Quick Actions</h5>
            <div className="d-grid gap-2">
              <Link to="/orchestration/boomi/mappings" className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', color: '#fff', border: 'none', fontSize: 13, padding: 10 }}>
                <i className="fas fa-sitemap me-1" /> Go to Integration Mappings
              </Link>
              <Link to="/orchestration/boomi/discovery" className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#06B6D4,#0891B2)', color: '#fff', border: 'none', fontSize: 13, padding: 10 }}>
                <i className="fas fa-satellite-dish me-1" /> Discover More Processes
              </Link>
              <Link to="/orchestration/boomi/environments" className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#8B5CF6,#7C3AED)', color: '#fff', border: 'none', fontSize: 13, padding: 10 }}>
                <i className="fas fa-server me-1" /> Manage Environments
              </Link>
              <Link to="/admin/error-monitoring" className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#EF4444,#DC2626)', color: '#fff', border: 'none', fontSize: 13, padding: 10 }}>
                <i className="fas fa-bug me-1" /> Full Error Monitoring
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
