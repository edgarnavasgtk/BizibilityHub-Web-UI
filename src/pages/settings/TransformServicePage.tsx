import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

// ── types ─────────────────────────────────────────────────────────────────────

interface TransformSettings {
  enabled: boolean
  healthCheckUrl: string
  solaceHost: string
  solaceVpn: string
  solaceUsername: string
  solacePassword: string
  inputTopic: string
  inputQueue: string
  outputTopic: string
  deadLetterTopic: string
  publisherEnabled: boolean
  cacheTtlMinutes: number
  cacheMaxSize: number
  connectorStrategies?: { mulesoft?: boolean; boomi?: boolean }
}

// ── styles ────────────────────────────────────────────────────────────────────

const configCard: React.CSSProperties = {
  background: '#1E293B',
  borderRadius: 12,
  padding: 25,
  boxShadow: '0 4px 16px rgba(0,0,0,.5)',
  border: '1px solid rgba(46,134,193,.2)',
  marginBottom: 20,
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.08)',
  border: '1px solid rgba(46,134,193,.3)',
  borderRadius: 6,
  color: '#FFFFFF',
  padding: '8px 12px',
  width: '100%',
  fontSize: 14,
}

const labelStyle: React.CSSProperties = {
  color: '#BDC3C7',
  fontWeight: 500,
  fontSize: '0.85rem',
  marginBottom: 6,
  display: 'block',
}

const btnSave: React.CSSProperties = {
  background: 'linear-gradient(135deg,#3B82F6,#2563EB)',
  border: 'none',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 20px',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
}

// ── FormField ─────────────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

export default function TransformServicePage() {
  const [tab, setTab] = useState<'service' | 'solace' | 'engine'>('service')
  const [notify, setNotify] = useState<{ msg: string; type: 'success' | 'error' | 'warning' } | null>(null)

  // ── settings state ───────────────────────────────────────────────────────

  const [enabled, setEnabled] = useState(true)
  const [healthCheckUrl, setHealthCheckUrl] = useState('')
  const [solaceHost, setSolaceHost] = useState('')
  const [solaceVpn, setSolaceVpn] = useState('gtek-mon')
  const [solaceUsername, setSolaceUsername] = useState('')
  const [solacePassword, setSolacePassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [inputTopic, setInputTopic] = useState('CONNECTOR/RAW')
  const [inputQueue, setInputQueue] = useState('')
  const [outputTopic, setOutputTopic] = useState('BIZIBILITY/INGESTION/PROCESSED')
  const [deadLetterTopic, setDeadLetterTopic] = useState('BIZIBILITY/INGESTION/PROCESSED/failed')
  const [publisherEnabled, setPublisherEnabled] = useState(true)
  const [cacheTtlMinutes, setCacheTtlMinutes] = useState(5)
  const [cacheMaxSize, setCacheMaxSize] = useState(500)
  const [mulesoftActive, setMulesoftActive] = useState(true)
  const [boomiActive, setBoomiActive] = useState(true)
  const [statStatus, setStatStatus] = useState<string>('--')
  const [statLastCheck, setStatLastCheck] = useState<string>('--')

  // ── load ────────────────────────────────────────────────────────────────

  const { data: settings } = useQuery<TransformSettings>({
    queryKey: ['transform-settings'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; settings: TransformSettings }>(
        '/Admin/GetTransformServiceSettings',
      )
      return res.data.settings
    },
  })

  useEffect(() => {
    if (!settings) return
    setEnabled(settings.enabled !== false)
    if (settings.healthCheckUrl) setHealthCheckUrl(settings.healthCheckUrl)
    if (settings.solaceHost) setSolaceHost(settings.solaceHost)
    if (settings.solaceVpn) setSolaceVpn(settings.solaceVpn)
    if (settings.solaceUsername) setSolaceUsername(settings.solaceUsername)
    if (settings.solacePassword) setSolacePassword(settings.solacePassword)
    if (settings.inputTopic) setInputTopic(settings.inputTopic)
    if (settings.inputQueue) setInputQueue(settings.inputQueue)
    if (settings.outputTopic) setOutputTopic(settings.outputTopic)
    if (settings.deadLetterTopic) setDeadLetterTopic(settings.deadLetterTopic)
    setPublisherEnabled(settings.publisherEnabled !== false)
    if (settings.cacheTtlMinutes) setCacheTtlMinutes(settings.cacheTtlMinutes)
    if (settings.cacheMaxSize) setCacheMaxSize(settings.cacheMaxSize)
    if (settings.connectorStrategies) {
      setMulesoftActive(settings.connectorStrategies.mulesoft !== false)
      setBoomiActive(settings.connectorStrategies.boomi !== false)
    }
  }, [settings])

  // ── save helper ──────────────────────────────────────────────────────────

  function post(payload: object, label: string) {
    apiClient.post<{ success: boolean; message?: string }>('/Admin/SaveTransformServiceSettings', payload)
      .then(r => {
        const d = r.data
        setNotify({ msg: d.success ? label + ' saved.' : (d.message ?? 'Save failed.'), type: d.success ? 'success' : 'error' })
        setTimeout(() => setNotify(null), 2500)
      })
      .catch(() => {
        setNotify({ msg: 'Failed to save ' + label.toLowerCase() + '.', type: 'error' })
        setTimeout(() => setNotify(null), 3000)
      })
  }

  // ── toggle ────────────────────────────────────────────────────────────────

  function handleToggle(val: boolean) {
    setEnabled(val)
    apiClient.post('/Admin/SaveTransformServiceSettings', { enabled: val })
      .then(() => setNotify({ msg: val ? 'Transform Service enabled.' : 'Transform Service paused — messages will be dropped.', type: val ? 'success' : 'warning' }))
      .catch(() => { setEnabled(!val); setNotify({ msg: 'Failed to save toggle.', type: 'error' }) })
    setTimeout(() => setNotify(null), 3000)
  }

  // ── connector toggle ─────────────────────────────────────────────────────

  function toggleConnector(name: 'mulesoft' | 'boomi') {
    const newState = name === 'mulesoft' ? !mulesoftActive : !boomiActive
    if (name === 'mulesoft') setMulesoftActive(newState)
    else setBoomiActive(newState)
    apiClient.post<{ success: boolean; message?: string }>('/Admin/ToggleConnectorStrategy', { connector: name, enabled: newState })
      .then(r => {
        if (!r.data.success) {
          if (name === 'mulesoft') setMulesoftActive(!newState)
          else setBoomiActive(!newState)
          setNotify({ msg: r.data.message ?? 'Toggle failed.', type: 'error' })
        } else {
          const label = name.charAt(0).toUpperCase() + name.slice(1)
          setNotify({ msg: label + (newState ? ' connector enabled.' : ' connector disabled.'), type: newState ? 'success' : 'warning' })
        }
        setTimeout(() => setNotify(null), 2500)
      })
  }

  // ── health test ──────────────────────────────────────────────────────────

  function testHealth() {
    setStatStatus('…')
    apiClient.post<{ success: boolean }>('/Admin/TestTransformServiceHealth')
      .then(r => {
        setStatStatus(r.data.success ? 'UP' : 'DOWN')
        setStatLastCheck(new Date().toLocaleTimeString())
      })
      .catch(() => {
        setStatStatus('ERROR')
        setStatLastCheck(new Date().toLocaleTimeString())
      })
  }

  // ── tab nav ───────────────────────────────────────────────────────────────

  const tabs: Array<{ key: 'service' | 'solace' | 'engine'; label: string }> = [
    { key: 'service', label: 'Service' },
    { key: 'solace',  label: 'Solace' },
    { key: 'engine',  label: 'Transform Engine' },
  ]

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(46,134,193,.25)' : 'rgba(255,255,255,.05)',
    border: `1px solid ${active ? 'rgba(46,134,193,.5)' : 'rgba(46,134,193,.2)'}`,
    borderBottom: 'none',
    borderRadius: '8px 8px 0 0',
    padding: '10px 20px',
    color: active ? '#FFFFFF' : '#BDC3C7',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    marginRight: 4,
  })

  const connectorBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(16,185,129,.15)' : 'rgba(148,163,184,.1)',
    color: active ? '#10B981' : '#94A3B8',
    border: `1px solid ${active ? 'rgba(16,185,129,.3)' : 'rgba(148,163,184,.25)'}`,
    padding: '3px 14px',
    borderRadius: 12,
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all .2s',
  })

  const statusColor = statStatus === 'UP' ? '#10B981' : statStatus === 'DOWN' || statStatus === 'ERROR' ? '#EF4444' : '#3B82F6'

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Toast */}
      {notify && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: notify.type === 'success' ? '#1E8449' : notify.type === 'warning' ? '#b7770d' : '#922b21',
          color: '#fff', padding: '10px 20px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.4)',
          fontSize: 13, fontWeight: 500,
        }}>
          {notify.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-3">
        <a
          href="#"
          onClick={e => { e.preventDefault(); window.history.back() }}
          style={{ color: '#94A3B8', textDecoration: 'none', fontSize: '0.9rem' }}
        >
          <i className="fas fa-arrow-left me-1" />Back
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h2 style={{ color: '#FFFFFF', marginBottom: 4 }}>
            <i className="fas fa-exchange-alt me-2" style={{ color: '#3B82F6' }} />Transform Service
          </h2>
          <p style={{ color: '#94A3B8', margin: 0 }}>
            Configure message routing, rule engine, and Solace topology for the BizibilityHub Transform Service.
          </p>
        </div>
        <span style={{ color: '#3B82F6', fontSize: '0.82rem' }}>
          <i className="fas fa-server me-1" />BizibilityHub-Transform-Service (Java 17 / Spring Boot)
        </span>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(46,134,193,.3)', marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SERVICE TAB ─────────────────────────────────────────────────────── */}
      {tab === 'service' && (
        <>
          {/* Kill switch */}
          <div style={{
            ...configCard,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 20, flexWrap: 'wrap',
            borderColor: enabled ? 'rgba(16,185,129,.45)' : 'rgba(245,158,11,.55)',
          }}>
            <div>
              <h4 style={{ color: '#FFF', margin: '0 0 6px', border: 'none', padding: 0, fontWeight: 600 }}>
                <i className="fas fa-power-off me-2" style={{ color: '#3B82F6' }} />
                {enabled ? 'Transform Service enabled' : 'Transform Service paused'}
              </h4>
              <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: 0, maxWidth: 640 }}>
                When disabled the service keeps running but drops all messages from{' '}
                <strong style={{ color: '#10B981' }}>CONNECTOR/RAW</strong> without processing them.
                Use this during rule updates or connector onboarding to avoid partial transformations.
                The flag is re-read on every message cycle.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#94A3B8', fontSize: 13 }}>OFF</span>
              <button
                onClick={() => handleToggle(!enabled)}
                style={{
                  width: 56, height: 28, borderRadius: 14,
                  background: enabled ? '#10B981' : '#64748B',
                  border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 4,
                  left: enabled ? 'calc(100% - 24px)' : 4,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', transition: 'left .2s',
                }} />
              </button>
              <span style={{ color: '#94A3B8', fontSize: 13 }}>ON</span>
            </div>
          </div>

          {/* Health stats */}
          <div style={configCard}>
            <h4 style={{ color: '#FFF', marginBottom: 20, paddingBottom: 10, borderBottom: '2px solid rgba(46,134,193,.4)', fontWeight: 600 }}>
              <i className="fas fa-heartbeat me-2" style={{ color: '#3B82F6' }} />Service Health
            </h4>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                { id: 'status', label: 'Status', value: statStatus, color: statusColor },
                { id: 'lastCheck', label: 'Last Check', value: statLastCheck, color: '#FFF' },
                { id: 'inputTopic', label: 'Input Topic', value: 'CONNECTOR/RAW', color: '#FFF' },
                { id: 'outputTopic', label: 'Output Topic', value: 'BIZIBILITY/INGESTION/PROCESSED', color: '#FFF' },
              ].map(s => (
                <div key={s.id} style={{ flex: 1, minWidth: 140, padding: 15, background: 'rgba(255,255,255,.05)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: s.id === 'outputTopic' ? '0.9rem' : '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '0.85rem', color: '#BDC3C7', marginTop: 5 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button style={btnSave} onClick={testHealth}>
                <i className="fas fa-vial me-1" />Test Health
              </button>
            </div>
          </div>

          {/* Service settings */}
          <div style={configCard}>
            <h4 style={{ color: '#FFF', marginBottom: 20, paddingBottom: 10, borderBottom: '2px solid rgba(46,134,193,.4)', fontWeight: 600 }}>
              <i className="fas fa-cog me-2" style={{ color: '#3B82F6' }} />Service Settings
            </h4>
            <FormField label="Health Check URL">
              <input
                style={inputStyle}
                value={healthCheckUrl}
                onChange={e => setHealthCheckUrl(e.target.value)}
                placeholder="http://bizibility-transform-service/actuator/health"
              />
            </FormField>
            <div style={{ textAlign: 'right' }}>
              <button style={btnSave} onClick={() => post({ healthCheckUrl }, 'Service settings')}>
                <i className="fas fa-save me-1" />Save
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SOLACE TAB ──────────────────────────────────────────────────────── */}
      {tab === 'solace' && (
        <div className="row g-3">
          {/* Consumer */}
          <div className="col-md-6">
            <div style={configCard}>
              <h4 style={{ color: '#FFF', marginBottom: 20, paddingBottom: 10, borderBottom: '2px solid rgba(46,134,193,.4)', fontWeight: 600 }}>
                <i className="fas fa-download me-2" style={{ color: '#3B82F6' }} />Consumer (Pollers → Transform)
              </h4>
              <p>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: 'rgba(16,185,129,.12)', color: '#10B981', border: '1px solid rgba(16,185,129,.3)' }}>
                  <i className="fas fa-arrow-down" />Input: CONNECTOR/RAW
                </span>
              </p>
              <FormField label="Solace Host">
                <input style={inputStyle} value={solaceHost} onChange={e => setSolaceHost(e.target.value)} placeholder="tcps://mr-connection.messaging.solace.cloud:55443" autoComplete="off" />
              </FormField>
              <FormField label="VPN Name">
                <input style={inputStyle} value={solaceVpn} onChange={e => setSolaceVpn(e.target.value)} autoComplete="off" />
              </FormField>
              <FormField label="Username">
                <input style={inputStyle} value={solaceUsername} onChange={e => setSolaceUsername(e.target.value)} autoComplete="off" />
              </FormField>
              <FormField label="Password">
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...inputStyle, paddingRight: 40 }}
                    type={showPassword ? 'text' : 'password'}
                    value={solacePassword}
                    onChange={e => setSolacePassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </FormField>
              <FormField label="Input Topic (use / as separator)">
                <input style={inputStyle} value={inputTopic} onChange={e => setInputTopic(e.target.value)} autoComplete="off" />
              </FormField>
              <FormField label="Input Queue (use . as separator)">
                <input style={inputStyle} value={inputQueue} onChange={e => setInputQueue(e.target.value)} autoComplete="off" placeholder="CONNECTOR.RAW.queue" />
              </FormField>
              <div style={{ textAlign: 'right' }}>
                <button style={btnSave} onClick={() => post({ solaceHost, solaceVpn, solaceUsername, solacePassword, inputTopic, inputQueue }, 'Consumer settings')}>
                  <i className="fas fa-save me-1" />Save Consumer
                </button>
              </div>
            </div>
          </div>

          {/* Publisher */}
          <div className="col-md-6">
            <div style={configCard}>
              <h4 style={{ color: '#FFF', marginBottom: 20, paddingBottom: 10, borderBottom: '2px solid rgba(46,134,193,.4)', fontWeight: 600 }}>
                <i className="fas fa-upload me-2" style={{ color: '#3B82F6' }} />Publisher (Transform → Ingestion)
              </h4>
              <p>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: 'rgba(245,158,11,.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,.3)' }}>
                  <i className="fas fa-arrow-up" />Output: BIZIBILITY/INGESTION/PROCESSED
                </span>
              </p>
              <FormField label="Output Topic">
                <input style={inputStyle} value={outputTopic} onChange={e => setOutputTopic(e.target.value)} autoComplete="off" />
              </FormField>
              <FormField label="Dead Letter Topic">
                <input style={inputStyle} value={deadLetterTopic} onChange={e => setDeadLetterTopic(e.target.value)} autoComplete="off" />
              </FormField>
              <FormField label="Publisher Enabled">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#94A3B8', fontSize: 13 }}>OFF</span>
                  <button
                    onClick={() => setPublisherEnabled(!publisherEnabled)}
                    style={{ width: 56, height: 28, borderRadius: 14, background: publisherEnabled ? '#10B981' : '#64748B', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s' }}
                  >
                    <span style={{ position: 'absolute', top: 4, left: publisherEnabled ? 'calc(100% - 24px)' : 4, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                  </button>
                  <span style={{ color: '#94A3B8', fontSize: 13 }}>ON</span>
                </div>
              </FormField>
              <div style={{ textAlign: 'right' }}>
                <button style={btnSave} onClick={() => post({ outputTopic, deadLetterTopic, publisherEnabled }, 'Publisher settings')}>
                  <i className="fas fa-save me-1" />Save Publisher
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ENGINE TAB ──────────────────────────────────────────────────────── */}
      {tab === 'engine' && (
        <>
          <div className="row g-3">
            {/* Cache */}
            <div className="col-md-6">
              <div style={configCard}>
                <h4 style={{ color: '#FFF', marginBottom: 20, paddingBottom: 10, borderBottom: '2px solid rgba(46,134,193,.4)', fontWeight: 600 }}>
                  <i className="fas fa-brain me-2" style={{ color: '#3B82F6' }} />Rule Engine Cache
                </h4>
                <FormField label="Cache TTL (minutes)">
                  <input type="number" min={1} max={60} value={cacheTtlMinutes} onChange={e => setCacheTtlMinutes(+e.target.value)} style={inputStyle} />
                </FormField>
                <FormField label="Max Cache Size (entries)">
                  <input type="number" min={100} max={5000} step={100} value={cacheMaxSize} onChange={e => setCacheMaxSize(+e.target.value)} style={inputStyle} />
                </FormField>
                <div style={{ textAlign: 'right' }}>
                  <button style={btnSave} onClick={() => post({ cacheTtlMinutes, cacheMaxSize }, 'Cache settings')}>
                    <i className="fas fa-save me-1" />Save Cache Settings
                  </button>
                </div>
              </div>
            </div>

            {/* Active connectors */}
            <div className="col-md-6">
              <div style={configCard}>
                <h4 style={{ color: '#FFF', marginBottom: 20, paddingBottom: 10, borderBottom: '2px solid rgba(46,134,193,.4)', fontWeight: 600 }}>
                  <i className="fas fa-sitemap me-2" style={{ color: '#3B82F6' }} />Active Connector Strategies
                </h4>
                <p style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: 16 }}>
                  Strategies registered at startup, matched by the{' '}
                  <code style={{ color: '#3B82F6' }}>connector_type</code> field in each incoming payload.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { name: 'mulesoft' as const, label: 'MuleSoft', icon: 'fa-cloud', matches: ['mulesoft', 'amc'], active: mulesoftActive },
                    { name: 'boomi' as const,    label: 'Boomi',    icon: 'fa-atom',  matches: ['boomi'],           active: boomiActive },
                  ].map(c => (
                    <div key={c.name} style={{ background: 'rgba(255,255,255,.05)', borderRadius: 8, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ color: '#FFF', fontWeight: 600, marginBottom: 4 }}>
                          <i className={`fas ${c.icon} me-2`} style={{ color: '#3B82F6' }} />{c.label}
                        </div>
                        <div style={{ color: '#94A3B8', fontSize: '0.8rem' }}>
                          Matches:{' '}
                          {c.matches.map(m => (
                            <code key={m} style={{ color: '#10B981', marginRight: 4 }}>{m}</code>
                          ))}
                        </div>
                      </div>
                      <button
                        style={connectorBtnStyle(c.active)}
                        onClick={() => toggleConnector(c.name)}
                        title="Click to enable / disable this connector"
                      >
                        <i className="fas fa-circle me-1" style={{ fontSize: '0.55rem', verticalAlign: 'middle' }} />
                        {c.active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Database connection */}
          <div style={configCard}>
            <h4 style={{ color: '#FFF', marginBottom: 20, paddingBottom: 10, borderBottom: '2px solid rgba(46,134,193,.4)', fontWeight: 600 }}>
              <i className="fas fa-database me-2" style={{ color: '#3B82F6' }} />Database Connection (Read-Only)
            </h4>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: 16 }}>
              The Transform Service reads{' '}
              <Link to="/orchestration/connectors" style={{ color: '#3B82F6', textDecoration: 'none', fontWeight: 600 }}>Connectors</Link>,{' '}
              <Link to="/orchestration/mappings" style={{ color: '#3B82F6', textDecoration: 'none', fontWeight: 600 }}>Action Templates</Link>, and{' '}
              <Link to="/orchestration/rules" style={{ color: '#3B82F6', textDecoration: 'none', fontWeight: 600 }}>Decision Rules</Link>{' '}
              from the GTekMonitoring database.
            </p>
            <div className="row g-3">
              <div className="col-md-4">
                <FormField label="Database Host">
                  <input style={{ ...inputStyle, opacity: .7, cursor: 'not-allowed' }} value="postgres:5432" readOnly />
                </FormField>
              </div>
              <div className="col-md-4">
                <FormField label="Database Name">
                  <input style={{ ...inputStyle, opacity: .7, cursor: 'not-allowed' }} value="GTekMonitoring" readOnly />
                </FormField>
              </div>
              <div className="col-md-4">
                <FormField label="Access Mode">
                  <input style={{ ...inputStyle, opacity: .7, cursor: 'not-allowed' }} value="Read-Only" readOnly />
                </FormField>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
