import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../services/apiClient'

interface MuleSoftConfig {
  healthCheckUrl: string
  pollingIntervalSeconds: number
  anypointBaseUrl: string
  organizationId: string
  clientId: string
  clientSecret: string
  solaceRestUrl: string
  solaceQueueName: string
  solaceUsername: string
}

const CARD = { background: '#1E293B', border: '1px solid rgba(46,134,193,.2)', borderRadius: 12, padding: 24, marginBottom: 20 }

function Field({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
      <span style={{ color: '#BDC3C7', fontWeight: 500 }}><i className={`fas ${icon} me-2`} />{label}</span>
      <div style={{ width: 280 }}>{children}</div>
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
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

export default function MuleSoftConfigurationPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showSecret, setShowSecret] = useState(false)
  const [pollerStatus, setPollerStatus] = useState<{ status: string; lastCheck: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [notify, setNotify] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [cfg, setCfg] = useState<MuleSoftConfig>({
    healthCheckUrl: 'http://localhost:8090/actuator/health',
    pollingIntervalSeconds: 10,
    anypointBaseUrl: 'https://anypoint.mulesoft.com',
    organizationId: '',
    clientId: '',
    clientSecret: '',
    solaceRestUrl: '',
    solaceQueueName: 'gtekmonitoring/mulesoft',
    solaceUsername: 'solace-cloud-client',
  })

  const { data: configData } = useQuery({
    queryKey: ['mulesoft', 'config'],
    queryFn: () => apiClient.get('/Admin/GetMuleSoftConfiguration').then(r => r.data as { success: boolean; config: MuleSoftConfig }),
  })

  useEffect(() => {
    if (configData?.success && configData.config) setCfg(configData.config)
  }, [configData])

  const showNotify = (msg: string, type: 'success' | 'error') => {
    setNotify({ msg, type })
    setTimeout(() => setNotify(null), type === 'success' ? 2500 : 3000)
  }

  const saveConfigMut = useMutation({
    mutationFn: () => apiClient.post('/Admin/SaveMuleSoftConfiguration', cfg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mulesoft', 'config'] })
      showNotify('Configuration saved successfully.', 'success')
    },
    onError: () => {
      showNotify('Failed to save configuration. Please try again.', 'error')
    },
  })

  const testHealth = async () => {
    setTesting(true)
    try {
      const r = await apiClient.post('/Admin/TestMuleSoftConnections')
      const up = r.data?.poller?.success === true
      setPollerStatus({ status: up ? 'UP' : 'DOWN', lastCheck: new Date().toLocaleString() })
    } catch {
      setPollerStatus({ status: 'Error', lastCheck: new Date().toLocaleString() })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>
      {/* Toast */}
      {notify && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: notify.type === 'success' ? '#1E8449' : '#922B21',
          color: '#fff', padding: '10px 20px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.4)',
          fontSize: 13, fontWeight: 500,
        }}>
          <i className={`fas ${notify.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2`} />
          {notify.msg}
        </div>
      )}

      <div className="mb-3">
        <button className="btn btn-link p-0" style={{ color: '#94A3B8', fontSize: 14 }} onClick={() => navigate('/orchestration/mulesoft')}>
          <i className="fas fa-arrow-left me-1" />Back to MuleSoft Onboarding
        </button>
      </div>

      <div className="mb-4">
        <h1 className="h3 text-white mb-1"><i className="fas fa-sliders-h me-2" style={{ color: '#3B82F6' }} />MuleSoft Configuration</h1>
        <p className="text-muted mb-0" style={{ fontSize: 14 }}>Configure the MuleSoft Poller connection, Anypoint Platform credentials, and Solace publisher settings.</p>
      </div>

      {/* Poller Health */}
      <div style={CARD}>
        <h5 className="text-white mb-3"><i className="fas fa-heartbeat me-2 text-danger" />Poller Health</h5>
        <div className="d-flex align-items-center gap-4 flex-wrap">
          <div style={{ textAlign: 'center', padding: '12px 20px', background: 'rgba(0,0,0,.2)', borderRadius: 10, minWidth: 120 }}>
            <div style={{ color: pollerStatus ? (pollerStatus.status === 'UP' ? '#10B981' : '#EF4444') : '#64748B', fontSize: 26, fontWeight: 700 }}>{pollerStatus?.status ?? '--'}</div>
            <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>Poller Status</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px 20px', background: 'rgba(0,0,0,.2)', borderRadius: 10, minWidth: 120 }}>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{pollerStatus?.lastCheck ?? '--'}</div>
            <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>Last Check</div>
          </div>
          <div className="ms-auto">
            <button className="btn btn-sm" onClick={testHealth} disabled={testing} style={{ background: 'transparent', border: '1px solid rgba(46,134,193,.4)', color: '#3B82F6', borderRadius: 8, fontWeight: 600 }}>
              {testing ? <><span className="spinner-border spinner-border-sm me-1" />Testing…</> : <><i className="fas fa-vial me-1" />Test Health</>}
            </button>
          </div>
        </div>
      </div>

      {/* Poller Settings */}
      <div style={CARD}>
        <h5 className="text-white mb-3"><i className="fas fa-cog me-2 text-primary" />Poller Settings</h5>
        <Field label="Health Check URL" icon="fa-link">
          <TextInput value={cfg.healthCheckUrl} onChange={v => setCfg(p => ({ ...p, healthCheckUrl: v }))} placeholder="http://localhost:8090/actuator/health" />
        </Field>
        <Field label="Polling Interval (seconds)" icon="fa-clock">
          <input type="number" value={cfg.pollingIntervalSeconds} min={5} max={300} onChange={e => setCfg(p => ({ ...p, pollingIntervalSeconds: Number(e.target.value) }))} className="form-control form-control-sm" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(46,134,193,.3)', color: '#fff', borderRadius: 6 }} />
        </Field>
        <div className="d-flex justify-content-end mt-3">
          <button className="btn btn-primary btn-sm" onClick={() => saveConfigMut.mutate()} disabled={saveConfigMut.isPending}>
            <i className="fas fa-save me-1" />Save Poller Settings
          </button>
        </div>
      </div>

      {/* Anypoint Platform */}
      <div style={CARD}>
        <h5 className="text-white mb-3"><i className="fas fa-cloud me-2 text-primary" />Anypoint Platform</h5>
        <Field label="Base URL" icon="fa-globe"><TextInput value={cfg.anypointBaseUrl} onChange={v => setCfg(p => ({ ...p, anypointBaseUrl: v }))} placeholder="https://anypoint.mulesoft.com" /></Field>
        <Field label="Organization ID" icon="fa-building"><TextInput value={cfg.organizationId} onChange={v => setCfg(p => ({ ...p, organizationId: v }))} placeholder="your-org-id" /></Field>
        <Field label="Client ID" icon="fa-id-card"><TextInput value={cfg.clientId} onChange={v => setCfg(p => ({ ...p, clientId: v }))} placeholder="client-id" /></Field>
        <Field label="Client Secret" icon="fa-lock">
          <div className="input-group input-group-sm">
            <TextInput value={cfg.clientSecret} onChange={v => setCfg(p => ({ ...p, clientSecret: v }))} type={showSecret ? 'text' : 'password'} placeholder="••••••••" />
            <button className="btn btn-outline-secondary" onClick={() => setShowSecret(p => !p)} style={{ border: '1px solid rgba(46,134,193,.3)', color: '#94A3B8' }}>
              <i className={`fas ${showSecret ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
        </Field>
        <div className="d-flex justify-content-end mt-3">
          <button className="btn btn-primary btn-sm" onClick={() => saveConfigMut.mutate()} disabled={saveConfigMut.isPending}>
            <i className="fas fa-save me-1" />Save Anypoint Settings
          </button>
        </div>
      </div>

      {/* Solace Publisher */}
      <div style={CARD}>
        <h5 className="text-white mb-3"><i className="fas fa-exchange-alt me-2 text-primary" />Solace Publisher</h5>
        <Field label="REST URL" icon="fa-server"><TextInput value={cfg.solaceRestUrl} onChange={v => setCfg(p => ({ ...p, solaceRestUrl: v }))} placeholder="https://mr-connection.messaging.solace.cloud:9443" /></Field>
        <Field label="Queue Name" icon="fa-envelope"><TextInput value={cfg.solaceQueueName} onChange={v => setCfg(p => ({ ...p, solaceQueueName: v }))} /></Field>
        <Field label="Username" icon="fa-user"><TextInput value={cfg.solaceUsername} onChange={v => setCfg(p => ({ ...p, solaceUsername: v }))} /></Field>
        <div className="d-flex justify-content-end mt-3">
          <button className="btn btn-primary btn-sm" onClick={() => saveConfigMut.mutate()} disabled={saveConfigMut.isPending}>
            <i className="fas fa-save me-1" />Save Solace Settings
          </button>
        </div>
      </div>
    </div>
  )
}
