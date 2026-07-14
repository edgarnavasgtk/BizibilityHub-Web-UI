import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

interface Combination {
  businessSegment: string
  businessProcess: string
  businessSubprocess: string | null
  businessProcessStage: string | null
  originalLoggerSystem: string
  originalSourceSystem: string
  originalTargetSystem: string
  loggerSystem: string
  sourceSystem: string
  targetSystem: string
  messageId: string
}

interface SearchResponse {
  success: boolean
  data?: Combination[]
  message?: string
  matchedField?: string
  transactionCount?: number
  uniqueCombinations?: number
  error?: string
}

interface RowEdit {
  newLoggerSystem: string
  newSourceSystem: string
  newTargetSystem: string
  dirty: boolean
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(15,23,42,.85)',
  border: '1px solid rgba(46,134,193,.3)',
  color: '#F1F5F9',
  borderRadius: 6,
  padding: '5px 8px',
  fontSize: 12,
  width: '100%',
  fontFamily: 'inherit',
}

const cellStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid rgba(46,134,193,.15)',
  verticalAlign: 'middle',
  fontSize: 12,
  color: '#CBD5E1',
}

export default function TranslationRuleBuilderPage() {
  const [messageId, setMessageId] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null)
  const [rows, setRows] = useState<RowEdit[]>([])
  const [savedOk, setSavedOk] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageId.trim()) return
    setSearching(true)
    setSavedOk(false)
    try {
      const res = await apiClient.get<SearchResponse>('/TranslationRules/GetTransactionByMessageId', {
        params: { messageId: messageId.trim() },
      })
      const data = res.data
      setSearchResult(data)
      if (data.success && data.data) {
        setRows(data.data.map(c => ({
          newLoggerSystem: c.loggerSystem,
          newSourceSystem: c.sourceSystem,
          newTargetSystem: c.targetSystem,
          dirty: false,
        })))
      }
    } catch {
      setSearchResult({ success: false, error: 'Network error searching for transactions.' })
    } finally {
      setSearching(false)
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const combinations = searchResult?.data ?? []
      const pendingRules = rows
        .map((row, i) => {
          const combo = combinations[i]
          if (!combo) return null
          if (!row.dirty) return null
          return {
            businessSegment: combo.businessSegment,
            businessProcess: combo.businessProcess,
            businessSubprocess: combo.businessSubprocess ?? null,
            businessProcessStage: combo.businessProcessStage ?? null,
            newLoggerSystem: row.newLoggerSystem !== combo.originalLoggerSystem ? row.newLoggerSystem : null,
            newSourceSystem: row.newSourceSystem !== combo.originalSourceSystem ? row.newSourceSystem : null,
            newTargetSystem: row.newTargetSystem !== combo.originalTargetSystem ? row.newTargetSystem : null,
            originalLoggerSystem: combo.originalLoggerSystem,
            originalSourceSystem: combo.originalSourceSystem,
            originalTargetSystem: combo.originalTargetSystem,
          }
        })
        .filter(Boolean)
      return apiClient.post('/TranslationRules/SaveTranslationRules', { pendingRules })
    },
    onSuccess: () => {
      setSavedOk(true)
      setRows(r => r.map(row => ({ ...row, dirty: false })))
    },
  })

  const updateRow = (idx: number, field: 'newLoggerSystem' | 'newSourceSystem' | 'newTargetSystem', val: string) => {
    setRows(prev => {
      const next = [...prev]
      const combo = searchResult?.data?.[idx]
      next[idx] = {
        ...next[idx],
        [field]: val,
        dirty:
          val !== combo?.originalLoggerSystem ||
          (field !== 'newLoggerSystem' && next[idx].newLoggerSystem !== combo?.originalLoggerSystem) ||
          val !== combo?.originalSourceSystem ||
          (field !== 'newSourceSystem' && next[idx].newSourceSystem !== combo?.originalSourceSystem) ||
          val !== combo?.originalTargetSystem ||
          (field !== 'newTargetSystem' && next[idx].newTargetSystem !== combo?.originalTargetSystem),
      }
      next[idx].dirty = (
        (field === 'newLoggerSystem' ? val : next[idx].newLoggerSystem) !== (combo?.originalLoggerSystem ?? '') ||
        (field === 'newSourceSystem' ? val : next[idx].newSourceSystem) !== (combo?.originalSourceSystem ?? '') ||
        (field === 'newTargetSystem' ? val : next[idx].newTargetSystem) !== (combo?.originalTargetSystem ?? '')
      )
      return next
    })
    setSavedOk(false)
  }

  const dirtyCount = rows.filter(r => r.dirty).length
  const combinations = searchResult?.data ?? []

  return (
    <div style={{ background: 'linear-gradient(180deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)', minHeight: '100vh', padding: 24, color: '#F1F5F9' }}>
      <div className="d-flex align-items-center gap-3 mb-4">
        <Link to="/settings/translation-rules" style={{ color: '#94A3B8', textDecoration: 'none', fontSize: 13 }}>
          <i className="fas fa-arrow-left me-1" />Translation Rules
        </Link>
        <span style={{ color: '#475569' }}>/</span>
        <h2 style={{ color: '#fff', fontWeight: 700, margin: 0, fontSize: 20 }}>
          <i className="fas fa-magic me-2 text-primary" />Create Translation Rule
        </h2>
      </div>

      {/* Step 1 — Search */}
      <div style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <h5 style={{ color: '#fff', marginBottom: 4 }}>Step 1: Find a Transaction</h5>
        <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16 }}>Enter a MessageId, CorrelationId, or TransactionId to load the transaction combinations that will form the basis of the rule.</p>
        <form onSubmit={handleSearch} className="d-flex gap-2 align-items-end">
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', color: '#94A3B8', fontSize: 12, marginBottom: 4 }}>Transaction Identifier</label>
            <input
              value={messageId}
              onChange={e => setMessageId(e.target.value)}
              placeholder="MessageId / CorrelationId / TransactionId"
              style={{ ...inputStyle, padding: '10px 14px', fontSize: 14 }}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={searching} style={{ height: 42 }}>
            {searching ? <><span className="spinner-border spinner-border-sm me-1" />Searching…</> : <><i className="fas fa-search me-1" />Load</>}
          </button>
        </form>

        {searchResult && !searchResult.success && (
          <div className="alert alert-danger mt-3 mb-0 py-2" style={{ fontSize: 13 }}>
            <i className="fas fa-exclamation-circle me-1" />{searchResult.error}
          </div>
        )}

        {searchResult?.success && (
          <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 13, color: '#86efac' }}>
            <i className="fas fa-check-circle me-1" />{searchResult.message}
            <span style={{ color: '#94A3B8', marginLeft: 8 }}>Matched field: <strong style={{ color: '#93C5FD' }}>{searchResult.matchedField}</strong></span>
          </div>
        )}
      </div>

      {/* Step 2 — Edit translations */}
      {combinations.length > 0 && (
        <div style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 12, padding: 24 }}>
          <div className="d-flex justify-content-between align-items-start mb-3">
            <div>
              <h5 style={{ color: '#fff', marginBottom: 4 }}>Step 2: Set Translation Values</h5>
              <p style={{ color: '#94A3B8', fontSize: 13, margin: 0 }}>
                Edit Logger System, Source System, and Target System columns. Only modified rows will be saved as rules.
              </p>
            </div>
            {dirtyCount > 0 && (
              <span style={{ background: 'rgba(59,130,246,.15)', color: '#93C5FD', border: '1px solid rgba(59,130,246,.3)', padding: '3px 10px', borderRadius: 999, fontSize: 12 }}>
                {dirtyCount} row{dirtyCount > 1 ? 's' : ''} modified
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'rgba(46,134,193,.12)' }}>
                  {['Business Segment', 'Business Process', 'Subprocess', 'Stage',
                    'Logger System (Original)', 'Source System (Original)', 'Target System (Original)',
                    'Logger System (New)', 'Source System (New)', 'Target System (New)']
                    .map(h => (
                      <th key={h} style={{ padding: '10px', fontSize: 11, color: '#93C5FD', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid rgba(46,134,193,.3)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {combinations.map((combo, i) => {
                  const row = rows[i]
                  if (!row) return null
                  const changed = row.dirty
                  return (
                    <tr key={i} style={{ background: changed ? 'rgba(59,130,246,.07)' : 'transparent', transition: 'background .15s' }}>
                      <td style={cellStyle}>{combo.businessSegment || '—'}</td>
                      <td style={cellStyle}>{combo.businessProcess || '—'}</td>
                      <td style={cellStyle}>{combo.businessSubprocess || '—'}</td>
                      <td style={cellStyle}>{combo.businessProcessStage || '—'}</td>
                      <td style={{ ...cellStyle, color: '#6B7280', fontFamily: 'monospace', fontSize: 11 }}>{combo.originalLoggerSystem || '—'}</td>
                      <td style={{ ...cellStyle, color: '#6B7280', fontFamily: 'monospace', fontSize: 11 }}>{combo.originalSourceSystem || '—'}</td>
                      <td style={{ ...cellStyle, color: '#6B7280', fontFamily: 'monospace', fontSize: 11 }}>{combo.originalTargetSystem || '—'}</td>
                      <td style={{ ...cellStyle, minWidth: 130 }}>
                        <input
                          style={inputStyle}
                          value={row.newLoggerSystem}
                          onChange={e => updateRow(i, 'newLoggerSystem', e.target.value)}
                          placeholder={combo.originalLoggerSystem}
                        />
                      </td>
                      <td style={{ ...cellStyle, minWidth: 130 }}>
                        <input
                          style={inputStyle}
                          value={row.newSourceSystem}
                          onChange={e => updateRow(i, 'newSourceSystem', e.target.value)}
                          placeholder={combo.originalSourceSystem}
                        />
                      </td>
                      <td style={{ ...cellStyle, minWidth: 130 }}>
                        <input
                          style={inputStyle}
                          value={row.newTargetSystem}
                          onChange={e => updateRow(i, 'newTargetSystem', e.target.value)}
                          placeholder={combo.originalTargetSystem}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {saveMutation.isError && (
            <div className="alert alert-danger mt-3 mb-0 py-2" style={{ fontSize: 13 }}>
              <i className="fas fa-exclamation-circle me-1" />Failed to save rules. Please try again.
            </div>
          )}

          {savedOk && (
            <div className="alert alert-success mt-3 mb-0 py-2" style={{ fontSize: 13 }}>
              <i className="fas fa-check-circle me-1" />Rules saved successfully!
            </div>
          )}

          <div className="d-flex gap-2 justify-content-end mt-4">
            <Link to="/settings/translation-rules" className="btn btn-outline-secondary btn-sm">
              <i className="fas fa-times me-1" />Cancel
            </Link>
            <button
              className="btn btn-success btn-sm"
              disabled={dirtyCount === 0 || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending
                ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</>
                : <><i className="fas fa-save me-1" />Save {dirtyCount > 0 ? `${dirtyCount} ` : ''}Rule{dirtyCount !== 1 ? 's' : ''}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
