import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

interface QueryPattern {
  id: number
  pattern: string
  sqlPreview: string
  usageCount: number
  lastUsed: string | null
  isActive: boolean
  hasCountryError: boolean
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`badge ${active ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: 11 }}>{active ? 'Active' : 'Inactive'}</span>
}

function IssueBadge({ hasError }: { hasError: boolean }) {
  return hasError
    ? <span className="badge bg-danger" style={{ fontSize: 11 }}><i className="fas fa-exclamation-triangle me-1" />Bad SQL</span>
    : <span className="badge bg-success" style={{ fontSize: 11 }}><i className="fas fa-check me-1" />OK</span>
}

export default function AIAdminPage() {
  const qc = useQueryClient()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const { data, isFetching, refetch } = useQuery<{ success: boolean; patterns: QueryPattern[]; error?: string }>({
    queryKey: ['aiAdmin', 'patterns'],
    queryFn: () => apiClient.get('/AIAdmin/GetQueryPatterns').then(r => r.data),
  })

  const patterns = data?.patterns ?? []
  const activeCount = patterns.filter(p => p.isActive).length

  const clearAll = async () => {
    if (!confirm('Are you sure you want to deactivate ALL query patterns? This will force the AI to generate fresh SQL for all queries.')) return
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>('/AIAdmin/ClearAllQueryPatterns')
      showToast(res.data.message ?? 'All patterns deactivated', res.data.success)
      qc.invalidateQueries({ queryKey: ['aiAdmin', 'patterns'] })
    } catch {
      showToast('Error clearing patterns', false)
    }
  }

  const deactivate = async (id: number) => {
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>('/AIAdmin/DeactivatePattern', new URLSearchParams({ id: String(id) }))
      showToast(res.data.message ?? 'Pattern deactivated', res.data.success)
      qc.invalidateQueries({ queryKey: ['aiAdmin', 'patterns'] })
    } catch {
      showToast('Error deactivating pattern', false)
    }
  }

  const card: React.CSSProperties = {
    background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)',
    borderRadius: 12, padding: 24, marginBottom: 24,
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? '#22c55e' : '#ef4444', color: '#fff',
          borderRadius: 8, padding: '12px 20px', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <i className={`fas fa-${toast.ok ? 'check-circle' : 'exclamation-circle'}`} />
          {toast.msg}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-robot me-2 text-primary" />AI Query Pattern Management
          </h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>
            Manage cached SQL templates that speed up common AI queries.
          </p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => void refetch()} disabled={isFetching}>
            <i className={`fas fa-sync me-2 ${isFetching ? 'fa-spin' : ''}`} />Refresh
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => void clearAll()} disabled={isFetching}>
            <i className="fas fa-trash me-2" />Deactivate All Patterns
          </button>
        </div>
      </div>

      <div style={card}>
        <div className="alert" style={{ background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 8, marginBottom: 20 }}>
          <h6 className="text-white mb-1"><i className="fas fa-info-circle me-2" />About Query Patterns</h6>
          <p className="text-muted mb-1" style={{ fontSize: 13 }}>
            Query patterns are cached SQL templates that speed up common queries. If patterns contain errors they can cause query failures.
          </p>
          <p className="text-muted mb-0" style={{ fontSize: 13 }}>
            <strong className="text-white">Common Issue:</strong> Patterns referencing <code>t.Country</code> instead of joining with <code>Countries c</code> table will fail.
          </p>
        </div>

        <div className="d-flex align-items-center mb-3">
          <h6 className="text-white mb-0 me-2">Active Patterns:</h6>
          <span className="badge bg-primary">{isFetching ? '…' : activeCount}</span>
        </div>

        {patterns.length === 0 && !isFetching ? (
          <div className="alert alert-success" style={{ fontSize: 14 }}>
            <i className="fas fa-check-circle me-2" />No active patterns found. All queries will generate fresh SQL.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(46,134,193,.15)' }}>
                  {['ID', 'Pattern', 'SQL Preview', 'Usage Count', 'Last Used', 'Status', 'Issues', 'Actions'].map(h => (
                    <th key={h} style={{ color: '#93c5fd', border: 'none', padding: '10px 12px', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isFetching ? (
                  <tr><td colSpan={8} className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary me-2" />Loading…</td></tr>
                ) : patterns.map(p => (
                  <tr key={p.id} style={{ background: p.hasCountryError ? 'rgba(239,68,68,.1)' : undefined }}>
                    <td style={{ color: '#e2e8f0' }}>{p.id}</td>
                    <td style={{ color: '#94a3b8', maxWidth: 200 }}><small>{p.pattern}</small></td>
                    <td><code style={{ fontSize: 11, color: '#60a5fa' }}>{p.sqlPreview}</code></td>
                    <td style={{ color: '#e2e8f0' }}>{p.usageCount}</td>
                    <td style={{ color: '#94a3b8' }}><small>{p.lastUsed ? new Date(p.lastUsed).toLocaleString() : 'Never'}</small></td>
                    <td><StatusBadge active={p.isActive} /></td>
                    <td><IssueBadge hasError={p.hasCountryError} /></td>
                    <td>
                      {p.isActive && (
                        <button className="btn btn-sm btn-danger" onClick={() => void deactivate(p.id)}>
                          <i className="fas fa-ban me-1" />Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
