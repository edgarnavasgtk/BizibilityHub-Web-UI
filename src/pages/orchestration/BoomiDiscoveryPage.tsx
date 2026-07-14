import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import DataGrid, { Column, SearchPanel, FilterRow, Paging, Pager, Selection } from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'

interface BoomiProcess {
  componentId: string
  componentName: string
  environments: string
  deployedDate: string
  active: boolean
  alreadyImported: boolean
  integrationFlowId?: number
  mappingComplete?: boolean
}

interface ResolutionProgress {
  total: number
  cached: number
  bulk: number
  perid: number
  failed: number
  resolving: boolean
}

const CARD = { background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 12, overflow: 'hidden' }

export default function BoomiDiscoveryPage() {
  const navigate = useNavigate()
  const [processes, setProcesses] = useState<BoomiProcess[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [discovered, setDiscovered] = useState(false)
  const [activeTab, setActiveTab] = useState<'ready' | 'existing'>('ready')
  const [resolutionProgress, setResolutionProgress] = useState<ResolutionProgress | null>(null)
  const [unresolvedIds, setUnresolvedIds] = useState<string[]>([])
  const [showUnresolvedPanel, setShowUnresolvedPanel] = useState(false)
  const [showProceed, setShowProceed] = useState(false)

  const ready = processes.filter(p => !p.alreadyImported)
  const existing = processes.filter(p => p.alreadyImported)

  const resolveNames = async (currentProcesses: BoomiProcess[], idsOverride?: string[], initialCached = 0): Promise<BoomiProcess[]> => {
    const ids = idsOverride ?? currentProcesses.filter(p => !p.componentName).map(p => p.componentId)
    if (!ids.length) return currentProcesses

    const BATCH = 100
    setResolutionProgress({ total: ids.length, cached: initialCached, bulk: 0, perid: 0, failed: 0, resolving: true })

    let merged = [...currentProcesses]
    const allFailed: string[] = []

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      try {
        const r = await apiClient.post('/Admin/ResolveBoomiProcessNames', batch)
        const nameMap: Record<string, string> = r.data.names ?? {}
        const cached: number = r.data.stats?.cacheHits ?? 0
        const bulk: number = r.data.stats?.bulkHits ?? 0
        const perIdCount: number = r.data.stats?.perIdHits ?? 0
        const failedBatch: string[] = r.data.failedIds ?? []

        setResolutionProgress(prev => prev ? {
          ...prev,
          cached: prev.cached + cached,
          bulk: prev.bulk + bulk,
          perid: prev.perid + perIdCount,
          failed: prev.failed + failedBatch.length,
        } : prev)

        if (failedBatch.length) allFailed.push(...failedBatch)

        const matchMap: Record<string, { alreadyImported: boolean; integrationFlowId?: number; mappingComplete?: boolean }> = r.data.matches ?? {}
        merged = merged.map(p => {
          const name = nameMap[p.componentId]
          const match = matchMap[p.componentId]
          if (!name && !match) return p
          return {
            ...p,
            ...(name ? { componentName: name } : {}),
            ...(match ? { alreadyImported: match.alreadyImported, integrationFlowId: match.integrationFlowId, mappingComplete: match.mappingComplete } : {}),
          }
        })
      } catch {
        allFailed.push(...batch)
        setResolutionProgress(prev => prev ? { ...prev, failed: prev.failed + batch.length } : prev)
      }
    }

    setResolutionProgress(prev => prev ? { ...prev, resolving: false } : prev)

    if (allFailed.length) {
      setUnresolvedIds(allFailed)
      setShowUnresolvedPanel(true)
    }

    return merged
  }

  const discover = async () => {
    setDiscovering(true)
    setStatusMsg({ text: 'Scanning Boomi environments for deployed processes...', ok: true })
    setUnresolvedIds([])
    setShowUnresolvedPanel(false)
    setShowProceed(false)
    setResolutionProgress(null)
    try {
      const r = await apiClient.post('/Admin/DiscoverBoomiProcesses')
      if (r.data.success) {
        const raw: BoomiProcess[] = r.data.processes ?? []
        setProcesses(raw)
        setDiscovered(true)
        setStatusMsg(null)
        // Auto-select all ready rows 200ms after the grid renders
        setTimeout(() => {
          setSelectedKeys(raw.filter(p => !p.alreadyImported).map(p => p.componentId))
        }, 200)
        // Resolve any processes with empty componentName; seed cached counter from server pre-warm
        const fromCache: number = r.data.stats?.fromCache ?? 0
        const resolved = await resolveNames(raw, undefined, fromCache)
        setProcesses(resolved)
      } else {
        setStatusMsg({ text: `Discovery failed: ${r.data.message}`, ok: false })
      }
    } catch {
      setStatusMsg({ text: 'Request failed.', ok: false })
    } finally {
      setDiscovering(false)
    }
  }

  const importSelected = async () => {
    if (!selectedKeys.length) return
    setImporting(true)
    const toImport = ready.filter(p => selectedKeys.includes(p.componentId)).map(p => ({ componentId: p.componentId, componentName: p.componentName }))
    try {
      const r = await apiClient.post('/Admin/ImportBoomiProcesses', { processes: toImport })
      if (r.data.success) {
        setStatusMsg({ text: r.data.message, ok: true })
        setShowProceed(true)
        await discover()
      } else {
        setStatusMsg({ text: `Import failed: ${r.data.message}`, ok: false })
      }
    } catch {
      setStatusMsg({ text: 'Import request failed.', ok: false })
    } finally {
      setImporting(false)
    }
  }

  const retryResolution = async () => {
    const idsToRetry = [...unresolvedIds]
    setUnresolvedIds([])
    setShowUnresolvedPanel(false)
    const resolved = await resolveNames(processes, idsToRetry)
    setProcesses(resolved)
  }

  const resolvedCount = resolutionProgress
    ? resolutionProgress.cached + resolutionProgress.bulk + resolutionProgress.perid + resolutionProgress.failed
    : 0
  const resolutionPct = resolutionProgress && resolutionProgress.total > 0
    ? Math.round((resolvedCount / resolutionProgress.total) * 100)
    : 0

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>
      <div className="mb-3">
        <button className="btn btn-link p-0" style={{ color: '#94A3B8', fontSize: 14 }} onClick={() => navigate('/orchestration/boomi')}>
          <i className="fas fa-arrow-left me-1" />Back to Boomi Onboarding
        </button>
      </div>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,rgba(59,130,246,.15) 0%,rgba(139,92,246,.15) 100%)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 12, padding: '24px 32px', marginBottom: 24 }}>
        <div className="d-flex align-items-start justify-content-between flex-wrap gap-3">
          <div>
            <h1 className="h3 text-white mb-1"><i className="fas fa-satellite-dish me-2" style={{ color: '#06B6D4' }} />Discover Integrations</h1>
            <p style={{ color: 'rgba(255,255,255,.7)', margin: 0, fontSize: 14 }}>Scan your enabled Boomi environments to discover deployed processes and import them.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#06B6D4,#0891B2)', color: '#fff', border: 'none', fontWeight: 600 }} onClick={discover} disabled={discovering}>
              {discovering ? <><span className="spinner-border spinner-border-sm me-1" />Discovering…</> : <><i className="fas fa-satellite-dish me-1" />Discover Processes</>}
            </button>
            <button className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', border: 'none', fontWeight: 600 }} onClick={importSelected} disabled={importing || !selectedKeys.length}>
              {importing ? <><span className="spinner-border spinner-border-sm me-1" />Importing…</> : <><i className="fas fa-file-import me-1" />Import Selected</>}
            </button>
            {showProceed && (
              <Link
                to="/orchestration/boomi/mappings"
                className="btn btn-sm"
                style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)', color: '#fff', border: 'none', fontWeight: 600 }}
              >
                <i className="fas fa-arrow-right me-1" />Proceed to Mapping
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Discovered', value: processes.length, color: '#06B6D4' },
          { label: 'Ready to Import', value: ready.length, color: '#10B981' },
          { label: 'Already Imported', value: existing.length, color: '#F59E0B' },
          { label: 'Selected', value: selectedKeys.length, color: '#3B82F6' },
        ].map(s => (
          <div key={s.label} className="col-6 col-md-3">
            <div style={{ background: 'linear-gradient(180deg,rgba(30,41,59,.95) 0%,rgba(15,23,42,.95) 100%)', border: '1px solid rgba(46,134,193,.2)', borderLeft: `4px solid ${s.color}`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ color: 'rgba(255,255,255,.9)', fontSize: 13, fontWeight: 500 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {statusMsg && <div style={{ color: statusMsg.ok ? '#10B981' : '#EF4444', fontSize: 13, marginBottom: 16 }}>{statusMsg.text}</div>}

      {/* Name resolution progress panel */}
      {resolutionProgress && resolutionProgress.total > 0 && (
        <div style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>
              <i className="fas fa-tags me-2" style={{ color: '#06B6D4' }} />
              {resolutionProgress.resolving ? 'Resolving process names…' : 'Name resolution complete'}
            </span>
            {!resolutionProgress.resolving && (
              <button className="btn btn-sm btn-link p-0" style={{ color: '#94A3B8' }} onClick={() => setResolutionProgress(null)}>
                <i className="fas fa-times" />
              </button>
            )}
          </div>
          <div className="progress mb-2" style={{ height: 6, background: 'rgba(255,255,255,.1)', borderRadius: 4 }}>
            <div
              className="progress-bar"
              style={{ width: `${resolutionPct}%`, background: 'linear-gradient(90deg,#06B6D4,#3B82F6)', transition: 'width .3s ease' }}
            />
          </div>
          <div className="d-flex gap-4 flex-wrap" style={{ fontSize: 12 }}>
            <span style={{ color: '#94A3B8' }}><span style={{ color: '#10B981', fontWeight: 700 }}>{resolutionProgress.cached}</span> cached</span>
            <span style={{ color: '#94A3B8' }}><span style={{ color: '#3B82F6', fontWeight: 700 }}>{resolutionProgress.bulk}</span> bulk</span>
            <span style={{ color: '#94A3B8' }}><span style={{ color: '#F59E0B', fontWeight: 700 }}>{resolutionProgress.perid}</span> per-id</span>
            <span style={{ color: '#94A3B8' }}><span style={{ color: '#EF4444', fontWeight: 700 }}>{resolutionProgress.failed}</span> failed</span>
            <span style={{ color: '#475569' }}>{resolutionPct}% of {resolutionProgress.total}</span>
          </div>
        </div>
      )}

      {/* Unresolved IDs retry panel */}
      {showUnresolvedPanel && unresolvedIds.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div className="d-flex justify-content-between align-items-start gap-3">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#EF4444', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                <i className="fas fa-exclamation-triangle me-2" />
                {unresolvedIds.length} component{unresolvedIds.length !== 1 ? 's' : ''} could not be resolved
              </div>
              <div style={{ color: '#94A3B8', fontSize: 12, wordBreak: 'break-all' }}>
                {unresolvedIds.slice(0, 5).join(', ')}{unresolvedIds.length > 5 ? ` … and ${unresolvedIds.length - 5} more` : ''}
              </div>
            </div>
            <div className="d-flex gap-2 align-items-center flex-shrink-0">
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', color: '#EF4444', fontSize: 12, fontWeight: 600 }}
                onClick={retryResolution}
                disabled={!!(resolutionProgress?.resolving)}
              >
                <i className="fas fa-redo me-1" />Retry
              </button>
              <button className="btn btn-sm btn-link p-0" style={{ color: '#94A3B8' }} onClick={() => setShowUnresolvedPanel(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!discovered ? (
        <div style={CARD}>
          <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>
            <i className="fas fa-satellite-dish d-block mb-3" style={{ fontSize: 40, color: '#475569' }} />
            <h5 className="text-white">No processes discovered yet</h5>
            <p>Click "Discover Processes" to scan your enabled Boomi environments.</p>
          </div>
        </div>
      ) : (
        <>
          <ul className="nav nav-tabs mb-0" style={{ borderBottom: '1px solid rgba(46,134,193,.3)' }}>
            {[{ id: 'ready', label: 'Ready to Import', count: ready.length, icon: 'fa-inbox' }, { id: 'existing', label: 'Already Imported', count: existing.length, icon: 'fa-check-circle' }].map(t => (
              <li key={t.id} className="nav-item">
                <button
                  onClick={() => setActiveTab(t.id as 'ready' | 'existing')}
                  style={{ background: activeTab === t.id ? 'linear-gradient(180deg,rgba(30,41,59,.95) 0%,rgba(15,23,42,.95) 100%)' : 'transparent', border: `1px solid ${activeTab === t.id ? 'rgba(46,134,193,.3)' : 'transparent'}`, borderBottom: 'none', borderRadius: '10px 10px 0 0', color: activeTab === t.id ? '#fff' : '#94A3B8', padding: '10px 20px', marginRight: 4, fontWeight: 600, fontSize: 14 }}
                >
                  <i className={`fas ${t.icon} me-1`} />{t.label}
                  <span style={{ background: activeTab === t.id ? '#3B82F6' : 'rgba(46,134,193,.25)', color: activeTab === t.id ? '#fff' : '#CBD5E1', fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10, marginLeft: 8 }}>{t.count}</span>
                </button>
              </li>
            ))}
          </ul>
          <div style={{ background: 'linear-gradient(180deg,rgba(30,41,59,.95) 0%,rgba(15,23,42,.95) 100%)', border: '1px solid rgba(46,134,193,.3)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 16 }}>
            {activeTab === 'ready' && (
              ready.length === 0
                ? <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}><i className="fas fa-check-double d-block mb-3" style={{ fontSize: 32 }} /><h5 className="text-white">Nothing new to import</h5><p>All discovered processes are already in the catalogue.</p></div>
                : <DataGrid
                    dataSource={ready}
                    keyExpr="componentId"
                    showBorders={false}
                    showRowLines={true}
                    columnAutoWidth={true}
                    height={500}
                    selectedRowKeys={selectedKeys}
                    onSelectionChanged={e => setSelectedKeys(e.selectedRowKeys as string[])}
                  >
                    <Selection mode="multiple" showCheckBoxesMode="always" />
                    <SearchPanel visible={true} placeholder="Search processes..." width={240} />
                    <FilterRow visible={true} />
                    <Paging pageSize={25} />
                    <Pager showPageSizeSelector={true} allowedPageSizes={[25, 50, 100]} showInfo={true} />
                    <Column dataField="componentName" caption="Process Name" minWidth={200} />
                    <Column dataField="componentId" caption="Component ID" width={180} />
                    <Column dataField="environments" caption="Environments" width={200} />
                    <Column dataField="deployedDate" caption="Deployed" dataType="datetime" format="yyyy-MM-dd HH:mm" width={150} />
                    <Column dataField="active" caption="Active" width={80} cellRender={({ value }: { value: boolean }) => <span className={`badge ${value ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: 11 }}>{value ? 'Active' : 'Inactive'}</span>} />
                  </DataGrid>
            )}
            {activeTab === 'existing' && (
              existing.length === 0
                ? <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}><i className="fas fa-folder-open d-block mb-3" style={{ fontSize: 32 }} /><h5 className="text-white">Nothing imported yet</h5></div>
                : <DataGrid dataSource={existing} keyExpr="componentId" showBorders={false} showRowLines={true} columnAutoWidth={true} height={500}>
                    <SearchPanel visible={true} placeholder="Search imported..." width={240} />
                    <FilterRow visible={true} />
                    <Paging pageSize={25} />
                    <Pager showPageSizeSelector={true} allowedPageSizes={[25, 50, 100]} showInfo={true} />
                    <Column dataField="componentName" caption="Process Name" minWidth={200} />
                    <Column dataField="componentId" caption="Component ID" width={180} />
                    <Column dataField="environments" caption="Environments" width={200} />
                    <Column dataField="deployedDate" caption="Deployed" dataType="datetime" format="yyyy-MM-dd HH:mm" width={150} />
                    <Column dataField="mappingComplete" caption="Mapping" width={130} cellRender={({ value }: { value: boolean }) => <span className={`badge ${value ? 'bg-success' : 'bg-warning text-dark'}`} style={{ fontSize: 11 }}>{value ? 'Configured' : 'Needs mapping'}</span>} />
                    <Column caption="Actions" width={140} cellRender={({ data }: { data: BoomiProcess }) =>
                      data.integrationFlowId ? (
                        <Link
                          to={`/orchestration/boomi/mappings?editId=${data.integrationFlowId}`}
                          className="btn btn-sm"
                          style={{ background: 'rgba(99,102,241,.2)', border: '1px solid rgba(99,102,241,.4)', color: '#818CF8', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                        >
                          <i className="fas fa-pencil-alt me-1" />Edit Mapping
                        </Link>
                      ) : null
                    } />
                  </DataGrid>
            )}
          </div>
        </>
      )}
    </div>
  )
}
