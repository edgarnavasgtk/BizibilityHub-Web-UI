import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

// ── types ─────────────────────────────────────────────────────────────────────

interface RetentionSettings {
  transactionRetentionDays: number
  aggregatedRetentionDays: number
  scheduleHour: number
  scheduleMinute: number
  isEnabled: boolean
  updatedAt?: string
  updatedBy?: string
}

interface DbStats {
  txSize: number
  journeyRows: number
  activeChunks: number
}

interface RetentionLog {
  executedAt: string
  triggerSource: string
  transactionRetentionApplied: number
  aggregatedRetentionApplied: number
  journeyRowsDeleted: number
  durationMs: number
  status: string
  errorMessage?: string
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let b = bytes
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++ }
  return b.toFixed(1) + ' ' + units[i]
}

// ── styles ────────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: '#1E293B',
  border: '1px solid rgba(46,134,193,.2)',
  borderRadius: 12,
  padding: '24px 28px',
  marginBottom: 20,
  boxShadow: '0 4px 16px rgba(0,0,0,.5)',
}

const inputStyle: React.CSSProperties = {
  background: '#0F172A',
  border: '1px solid rgba(46,134,193,.5)',
  color: '#FFFFFF',
  fontSize: 15,
  fontWeight: 600,
  padding: '8px 12px',
  borderRadius: 6,
  width: '100%',
}

const fieldRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '240px 160px 1fr',
  gap: 16,
  alignItems: 'center',
  marginBottom: 12,
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DataRetentionPage() {
  const [txDays, setTxDays] = useState(30)
  const [aggDays, setAggDays] = useState(365)
  const [schedHour, setSchedHour] = useState(2)
  const [schedMin, setSchedMin] = useState(0)
  const [isEnabled, setIsEnabled] = useState(true)
  const [statusMsg, setStatusMsg] = useState<{ msg: string; ok: boolean } | null>(null)
  const [running, setRunning] = useState(false)

  // ── load settings ──────────────────────────────────────────────────────────

  const { data: settings } = useQuery<RetentionSettings>({
    queryKey: ['data-retention', 'settings'],
    queryFn: async () => {
      const res = await apiClient.get<RetentionSettings>('/Settings/DataRetention/Get')
      return res.data
    },
  })

  useEffect(() => {
    if (settings) {
      setTxDays(settings.transactionRetentionDays)
      setAggDays(settings.aggregatedRetentionDays)
      setSchedHour(settings.scheduleHour)
      setSchedMin(settings.scheduleMinute)
      setIsEnabled(settings.isEnabled)
    }
  }, [settings])

  // ── db stats ───────────────────────────────────────────────────────────────

  const { data: stats } = useQuery<DbStats>({
    queryKey: ['data-retention', 'stats'],
    queryFn: async () => {
      const res = await apiClient.get<DbStats>('/Settings/DataRetention/DbStats')
      return res.data
    },
  })

  // ── logs ───────────────────────────────────────────────────────────────────

  const { data: logs = [], refetch: refetchLogs } = useQuery<RetentionLog[]>({
    queryKey: ['data-retention', 'logs'],
    queryFn: async () => {
      const res = await apiClient.get<RetentionLog[]>('/Settings/DataRetention/Logs')
      return res.data
    },
  })

  // ── save ───────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ success: boolean; message?: string }>(
        '/Settings/DataRetention/Save',
        { transactionRetentionDays: txDays, aggregatedRetentionDays: aggDays, scheduleHour: schedHour, scheduleMinute: schedMin, isEnabled },
      )
      return res.data
    },
    onSuccess: (r) => {
      setStatusMsg({ msg: r.success ? 'Settings saved.' : (r.message ?? 'Error saving.'), ok: !!r.success })
      setTimeout(() => setStatusMsg(null), 5000)
    },
    onError: () => {
      setStatusMsg({ msg: 'Network error.', ok: false })
      setTimeout(() => setStatusMsg(null), 5000)
    },
  })

  // ── run now ────────────────────────────────────────────────────────────────

  async function runNow() {
    setRunning(true)
    try {
      const res = await apiClient.post<{ success: boolean; message?: string; log?: { journeyRowsDeleted: number } }>(
        '/Settings/DataRetention/RunNow',
      )
      if (res.data.success) {
        setStatusMsg({ msg: `Run complete. Journey rows deleted: ${res.data.log?.journeyRowsDeleted ?? 0}`, ok: true })
        refetchLogs()
      } else {
        setStatusMsg({ msg: res.data.message ?? 'Run failed.', ok: false })
      }
    } catch {
      setStatusMsg({ msg: 'Network error.', ok: false })
    }
    setTimeout(() => setStatusMsg(null), 5000)
    setRunning(false)
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Header */}
      <div className="mb-4">
        <h1 className="h3 text-white mb-1">
          <i className="fas fa-database me-2" />Data Retention
        </h1>
        <p className="text-muted mb-0" style={{ fontSize: 14 }}>
          Configure automatic cleanup policies for transaction and aggregated data.
        </p>
      </div>

      {/* Config section */}
      <div style={sectionStyle}>
        <h4 style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Retention Configuration</h4>
        <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 18 }}>
          Policies are applied daily at the scheduled time. TimescaleDB chunk-dropping is used for Transactions; direct DELETE for flat tables.
        </p>

        <div style={fieldRow}>
          <label style={{ color: '#E2E8F0', fontSize: 14, margin: 0 }}>Transactions retention</label>
          <input type="number" min={7} max={365} value={txDays} onChange={e => setTxDays(+e.target.value)} style={inputStyle} />
          <span style={{ color: '#64748B', fontSize: 12 }}>days (7 – 365)</span>
        </div>

        <div style={fieldRow}>
          <label style={{ color: '#E2E8F0', fontSize: 14, margin: 0 }}>
            Aggregated data retention <small style={{ color: '#64748B' }}>(fact_* + caggs)</small>
          </label>
          <input type="number" min={30} max={1825} value={aggDays} onChange={e => setAggDays(+e.target.value)} style={inputStyle} />
          <span style={{ color: '#64748B', fontSize: 12 }}>days (30 – 1825)</span>
        </div>

        <div style={{ ...fieldRow, marginTop: 18 }}>
          <label style={{ color: '#E2E8F0', fontSize: 14, margin: 0 }}>Daily execution time (UTC)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" min={0} max={23} value={schedHour} onChange={e => setSchedHour(+e.target.value)}
              style={{ ...inputStyle, width: 75 }} />
            <span style={{ color: '#94A3B8', fontSize: 18, fontWeight: 700 }}>:</span>
            <input type="number" min={0} max={59} value={schedMin} onChange={e => setSchedMin(+e.target.value)}
              style={{ ...inputStyle, width: 75 }} />
          </div>
          <span style={{ color: '#64748B', fontSize: 12 }}>HH : MM</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, marginBottom: 20 }}>
          <input
            className="form-check-input"
            type="checkbox"
            id="isEnabled"
            checked={isEnabled}
            onChange={e => setIsEnabled(e.target.checked)}
            style={{ width: '1.2em', height: '1.2em', cursor: 'pointer' }}
          />
          <label htmlFor="isEnabled" style={{ color: '#E2E8F0', fontSize: 14, margin: 0 }}>
            Enable daily automatic run
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <button
            style={{ background: 'linear-gradient(135deg,#2E86C1,#1A5276)', color: '#FFF', border: 'none', padding: '10px 28px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </button>
          <button
            style={{ background: 'linear-gradient(135deg,#1E8449,#145A32)', color: '#FFF', border: 'none', padding: '10px 24px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: running ? 'default' : 'pointer', opacity: running ? .5 : 1 }}
            disabled={running}
            onClick={runNow}
          >
            {running
              ? <><i className="fas fa-spinner fa-spin me-1" />Running…</>
              : <><i className="fas fa-play me-1" />Run Now</>
            }
          </button>
          {statusMsg && (
            <span style={{ color: statusMsg.ok ? '#27AE60' : '#E74C3C', fontSize: 13, marginLeft: 4 }}>
              {statusMsg.msg}
            </span>
          )}
        </div>

        {settings?.updatedAt && settings.updatedBy && (
          <p style={{ marginTop: 14, color: '#64748B', fontSize: 12 }}>
            Last saved {settings.updatedAt} UTC by {settings.updatedBy}
          </p>
        )}
      </div>

      {/* DB Stats */}
      <div style={sectionStyle}>
        <h4 style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Current Database State</h4>
        <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16 }}>Live metrics from GTekMonitoring. Refreshes on page load.</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Transactions size', value: stats ? formatBytes(stats.txSize) : '—' },
            { label: 'fact_e2e_journey rows', value: stats ? Number(stats.journeyRows).toLocaleString() : '—' },
            { label: 'Active chunks (TimescaleDB)', value: stats ? Number(stats.activeChunks).toLocaleString() : '—' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, minWidth: 180, background: '#0F172A', border: '1px solid rgba(46,134,193,.2)', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ color: '#94A3B8', fontSize: 12, textTransform: 'uppercase', letterSpacing: .5 }}>{s.label}</div>
              <div style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 700, marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Execution History */}
      <div style={sectionStyle}>
        <h4 style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Execution History</h4>
        <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16 }}>
          Last 20 runs.{' '}
          <button onClick={() => refetchLogs()} style={{ background: 'none', border: 'none', color: '#60A5FA', cursor: 'pointer', padding: 0, fontSize: 13 }}>
            Refresh
          </button>
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date (UTC)', 'Trigger', 'Tx days', 'Agg days', 'Journey deleted', 'Duration', 'Status'].map(h => (
                <th key={h} style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: .5, fontWeight: 600, padding: '10px 12px', borderBottom: '1px solid rgba(46,134,193,.2)', textAlign: 'left' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: '#64748B', fontSize: 13, textAlign: 'center', padding: 24 }}>
                  No runs recorded yet.
                </td>
              </tr>
            ) : logs.map((log, i) => {
              const dt = new Date(log.executedAt).toISOString().replace('T', ' ').substring(0, 16)
              return (
                <tr key={i}>
                  <td style={{ color: '#E2E8F0', fontSize: 13, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{dt}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    {log.triggerSource === 'Manual'
                      ? <span style={{ background: 'rgba(230,126,34,.2)', color: '#E67E22', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Manual</span>
                      : <span style={{ background: 'rgba(46,134,193,.2)', color: '#3498DB', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>Scheduled</span>
                    }
                  </td>
                  <td style={{ color: '#E2E8F0', fontSize: 13, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    {log.transactionRetentionApplied > 0 ? log.transactionRetentionApplied : '—'}
                  </td>
                  <td style={{ color: '#E2E8F0', fontSize: 13, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    {log.aggregatedRetentionApplied > 0 ? log.aggregatedRetentionApplied : '—'}
                  </td>
                  <td style={{ color: '#E2E8F0', fontSize: 13, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    {log.status === 'Success' ? log.journeyRowsDeleted.toLocaleString() : '—'}
                  </td>
                  <td style={{ color: '#E2E8F0', fontSize: 13, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    {log.durationMs > 0 ? log.durationMs.toLocaleString() + ' ms' : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    {log.status === 'Success'
                      ? <span style={{ background: 'rgba(39,174,96,.2)', color: '#27AE60', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>Success</span>
                      : log.status === 'Error'
                        ? <span title={log.errorMessage} style={{ background: 'rgba(231,76,60,.2)', color: '#E74C3C', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>Error</span>
                        : <span style={{ background: 'rgba(149,165,166,.2)', color: '#95A5A6', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{log.status}</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
