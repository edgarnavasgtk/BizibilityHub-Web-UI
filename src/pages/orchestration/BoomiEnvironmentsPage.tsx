import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../services/apiClient'

interface BoomiAtom {
  boomiAtomId: string
  atomName: string
  boomiEnvironmentId: string
  boomiEnvironmentName: string
  classification: string
  status: string
  isEnabled: boolean
}

interface EnvGroup {
  environmentId: string
  environmentName: string
  classification: string
  atoms: BoomiAtom[]
}

interface BoomiEnvResponse {
  success: boolean
  atoms: BoomiAtom[]
  stats: { totalEnvironments: number; totalAtoms: number; enabled: number; online: number }
}

const CARD = { background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 12, padding: 20 }
const CLASSIFICATION_BADGE: Record<string, string> = { PROD: 'success', TEST: 'warning' }

function group(atoms: BoomiAtom[]): EnvGroup[] {
  const map: Record<string, EnvGroup> = {}
  atoms.forEach(a => {
    const k = a.boomiEnvironmentId || '__unknown__'
    if (!map[k]) map[k] = { environmentId: a.boomiEnvironmentId, environmentName: a.boomiEnvironmentName || 'Unknown', classification: a.classification || 'UNKNOWN', atoms: [] }
    map[k].atoms.push(a)
  })
  return Object.values(map).sort((a, b) => {
    if (a.classification === 'PROD' && b.classification !== 'PROD') return -1
    if (b.classification === 'PROD' && a.classification !== 'PROD') return 1
    return a.environmentName.localeCompare(b.environmentName)
  })
}

export default function BoomiEnvironmentsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [openEnvs, setOpenEnvs] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const { data } = useQuery<BoomiEnvResponse>({
    queryKey: ['boomi', 'environments'],
    queryFn: () => apiClient.get('/Admin/GetBoomiEnvironments').then(r => r.data),
  })

  const toggleEnvMut = useMutation({
    mutationFn: (p: { environmentId: string; isEnabled: boolean }) => apiClient.post('/Admin/ToggleBoomiEnvironment', p).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boomi', 'environments'] }),
  })

  const toggleAtomMut = useMutation({
    mutationFn: (p: { atomId: string; isEnabled: boolean }) => apiClient.post('/Admin/ToggleBoomiAtom', p).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boomi', 'environments'] }),
  })

  const syncEnvironments = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await apiClient.post('/Admin/SyncBoomiEnvironments')
      setSyncMsg({ text: r.data?.message ?? 'Synced', ok: r.data?.success })
      qc.invalidateQueries({ queryKey: ['boomi', 'environments'] })
    } catch {
      setSyncMsg({ text: 'Sync failed', ok: false })
    } finally {
      setSyncing(false)
    }
  }

  const atoms = data?.atoms ?? []
  const stats = data?.stats
  const groups = group(atoms)

  const visible = groups.filter(env => {
    if (filter === 'PROD' && env.classification !== 'PROD') return false
    if (filter === 'TEST' && env.classification !== 'TEST') return false
    if (filter === 'enabled' && !env.atoms.some(a => a.isEnabled)) return false
    if (!search) return true
    const q = search.toLowerCase()
    return env.environmentName.toLowerCase().includes(q) || env.atoms.some(a => a.atomName.toLowerCase().includes(q))
  })

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>
      <div className="mb-3">
        <button className="btn btn-link p-0" style={{ color: '#94A3B8', fontSize: 14 }} onClick={() => navigate('/orchestration/boomi')}>
          <i className="fas fa-arrow-left me-1" />Back to Boomi Onboarding
        </button>
      </div>

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1"><i className="fas fa-server me-2" style={{ color: '#8B5CF6' }} />Select Environments</h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>Pick which Boomi environments & atoms the collector polls. Production atoms are enabled by default.</p>
        </div>
        <button className="btn btn-primary" onClick={syncEnvironments} disabled={syncing}>
          {syncing ? <><span className="spinner-border spinner-border-sm me-2" />Syncing…</> : <><i className="fas fa-sync-alt me-1" />Sync from Boomi API</>}
        </button>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Environments', value: stats?.totalEnvironments, color: '#8B5CF6' },
          { label: 'Total Atoms', value: stats?.totalAtoms, color: '#3B82F6' },
          { label: 'Enabled', value: stats?.enabled, color: '#10B981' },
          { label: 'Online', value: stats?.online, color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} className="col-6 col-md-3">
            <div style={CARD}>
              <div style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 700 }}>{s.value ?? '-'}</div>
            </div>
          </div>
        ))}
      </div>

      {syncMsg && <div style={{ color: syncMsg.ok ? '#10B981' : '#EF4444', fontSize: 13, marginBottom: 16 }}>{syncMsg.text}</div>}

      {/* Toolbar */}
      <div className="d-flex gap-2 mb-4 flex-wrap align-items-center">
        <input
          className="form-control form-control-sm"
          placeholder="Search environments or atoms…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.4)', color: '#fff', maxWidth: 280 }}
        />
        {[{ id: 'all', label: 'All' }, { id: 'PROD', label: 'Production' }, { id: 'TEST', label: 'Test' }, { id: 'enabled', label: 'Enabled' }].map(p => (
          <button key={p.id} onClick={() => setFilter(p.id)} className="btn btn-sm" style={{ borderRadius: 999, border: '1px solid rgba(46,134,193,.4)', background: filter === p.id ? 'linear-gradient(135deg,#3B82F6,#2563EB)' : 'rgba(46,134,193,.15)', color: filter === p.id ? '#fff' : '#CBD5E1', fontSize: 12, fontWeight: 600 }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: 50, color: '#94A3B8' }}>
          <i className="fas fa-inbox d-block mb-3" style={{ fontSize: 40, color: '#475569' }} />
          <div>{atoms.length ? 'No environments match your filter.' : 'No environments synced yet — click Sync from Boomi API.'}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18 }}>
          {visible.map(env => {
            const enabledCount = env.atoms.filter(a => a.isEnabled).length
            const onlineCount = env.atoms.filter(a => (a.status || '').toUpperCase() === 'ONLINE').length
            const masterState = enabledCount === 0 ? 'off' : enabledCount === env.atoms.length ? 'on' : 'partial'
            const isOpen = !!openEnvs[env.environmentId]
            const badgeVariant = CLASSIFICATION_BADGE[env.classification] ?? 'secondary'

            return (
              <div key={env.environmentId} style={{ background: '#1E293B', border: `1px solid ${enabledCount > 0 ? 'rgba(16,185,129,.45)' : 'rgba(46,134,193,.2)'}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(46,134,193,.18)' }}>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span className="text-white fw-semibold text-truncate" style={{ flex: 1 }}>{env.environmentName}</span>
                    <span className={`badge bg-${badgeVariant}`} style={{ fontSize: 10 }}>{env.classification}</span>
                  </div>
                  <code style={{ color: '#64748B', fontSize: 11 }}>{env.environmentId}</code>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: '#0F172A', borderBottom: '1px solid rgba(46,134,193,.18)' }}>
                  {[{ num: env.atoms.length, lbl: 'Atoms', color: '#fff' }, { num: enabledCount, lbl: 'Enabled', color: '#10B981' }, { num: onlineCount, lbl: 'Online', color: '#F59E0B' }].map((c, i) => (
                    <div key={c.lbl} style={{ textAlign: 'center', padding: '12px 0', borderRight: i < 2 ? '1px solid rgba(46,134,193,.18)' : 'none' }}>
                      <div style={{ color: c.color, fontWeight: 700, fontSize: 18 }}>{c.num}</div>
                      <div style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.lbl}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(15,23,42,.5)', borderBottom: '1px solid rgba(46,134,193,.18)' }}>
                  <div>
                    <div style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600 }}>Polling</div>
                    <div style={{ fontSize: 12, color: masterState === 'on' ? '#10B981' : masterState === 'partial' ? '#F59E0B' : '#94A3B8' }}>
                      {masterState === 'on' ? 'All enabled' : masterState === 'partial' ? `${enabledCount} of ${env.atoms.length} enabled` : 'All disabled'}
                    </div>
                  </div>
                  <div
                    onClick={() => toggleEnvMut.mutate({ environmentId: env.environmentId, isEnabled: masterState !== 'on' })}
                    style={{ width: 44, height: 24, background: masterState === 'on' ? 'linear-gradient(135deg,#10B981,#059669)' : masterState === 'partial' ? 'linear-gradient(135deg,#F59E0B,#D97706)' : '#475569', borderRadius: 999, cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                  >
                    <div style={{ position: 'absolute', top: 3, left: masterState === 'on' ? 23 : masterState === 'partial' ? 13 : 3, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }} />
                  </div>
                </div>

                <button onClick={() => setOpenEnvs(p => ({ ...p, [env.environmentId]: !p[env.environmentId] }))} style={{ background: 'transparent', border: 'none', color: '#94A3B8', padding: '10px 20px', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <i className={`fas fa-chevron-right`} style={{ transition: 'transform .2s', transform: isOpen ? 'rotate(90deg)' : 'none', fontSize: 11 }} />
                  {isOpen ? 'Hide' : 'Show'} individual atoms
                </button>

                {isOpen && (
                  <div style={{ padding: '0 20px 16px', borderTop: '1px solid rgba(46,134,193,.12)' }}>
                    {env.atoms.map(a => (
                      <div key={a.boomiAtomId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px dashed rgba(46,134,193,.12)', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#E2E8F0', fontSize: 13, fontWeight: 500, wordBreak: 'break-word' }}>{a.atomName || '(unnamed)'}</div>
                          <div style={{ color: '#64748B', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.status?.toUpperCase() === 'ONLINE' ? '#10B981' : '#EF4444', display: 'inline-block', boxShadow: a.status?.toUpperCase() === 'ONLINE' ? '0 0 6px rgba(16,185,129,.5)' : 'none' }} />
                            {a.status?.toUpperCase() || 'UNKNOWN'}
                          </div>
                        </div>
                        <div
                          onClick={() => toggleAtomMut.mutate({ atomId: a.boomiAtomId, isEnabled: !a.isEnabled })}
                          style={{ width: 44, height: 24, background: a.isEnabled ? 'linear-gradient(135deg,#10B981,#059669)' : '#475569', borderRadius: 999, cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                        >
                          <div style={{ position: 'absolute', top: 3, left: a.isEnabled ? 23 : 3, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left .2s' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
