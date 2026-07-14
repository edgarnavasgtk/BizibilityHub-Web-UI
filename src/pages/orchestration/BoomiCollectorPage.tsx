import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import apiClient from '../../services/apiClient'

interface BoomiSettings { [key: string]: string }
interface PollingState { lastPollEndTime: string | null; lastPollRecordCount: number; lastPollSuccess: boolean }

const CARD = { background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 12, padding: 24, marginBottom: 20 }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: '#BDC3C7', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="form-control form-control-sm"
      style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(46,134,193,.3)', color: '#fff', borderRadius: 6 }}
    />
  )
}

function NumInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={e => onChange(Number(e.target.value))}
      className="form-control form-control-sm"
      style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(46,134,193,.3)', color: '#fff', borderRadius: 6 }}
    />
  )
}

export default function BoomiCollectorPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'collector' | 'boomi' | 'solace'>('collector')
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({})

  const [boomi, setBoomi] = useState({ accountId: '', username: '', apiToken: '', baseUrl: 'https://api.boomi.com/api/rest/v1', pollingInterval: 5, pageSize: 100, maxPages: 100, timeout: 30, retryAttempts: 3, retryDelay: 1000 })
  const [solacePub, setSolacePub] = useState({ restUrl: '', username: 'solace-cloud-client', password: '', topic: 'gtekmonitoring/boomi', deadLetterTopic: 'gtekmonitoring/boomi/failed', enabled: true })
  const [solaceCon, setSolaceCon] = useState({ host: '', vpnName: 'gtek-mon', username: 'solace-cloud-client', password: '', queueName: 'gtekmonitoringboomi' })
  const [pollingEnabled, setPollingEnabled] = useState(true)

  const { data: state } = useQuery<PollingState | null>({
    queryKey: ['boomi', 'pollingState'],
    queryFn: () => apiClient.get<{ state: PollingState }>('/Admin/GetPollingState').then(r => r.data?.state ?? null),
    refetchInterval: 30000,
  })

  const { data: settingsData } = useQuery<{ success: boolean; settings: BoomiSettings }>({
    queryKey: ['boomi', 'settings'],
    queryFn: () => apiClient.get<{ success: boolean; settings: BoomiSettings }>('/Admin/GetBoomiSettings').then(r => r.data),
  })

  useEffect(() => {
    const d = settingsData
    if (!d?.settings) return
    const s = d.settings
    setBoomi(prev => ({ ...prev, accountId: s['Boomi:AccountId'] ?? prev.accountId, username: s['Boomi:Username'] ?? prev.username, apiToken: s['Boomi:ApiToken'] ?? prev.apiToken, baseUrl: s['Boomi:BaseUrl'] ?? prev.baseUrl, pollingInterval: Number(s['Boomi:PollingIntervalMinutes'] ?? prev.pollingInterval), pageSize: Number(s['Boomi:PageSize'] ?? prev.pageSize), maxPages: Number(s['Boomi:MaxPagesPerCycle'] ?? prev.maxPages), timeout: Number(s['Boomi:RequestTimeoutSeconds'] ?? prev.timeout), retryAttempts: Number(s['Boomi:RetryAttempts'] ?? prev.retryAttempts), retryDelay: Number(s['Boomi:RetryDelayMs'] ?? prev.retryDelay) }))
    setSolacePub(prev => ({ ...prev, restUrl: s['SolacePublisher:RestUrl'] ?? prev.restUrl, username: s['SolacePublisher:Username'] ?? prev.username, password: s['SolacePublisher:Password'] ?? prev.password, topic: s['SolacePublisher:Topic'] ?? prev.topic, deadLetterTopic: s['SolacePublisher:DeadLetterTopic'] ?? prev.deadLetterTopic, enabled: s['SolacePublisher:Enabled'] !== 'false' }))
    setSolaceCon(prev => ({ ...prev, host: s['SolaceConsumer:Host'] ?? prev.host, vpnName: s['SolaceConsumer:VpnName'] ?? prev.vpnName, username: s['SolaceConsumer:Username'] ?? prev.username, password: s['SolaceConsumer:Password'] ?? prev.password, queueName: s['SolaceConsumer:QueueName'] ?? prev.queueName }))
    setPollingEnabled(s['Boomi:PollingEnabled'] !== 'false')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsData])

  const saveMut = useMutation({
    mutationFn: (settings: Array<{ settingKey: string; settingValue: string }>) =>
      Promise.all(settings.map(s => apiClient.post('/Admin/UpdateBoomiSetting', s))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boomi', 'settings'] }),
  })

  const togglePolling = (val: boolean) => {
    setPollingEnabled(val)
    saveMut.mutate([{ settingKey: 'Boomi:PollingEnabled', settingValue: val ? 'true' : 'false' }])
  }

  const saveBoomi = () => saveMut.mutate([
    { settingKey: 'Boomi:AccountId', settingValue: boomi.accountId },
    { settingKey: 'Boomi:Username', settingValue: boomi.username },
    { settingKey: 'Boomi:ApiToken', settingValue: boomi.apiToken },
    { settingKey: 'Boomi:BaseUrl', settingValue: boomi.baseUrl },
    { settingKey: 'Boomi:PollingIntervalMinutes', settingValue: String(boomi.pollingInterval) },
    { settingKey: 'Boomi:PageSize', settingValue: String(boomi.pageSize) },
    { settingKey: 'Boomi:MaxPagesPerCycle', settingValue: String(boomi.maxPages) },
    { settingKey: 'Boomi:RequestTimeoutSeconds', settingValue: String(boomi.timeout) },
    { settingKey: 'Boomi:RetryAttempts', settingValue: String(boomi.retryAttempts) },
    { settingKey: 'Boomi:RetryDelayMs', settingValue: String(boomi.retryDelay) },
  ])

  const saveSolacePub = () => saveMut.mutate([
    { settingKey: 'SolacePublisher:RestUrl', settingValue: solacePub.restUrl },
    { settingKey: 'SolacePublisher:Username', settingValue: solacePub.username },
    { settingKey: 'SolacePublisher:Password', settingValue: solacePub.password },
    { settingKey: 'SolacePublisher:Topic', settingValue: solacePub.topic },
    { settingKey: 'SolacePublisher:DeadLetterTopic', settingValue: solacePub.deadLetterTopic },
    { settingKey: 'SolacePublisher:Enabled', settingValue: String(solacePub.enabled) },
  ])

  const saveSolaceCon = () => saveMut.mutate([
    { settingKey: 'SolaceConsumer:Host', settingValue: solaceCon.host },
    { settingKey: 'SolaceConsumer:VpnName', settingValue: solaceCon.vpnName },
    { settingKey: 'SolaceConsumer:Username', settingValue: solaceCon.username },
    { settingKey: 'SolaceConsumer:Password', settingValue: solaceCon.password },
    { settingKey: 'SolaceConsumer:QueueName', settingValue: solaceCon.queueName },
  ])

  const tabs = [{ id: 'collector', label: 'Collector', icon: 'fa-cog' }, { id: 'boomi', label: 'Boomi API', icon: 'fa-cloud' }, { id: 'solace', label: 'Solace', icon: 'fa-exchange-alt' }] as const

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>
      <div className="mb-3">
        <button className="btn btn-link p-0" style={{ color: '#94A3B8', fontSize: 14 }} onClick={() => navigate('/orchestration/boomi')}>
          <i className="fas fa-arrow-left me-1" /> Back to Boomi Onboarding
        </button>
      </div>

      <div className="mb-4">
        <h1 className="h3 text-white mb-1"><i className="fas fa-cloud-download-alt me-2 text-primary" />Boomi Collector Configuration</h1>
        <p className="text-muted mb-0" style={{ fontSize: 14 }}>Manage Boomi Log Collector settings, connection credentials, and Solace messaging configuration.</p>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4" style={{ borderBottom: '1px solid rgba(46,134,193,.3)' }}>
        {tabs.map(t => (
          <li key={t.id} className="nav-item">
            <button
              className={`nav-link ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              style={{ background: activeTab === t.id ? 'rgba(46,134,193,.25)' : 'rgba(255,255,255,.03)', color: activeTab === t.id ? '#fff' : '#94A3B8', border: '1px solid rgba(46,134,193,.2)', borderBottom: 'none', borderRadius: '8px 8px 0 0', marginRight: 4 }}
            >
              <i className={`fas ${t.icon} me-2`} />{t.label}
            </button>
          </li>
        ))}
      </ul>

      {/* Collector Tab */}
      {activeTab === 'collector' && (
        <>
          <div style={{ ...CARD, border: `1px solid ${pollingEnabled ? 'rgba(16,185,129,.45)' : 'rgba(245,158,11,.55)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <h5 className="text-white mb-1">
                <i className="fas fa-power-off me-2" />
                {pollingEnabled ? 'Polling enabled' : 'Polling paused'}
              </h5>
              <p style={{ color: '#94A3B8', fontSize: 13, margin: 0, maxWidth: 600 }}>
                The Boomi Collector polls Boomi every <strong>{boomi.pollingInterval}</strong> minute(s) and forwards executions to Solace. Pause this when you need the collector container running but quiet.
              </p>
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" role="switch" checked={pollingEnabled} onChange={e => togglePolling(e.target.checked)} style={{ width: 50, height: 26, cursor: 'pointer' }} />
            </div>
          </div>

          <div style={CARD}>
            <h5 className="text-white mb-3"><i className="fas fa-heartbeat me-2 text-primary" />Polling Status</h5>
            <div className="row g-3">
              {[
                { label: 'Last Poll', value: state?.lastPollEndTime ? new Date(state.lastPollEndTime).toLocaleString() : '--' },
                { label: 'Records', value: state?.lastPollRecordCount ?? '--' },
                { label: 'Status', value: state ? (state.lastPollSuccess ? 'Success' : 'Failed') : '--', ok: state?.lastPollSuccess },
              ].map(s => (
                <div key={s.label} className="col-md-4">
                  <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.ok === undefined ? 'var(--gtek-primary-blue)' : s.ok ? '#10b981' : '#ef4444' }}>{String(s.value)}</div>
                    <div style={{ color: '#BDC3C7', fontSize: 12, marginTop: 4 }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ color: '#94A3B8', fontSize: 13, marginTop: 16, marginBottom: 0 }}>
              Atom enable/disable lives on the <Link to="/orchestration/boomi/environments" style={{ color: '#3B82F6' }}>Select Environments</Link> page.
              {' '}The dead-letter queue for failed Solace publishes lives on the <Link to="/orchestration/boomi/monitor" style={{ color: '#3B82F6' }}>Boomi Monitor</Link> page.
            </p>
          </div>
        </>
      )}

      {/* Boomi API Tab */}
      {activeTab === 'boomi' && (
        <>
          <div className="row g-4 mb-3">
            <div className="col-md-6">
              <div style={CARD}>
                <h5 className="text-white mb-3"><i className="fas fa-key me-2 text-primary" />Connection</h5>
                <Field label="Account ID"><Input value={boomi.accountId} onChange={v => setBoomi(p => ({ ...p, accountId: v }))} /></Field>
                <Field label="Username"><Input value={boomi.username} onChange={v => setBoomi(p => ({ ...p, username: v }))} /></Field>
                <Field label="API Token">
                  <div className="input-group input-group-sm">
                    <Input value={boomi.apiToken} onChange={v => setBoomi(p => ({ ...p, apiToken: v }))} type={showTokens['apiToken'] ? 'text' : 'password'} />
                    <button className="btn btn-outline-secondary" onClick={() => setShowTokens(p => ({ ...p, apiToken: !p.apiToken }))} style={{ border: '1px solid rgba(46,134,193,.3)', color: '#94A3B8' }}>
                      <i className={`fas ${showTokens['apiToken'] ? 'fa-eye-slash' : 'fa-eye'}`} />
                    </button>
                  </div>
                </Field>
                <Field label="Base URL"><Input value={boomi.baseUrl} onChange={v => setBoomi(p => ({ ...p, baseUrl: v }))} /></Field>
              </div>
            </div>
            <div className="col-md-6">
              <div style={CARD}>
                <h5 className="text-white mb-3"><i className="fas fa-tachometer-alt me-2 text-primary" />Performance</h5>
                <div className="row g-3">
                  <div className="col-6"><Field label="Polling Interval (min)"><NumInput value={boomi.pollingInterval} onChange={v => setBoomi(p => ({ ...p, pollingInterval: v }))} min={1} max={60} /></Field></div>
                  <div className="col-6"><Field label="Page Size"><NumInput value={boomi.pageSize} onChange={v => setBoomi(p => ({ ...p, pageSize: v }))} min={10} max={500} /></Field></div>
                  <div className="col-6"><Field label="Max Pages / Cycle"><NumInput value={boomi.maxPages} onChange={v => setBoomi(p => ({ ...p, maxPages: v }))} min={1} max={500} /></Field></div>
                  <div className="col-6"><Field label="Timeout (sec)"><NumInput value={boomi.timeout} onChange={v => setBoomi(p => ({ ...p, timeout: v }))} min={5} max={120} /></Field></div>
                  <div className="col-6"><Field label="Retry Attempts"><NumInput value={boomi.retryAttempts} onChange={v => setBoomi(p => ({ ...p, retryAttempts: v }))} min={1} max={10} /></Field></div>
                  <div className="col-6"><Field label="Retry Delay (ms)"><NumInput value={boomi.retryDelay} onChange={v => setBoomi(p => ({ ...p, retryDelay: v }))} min={100} max={10000} /></Field></div>
                </div>
              </div>
            </div>
          </div>
          <div className="text-end">
            <button className="btn btn-primary" onClick={saveBoomi} disabled={saveMut.isPending}>
              <i className="fas fa-save me-1" />Save Boomi API Settings
            </button>
          </div>
        </>
      )}

      {/* Solace Tab */}
      {activeTab === 'solace' && (
        <>
          <div className="row g-4 mb-3">
            <div className="col-md-6">
              <div style={CARD}>
                <h5 className="text-white mb-1"><i className="fas fa-upload me-2 text-primary" />Publisher (Collector → Solace)</h5>
                <p style={{ color: '#3B82F6', fontSize: 12, marginBottom: 16 }}><i className="fas fa-server me-1" />Service: Java Poller (BizibilityHub-Connectors-Boomi-Poller)</p>
                <Field label="REST URL"><Input value={solacePub.restUrl} onChange={v => setSolacePub(p => ({ ...p, restUrl: v }))} /></Field>
                <Field label="Username"><Input value={solacePub.username} onChange={v => setSolacePub(p => ({ ...p, username: v }))} /></Field>
                <Field label="Password">
                  <div className="input-group input-group-sm">
                    <Input value={solacePub.password} onChange={v => setSolacePub(p => ({ ...p, password: v }))} type={showTokens['pubPw'] ? 'text' : 'password'} />
                    <button className="btn btn-outline-secondary" onClick={() => setShowTokens(p => ({ ...p, pubPw: !p.pubPw }))} style={{ border: '1px solid rgba(46,134,193,.3)', color: '#94A3B8' }}>
                      <i className={`fas ${showTokens['pubPw'] ? 'fa-eye-slash' : 'fa-eye'}`} />
                    </button>
                  </div>
                </Field>
                <Field label="Topic"><Input value={solacePub.topic} onChange={v => setSolacePub(p => ({ ...p, topic: v }))} /></Field>
                <Field label="Dead Letter Topic"><Input value={solacePub.deadLetterTopic} onChange={v => setSolacePub(p => ({ ...p, deadLetterTopic: v }))} /></Field>
                <Field label="Enabled">
                  <div className="form-check form-switch">
                    <input className="form-check-input" type="checkbox" role="switch" checked={solacePub.enabled} onChange={e => setSolacePub(p => ({ ...p, enabled: e.target.checked }))} />
                  </div>
                </Field>
                <div className="text-end mt-2">
                  <button className="btn btn-primary btn-sm" onClick={saveSolacePub} disabled={saveMut.isPending}><i className="fas fa-save me-1" />Save Publisher</button>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div style={CARD}>
                <h5 className="text-white mb-1"><i className="fas fa-download me-2 text-warning" />Consumer (Ingestion ← Solace)</h5>
                <p style={{ color: '#F59E0B', fontSize: 12, marginBottom: 16 }}><i className="fas fa-dot-circle me-1" />Service: .NET Ingestion Service (GTekMonBoomiIngestionService)</p>
                <Field label="Host"><Input value={solaceCon.host} onChange={v => setSolaceCon(p => ({ ...p, host: v }))} /></Field>
                <Field label="VPN Name"><Input value={solaceCon.vpnName} onChange={v => setSolaceCon(p => ({ ...p, vpnName: v }))} /></Field>
                <Field label="Username"><Input value={solaceCon.username} onChange={v => setSolaceCon(p => ({ ...p, username: v }))} /></Field>
                <Field label="Password">
                  <div className="input-group input-group-sm">
                    <Input value={solaceCon.password} onChange={v => setSolaceCon(p => ({ ...p, password: v }))} type={showTokens['conPw'] ? 'text' : 'password'} />
                    <button className="btn btn-outline-secondary" onClick={() => setShowTokens(p => ({ ...p, conPw: !p.conPw }))} style={{ border: '1px solid rgba(46,134,193,.3)', color: '#94A3B8' }}>
                      <i className={`fas ${showTokens['conPw'] ? 'fa-eye-slash' : 'fa-eye'}`} />
                    </button>
                  </div>
                </Field>
                <Field label="Queue Name"><Input value={solaceCon.queueName} onChange={v => setSolaceCon(p => ({ ...p, queueName: v }))} /></Field>
                <div className="text-end mt-2">
                  <button className="btn btn-primary btn-sm" onClick={saveSolaceCon} disabled={saveMut.isPending}><i className="fas fa-save me-1" />Save Consumer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
