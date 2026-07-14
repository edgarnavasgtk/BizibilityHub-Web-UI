import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import DataGrid, { Column, FilterRow, HeaderFilter, ColumnChooser, Paging, Pager } from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'
import { getAntiForgeryToken, wasRedirected } from '../../services/csrf'

// ── types ──────────────────────────────────────────────────────────────────

interface MappingRow {
  mappingId: number
  mappingName: string
  description: string
  connectorId: number
  connectorName: string
  contentType: string
  isEnabled: boolean
  createdBy: string
  createdAt: string
  liquidTemplate: string
  pathTemplate: string
}

interface ConnectorOption {
  connectorId: number
  connectorName: string
  isEnabled: boolean
}

interface MappingForm {
  mappingId: number
  mappingName: string
  description: string
  connectorId: number | ''
  pathTemplate: string
  contentType: string
  liquidTemplate: string
  isEnabled: boolean
}

interface TestTemplateResult {
  success: boolean
  output?: string
  message?: string
}

interface Transaction {
  messageId: string
  transactionId?: string
  status?: string
  timestamp?: string
  businessProcessName?: string
  sourceSys?: string
  targetSys?: string
}

interface GetTransactionsResult {
  success: boolean
  transactions: Transaction[]
  transactionCount: number
  error?: string
}

interface TestWithTransactionResult {
  success: boolean
  originalPayload?: string
  transformedPayload?: string
  connectorUrl?: string
  messageSent?: boolean
  httpStatusCode?: number
  httpResponse?: string
  error?: string
}

// ── liquid variable groups ─────────────────────────────────────────────────

const LIQUID_VARS: { group: string; vars: string[] }[] = [
  { group: 'Transaction Core', vars: ['TransactionId','MessageId','CorrelationId','Status','Timestamp','ExecutionTimeMs'] },
  { group: 'Error Details',    vars: ['ErrorMessage','ErrorCode'] },
  { group: 'Business Context', vars: ['BusinessProcessName','BusinessSubprocessName','BrandName','BusinessSegmentName','CountryName','CountryCode'] },
  { group: 'Document Info',    vars: ['DocumentNumber','DocumentTypeName','ReferenceDocumentNumber'] },
  { group: 'Environment',      vars: ['EnvironmentName','CountryName','CountryCode'] },
  { group: 'Integration',      vars: ['SourceSystem','TargetSystem','IntegrationName','Direction'] },
]

const CONTENT_TYPES = ['application/json','application/xml','text/plain','text/html']

const BLANK_FORM: MappingForm = {
  mappingId: 0,
  mappingName: '',
  description: '',
  connectorId: '',
  pathTemplate: '',
  contentType: 'application/json',
  liquidTemplate: '',
  isEnabled: true,
}

// ── sub-components ─────────────────────────────────────────────────────────

function ContentTypeBadge({ value }: { value: string }) {
  const colors: Record<string, string> = {
    'application/json': '#3b82f6',
    'application/xml':  '#f59e0b',
    'text/plain':       '#6b7280',
    'text/html':        '#10b981',
  }
  return (
    <span className="badge" style={{ background: colors[value] ?? '#6b7280', fontSize: 10 }}>
      {value.split('/')[1].toUpperCase()}
    </span>
  )
}

// ── CreateEditModal ────────────────────────────────────────────────────────

interface CreateEditProps {
  mapping: MappingRow | null
  connectors: ConnectorOption[]
  onClose: () => void
  onSaved: () => void
}

function CreateEditModal({ mapping, connectors, onClose, onSaved }: CreateEditProps) {
  const isEdit = !!mapping
  const [form, setForm] = useState<MappingForm>(() =>
    mapping
      ? {
          mappingId: mapping.mappingId,
          mappingName: mapping.mappingName,
          description: mapping.description,
          connectorId: mapping.connectorId,
          pathTemplate: mapping.pathTemplate,
          contentType: mapping.contentType || 'application/json',
          liquidTemplate: mapping.liquidTemplate,
          isEnabled: mapping.isEnabled,
        }
      : { ...BLANK_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: keyof MappingForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
    setForm(f => ({ ...f, [field]: value }))
  }

  const insertVar = (v: string) => {
    setForm(f => ({ ...f, liquidTemplate: f.liquidTemplate + `{{ ${v} }}` }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.mappingName.trim() || !form.connectorId || !form.contentType || !form.liquidTemplate.trim()) {
      setError('MappingName, Connector, ContentType and LiquidTemplate are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const getUrl = isEdit ? `/Mappings/Edit/${form.mappingId}` : '/Mappings/Create'
      const postUrl = isEdit ? `/Mappings/Edit/${form.mappingId}` : '/Mappings/Create'
      const token = await getAntiForgeryToken(getUrl)

      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      if (isEdit) params.set('MappingId', String(form.mappingId))
      params.set('MappingName', form.mappingName.trim())
      params.set('Description', form.description)
      params.set('ConnectorId', String(form.connectorId))
      params.set('PathTemplate', form.pathTemplate)
      params.set('ContentType', form.contentType)
      params.set('LiquidTemplate', form.liquidTemplate)
      params.set('IsEnabled', form.isEnabled ? 'true' : 'false')

      const res = await apiClient.post(postUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      if (wasRedirected(res, postUrl)) {
        onSaved()
      } else {
        setError('Validation failed. Please check your input.')
      }
    } catch {
      setError('Failed to save mapping. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1055, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '2rem 1rem' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 1100, background: 'rgba(15,23,42,.98)', border: '1px solid rgba(46,134,193,.3)', borderRadius: 8 }}
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="d-flex justify-content-between align-items-center p-4 border-bottom border-secondary">
          <h5 className="text-white mb-0">
            <i className={`fas fa-${isEdit ? 'edit' : 'plus'} me-2 text-primary`} />
            {isEdit ? `Edit Mapping — ${mapping!.mappingName}` : 'Create Mapping'}
          </h5>
          <button className="btn-close btn-close-white" onClick={onClose} />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="d-flex gap-0" style={{ minHeight: 520 }}>
            {/* left: form fields */}
            <div className="p-4" style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,.08)' }}>
              {error && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>{error}</div>}

              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <label className="form-label text-white" style={{ fontSize: 13 }}>Mapping Name *</label>
                  <input className="form-control bg-dark text-white border-secondary" value={form.mappingName} onChange={set('mappingName')} required />
                </div>
                <div className="col-md-6">
                  <label className="form-label text-white" style={{ fontSize: 13 }}>Connector *</label>
                  <select className="form-select bg-dark text-white border-secondary" value={form.connectorId} onChange={set('connectorId')} required>
                    <option value="">— Select Connector —</option>
                    {connectors.map(c => (
                      <option key={c.connectorId} value={c.connectorId}>{c.connectorName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label text-white" style={{ fontSize: 13 }}>Description</label>
                <input className="form-control bg-dark text-white border-secondary" value={form.description} onChange={set('description')} />
              </div>

              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <label className="form-label text-white" style={{ fontSize: 13 }}>Content Type *</label>
                  <select className="form-select bg-dark text-white border-secondary" value={form.contentType} onChange={set('contentType')}>
                    {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label text-white" style={{ fontSize: 13 }}>Path Template</label>
                  <input className="form-control bg-dark text-white border-secondary" placeholder="/api/alerts" value={form.pathTemplate} onChange={set('pathTemplate')} />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label text-white" style={{ fontSize: 13 }}>Liquid Template *</label>
                <textarea
                  className="form-control bg-dark text-white border-secondary"
                  rows={10}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  value={form.liquidTemplate}
                  onChange={set('liquidTemplate')}
                  required
                />
                <div className="form-text text-muted" style={{ fontSize: 11 }}>Use <code>{'{{ VariableName }}'}</code> syntax.</div>
              </div>

              <div className="form-check mb-2">
                <input className="form-check-input" type="checkbox" id="chkEnabled" checked={form.isEnabled} onChange={set('isEnabled')} />
                <label className="form-check-label text-white" htmlFor="chkEnabled" style={{ fontSize: 13 }}>Enabled</label>
              </div>
            </div>

            {/* right: variable reference */}
            <div className="p-4" style={{ width: 280, flexShrink: 0, overflowY: 'auto', maxHeight: 640 }}>
              <p className="text-white fw-bold mb-2" style={{ fontSize: 13 }}>Available Variables</p>
              <p className="text-muted mb-3" style={{ fontSize: 11 }}>Click to append to template.</p>
              {LIQUID_VARS.map(g => (
                <div key={g.group} className="mb-3">
                  <p className="text-muted mb-1" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.group}</p>
                  {g.vars.map(v => (
                    <button key={v} type="button" className="badge bg-secondary me-1 mb-1 border-0 text-decoration-none" style={{ cursor: 'pointer', fontSize: 11 }} onClick={() => insertVar(v)}>
                      {v}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2 p-4 border-top border-secondary">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? <><span className="spinner-border spinner-border-sm me-2" />{isEdit ? 'Saving…' : 'Creating…'}</> : isEdit ? 'Save Changes' : 'Create Mapping'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── TestModal ──────────────────────────────────────────────────────────────

interface TestModalProps {
  mapping: MappingRow
  onClose: () => void
}

function TestModal({ mapping, onClose }: TestModalProps) {
  const [tab, setTab] = useState<'template'|'transaction'>('template')

  // Template tab
  const [tmplInput, setTmplInput] = useState('')
  const [sampleData, setSampleData] = useState('{\n  "TransactionId": "TXN-001",\n  "Status": "Error",\n  "ErrorMessage": "Sample error"\n}')
  const [tmplResult, setTmplResult] = useState<TestTemplateResult | null>(null)
  const [tmplLoading, setTmplLoading] = useState(false)

  const testTemplate = async () => {
    setTmplLoading(true)
    setTmplResult(null)
    try {
      const res = await apiClient.post<TestTemplateResult>('/Mappings/TestTemplate', {
        mappingId: mapping.mappingId,
        liquidTemplate: tmplInput || undefined,
        sampleData: sampleData,
      })
      setTmplResult(res.data)
    } catch {
      setTmplResult({ success: false, message: 'Request failed' })
    } finally {
      setTmplLoading(false)
    }
  }

  // Transaction tab
  const [timeWindow, setTimeWindow] = useState('60')
  const [filterStatus, setFilterStatus] = useState('')
  const [maxTx, setMaxTx] = useState('20')
  const [statuses, setStatuses] = useState<string[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [sendResult, setSendResult] = useState<TestWithTransactionResult | null>(null)
  const [sending, setSending] = useState(false)
  // tracks whether the transaction-tab endpoints are unavailable on the backend
  const [txEndpointError, setTxEndpointError] = useState<string | null>(null)
  const [txLoadError, setTxLoadError] = useState<string | null>(null)

  const loadStatuses = useCallback(async () => {
    try {
      const res = await apiClient.get<{ success: boolean; statuses: string[] }>('/Mappings/GetDistinctStatuses')
      if (res.data.success) {
        setStatuses(res.data.statuses)
        setTxEndpointError(null)
      }
    } catch (err: unknown) {
      // Surface a clear message if the endpoint does not exist on the backend yet
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404 || status === 405) {
        setTxEndpointError(
          'The Transaction tab endpoints (GetDistinctStatuses / GetTransactions / TestWithTransaction) are not yet implemented in the backend controller. The tab is read-only until they are available.'
        )
      }
      // Non-404 errors are silently swallowed so the tab still renders
    }
  }, [])

  // Load statuses whenever the transaction tab becomes active
  useEffect(() => {
    if (tab === 'transaction') loadStatuses()
  }, [tab, loadStatuses])

  const loadTransactions = async () => {
    setTxLoading(true)
    setTransactions([])
    setTxLoadError(null)
    try {
      const res = await apiClient.post<GetTransactionsResult>('/Mappings/GetTransactions', {
        timeWindowMinutes: Number(timeWindow),
        filterStatus: filterStatus || null,
        maxTransactions: Number(maxTx),
      })
      if (res.data.success) {
        setTransactions(res.data.transactions)
      } else {
        setTxLoadError(res.data.error ?? 'The server returned an unsuccessful response.')
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404 || status === 405) {
        setTxLoadError('GET /Mappings/GetTransactions is not implemented in the backend. Please add the endpoint or contact the backend team.')
      } else {
        setTxLoadError('Failed to load transactions. Please try again.')
      }
    } finally {
      setTxLoading(false)
    }
  }

  const runTest = async (actuallySend: boolean) => {
    if (!selectedTx) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await apiClient.post<TestWithTransactionResult>('/Mappings/TestWithTransaction', {
        mappingId: mapping.mappingId,
        messageId: selectedTx.messageId,
        actuallySend,
      })
      setSendResult(res.data)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404 || status === 405) {
        setSendResult({ success: false, error: 'POST /Mappings/TestWithTransaction is not implemented in the backend. Please add the endpoint or contact the backend team.' })
      } else {
        setSendResult({ success: false, error: 'Request failed. Please try again.' })
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1055, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '2rem 1rem' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 1000, background: 'rgba(15,23,42,.98)', border: '1px solid rgba(46,134,193,.3)', borderRadius: 8 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-center p-4 border-bottom border-secondary">
          <h5 className="text-white mb-0">
            <i className="fas fa-flask me-2 text-info" />Test Mapping — {mapping.mappingName}
          </h5>
          <button className="btn-close btn-close-white" onClick={onClose} />
        </div>

        <div className="p-4">
          {/* tabs */}
          <ul className="nav nav-pills mb-4" style={{ gap: 8 }}>
            {(['template','transaction'] as const).map(t => (
              <li key={t} className="nav-item">
                <button
                  className={`nav-link ${tab === t ? 'active' : 'text-secondary'}`}
                  style={{ fontSize: 13 }}
                  onClick={() => { setTab(t); if (t === 'transaction') loadStatuses() }}
                >
                  {t === 'template' ? 'Quick Template Test' : 'Test with Transaction'}
                </button>
              </li>
            ))}
          </ul>

          {/* Template tab */}
          {tab === 'template' && (
            <div>
              <div className="mb-3">
                <label className="text-white mb-1" style={{ fontSize: 13 }}>Custom Liquid Template (optional — leave blank to use saved)</label>
                <textarea className="form-control bg-dark text-white border-secondary" rows={6} style={{ fontFamily: 'monospace', fontSize: 12 }} value={tmplInput} onChange={e => setTmplInput(e.target.value)} />
              </div>
              <div className="mb-3">
                <label className="text-white mb-1" style={{ fontSize: 13 }}>Sample Data (JSON)</label>
                <textarea className="form-control bg-dark text-white border-secondary" rows={6} style={{ fontFamily: 'monospace', fontSize: 12 }} value={sampleData} onChange={e => setSampleData(e.target.value)} />
              </div>
              <button className="btn btn-info btn-sm" onClick={testTemplate} disabled={tmplLoading}>
                {tmplLoading ? <><span className="spinner-border spinner-border-sm me-2" />Testing…</> : 'Run Template Test'}
              </button>
              {tmplResult && (
                <div className={`mt-3 p-3 rounded border ${tmplResult.success ? 'border-success' : 'border-danger'}`} style={{ background: 'rgba(0,0,0,.3)', fontSize: 12 }}>
                  {tmplResult.success
                    ? <pre className="text-success mb-0" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{tmplResult.output}</pre>
                    : <p className="text-danger mb-0">{tmplResult.message}</p>
                  }
                </div>
              )}
            </div>
          )}

          {/* Transaction tab */}
          {tab === 'transaction' && (
            <div>
              {txEndpointError && (
                <div className="alert alert-warning py-2 mb-3 d-flex align-items-start gap-2" style={{ fontSize: 13 }}>
                  <i className="fas fa-exclamation-triangle mt-1 flex-shrink-0" />
                  <span>{txEndpointError}</span>
                </div>
              )}
              <div className="row g-2 mb-3 align-items-end">
                <div className="col-auto">
                  <label className="text-white mb-1" style={{ fontSize: 13 }}>Time Window</label>
                  <select className="form-select form-select-sm bg-dark text-white border-secondary" value={timeWindow} onChange={e => setTimeWindow(e.target.value)}>
                    {['10','30','60','120','360','720','1440'].map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
                <div className="col-auto">
                  <label className="text-white mb-1" style={{ fontSize: 13 }}>Filter Status</label>
                  <select className="form-select form-select-sm bg-dark text-white border-secondary" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">All Statuses</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-auto">
                  <label className="text-white mb-1" style={{ fontSize: 13 }}>Max</label>
                  <input type="number" className="form-control form-control-sm bg-dark text-white border-secondary" value={maxTx} onChange={e => setMaxTx(e.target.value)} style={{ width: 80 }} min={1} max={100} />
                </div>
                <div className="col-auto">
                  <button className="btn btn-secondary btn-sm" onClick={loadTransactions} disabled={txLoading || !!txEndpointError}>
                    {txLoading ? <span className="spinner-border spinner-border-sm" /> : 'Load Transactions'}
                  </button>
                </div>
              </div>

              {txLoadError && (
                <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>
                  <i className="fas fa-times-circle me-2" />{txLoadError}
                </div>
              )}

              {transactions.length > 0 && (
                <div className="mb-3" style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <table className="table table-dark table-sm" style={{ fontSize: 12 }}>
                    <thead><tr><th>Select</th><th>Message ID</th><th>Status</th><th>Timestamp</th><th>Process</th></tr></thead>
                    <tbody>
                      {transactions.map((tx, i) => (
                        <tr key={i} style={{ cursor: 'pointer', background: selectedTx?.messageId === tx.messageId ? 'rgba(46,134,193,.2)' : '' }} onClick={() => setSelectedTx(tx)}>
                          <td><input type="radio" readOnly checked={selectedTx?.messageId === tx.messageId} /></td>
                          <td><code style={{ fontSize: 11 }}>{tx.messageId}</code></td>
                          <td><span className="badge bg-secondary">{tx.status}</span></td>
                          <td>{tx.timestamp}</td>
                          <td>{tx.businessProcessName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedTx && (
                <div className="d-flex gap-2 mb-3">
                  <button className="btn btn-outline-info btn-sm" onClick={() => runTest(false)} disabled={sending}>
                    {sending ? <span className="spinner-border spinner-border-sm" /> : 'Dry Run'}
                  </button>
                  <button className="btn btn-warning btn-sm" onClick={() => runTest(true)} disabled={sending}>
                    Send to Connector
                  </button>
                </div>
              )}

              {sendResult && (
                <div className={`rounded p-3 border ${sendResult.success ? 'border-success' : 'border-danger'}`} style={{ background: 'rgba(0,0,0,.3)' }}>
                  {!sendResult.success && <p className="text-danger mb-2" style={{ fontSize: 13 }}>{sendResult.error}</p>}
                  {sendResult.success && (
                    <div className="row g-3">
                      <div className="col-md-6">
                        <p className="text-muted mb-1" style={{ fontSize: 11 }}>ORIGINAL PAYLOAD</p>
                        <pre className="text-info mb-0" style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{sendResult.originalPayload}</pre>
                      </div>
                      <div className="col-md-6">
                        <p className="text-muted mb-1" style={{ fontSize: 11 }}>TRANSFORMED PAYLOAD</p>
                        <pre className="text-success mb-0" style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{sendResult.transformedPayload}</pre>
                      </div>
                      {sendResult.messageSent && (
                        <div className="col-12">
                          <span className="badge bg-success me-2">Sent</span>
                          <span className="text-muted" style={{ fontSize: 12 }}>HTTP {sendResult.httpStatusCode} · {sendResult.connectorUrl}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── MappingsPage ───────────────────────────────────────────────────────────

// ── API response shapes ────────────────────────────────────────────────────

interface MappingListApiItem {
  mappingId: number
  mappingName: string
  description: string
  connectorId: number
  connectorName: string
  contentType: string
  isEnabled: boolean
  createdBy: string
  createdAt: string
}

// ── MappingsPage ───────────────────────────────────────────────────────────

export default function MappingsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MappingRow | null>(null)
  const [loadingEditId, setLoadingEditId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MappingRow | null>(null)
  const [testTarget, setTestTarget] = useState<MappingRow | null>(null)

  // list from /Mappings/Api/List — returns all fields including description, contentType, createdBy, createdAt
  const { data: mappings = [], isFetching } = useQuery<MappingRow[]>({
    queryKey: ['mappings'],
    queryFn: async () => {
      const res = await apiClient.get<MappingListApiItem[]>('/Mappings/Api/List')
      return res.data.map(m => ({
        mappingId: m.mappingId,
        mappingName: m.mappingName,
        description: m.description ?? '',
        connectorId: m.connectorId,
        connectorName: m.connectorName ?? '',
        contentType: m.contentType ?? 'application/json',
        isEnabled: m.isEnabled,
        createdBy: m.createdBy ?? '',
        createdAt: m.createdAt ?? '',
        liquidTemplate: '',
        pathTemplate: '',
      }))
    },
  })

  // fetch full record (including LiquidTemplate / PathTemplate) before opening edit modal
  const openEdit = useCallback(async (row: MappingRow) => {
    setLoadingEditId(row.mappingId)
    try {
      const res = await apiClient.get<MappingRow>(`/Mappings/Api/Detail/${row.mappingId}`)
      setEditTarget({
        ...row,
        liquidTemplate: res.data.liquidTemplate ?? '',
        pathTemplate: res.data.pathTemplate ?? '',
      })
    } catch {
      // fallback: open with empty templates rather than silently overwriting on save
      setEditTarget({ ...row, liquidTemplate: '', pathTemplate: '' })
    } finally {
      setLoadingEditId(null)
    }
  }, [])

  const { data: connectors = [] } = useQuery<ConnectorOption[]>({
    queryKey: ['connectors-simple'],
    queryFn: () =>
      apiClient.get<{ connectorId: number; connectorName: string; isEnabled: boolean }[]>('/Connectors/Api/List')
        .then(r => r.data.map(c => ({ connectorId: c.connectorId, connectorName: c.connectorName, isEnabled: c.isEnabled }))),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAntiForgeryToken(`/Mappings/Delete/${id}`)
      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      return apiClient.post(`/Mappings/Delete/${id}`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mappings'] })
      setDeleteTarget(null)
    },
  })

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['mappings'] })
    setCreateOpen(false)
    setEditTarget(null)
  }

  const cardStyle: React.CSSProperties = {
    background: 'rgba(15,23,42,.9)',
    border: '1px solid rgba(46,134,193,.2)',
    overflow: 'hidden',
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-exchange-alt me-2 text-primary" />Field Mappings
          </h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>WHAT to include in alert payloads</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <i className="fas fa-plus me-2" />Create Mapping
        </button>
      </div>

      <div className="rounded" style={cardStyle}>
        {isFetching && <div className="text-center py-5"><span className="spinner-border text-primary" /></div>}
        {!isFetching && (
          <DataGrid
            dataSource={mappings}
            keyExpr="mappingId"
            showBorders={false}
            showColumnLines={true}
            showRowLines={true}
            rowAlternationEnabled={true}
            columnAutoWidth={true}
            allowColumnResizing={true}
            height={620}
          >
            <FilterRow visible={true} />
            <HeaderFilter visible={true} />
            <ColumnChooser enabled={true} />
            <Paging pageSize={25} />
            <Pager showPageSizeSelector={true} allowedPageSizes={[25,50]} showInfo={true} visible={true} />

            <Column
              dataField="mappingName"
              caption="Mapping Name"
              width={220}
              cellRender={({ data }) => (
                <button
                  className="btn btn-link text-primary text-decoration-none p-0"
                  style={{ fontSize: 13 }}
                  disabled={loadingEditId === data.mappingId}
                  onClick={() => openEdit(data)}
                >
                  {loadingEditId === data.mappingId
                    ? <span className="spinner-border spinner-border-sm me-1" style={{ width: 12, height: 12 }} />
                    : null}
                  {data.mappingName}
                </button>
              )}
            />
            <Column dataField="description" caption="Description" minWidth={200} />
            <Column
              dataField="connectorName"
              caption="Connector"
              width={160}
              cellRender={({ value }) => (
                <span className="badge bg-primary" style={{ fontSize: 11 }}>{value}</span>
              )}
            />
            <Column
              dataField="contentType"
              caption="Content Type"
              width={150}
              cellRender={({ value }) => <ContentTypeBadge value={value} />}
            />
            <Column
              dataField="isEnabled"
              caption="Status"
              width={100}
              cellRender={({ value }) => (
                <span className={`badge ${value ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: 11 }}>
                  {value ? 'Enabled' : 'Disabled'}
                </span>
              )}
            />
            <Column
              dataField="createdAt"
              caption="Created"
              dataType="datetime"
              format="MMM dd, yyyy"
              width={120}
            />
            <Column
              caption="Actions"
              width={160}
              alignment="center"
              allowSorting={false}
              allowFiltering={false}
              cellRender={({ data }) => (
                <div className="d-flex gap-1 justify-content-center">
                  <button className="btn btn-sm btn-outline-info" title="Test" onClick={() => setTestTarget(data)}>
                    <i className="fas fa-flask" />
                  </button>
                  <button
                    className="btn btn-sm btn-outline-primary"
                    title="Edit"
                    disabled={loadingEditId === data.mappingId}
                    onClick={() => openEdit(data)}
                  >
                    {loadingEditId === data.mappingId
                      ? <span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12 }} />
                      : <i className="fas fa-edit" />}
                  </button>
                  <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => setDeleteTarget(data)}>
                    <i className="fas fa-trash" />
                  </button>
                </div>
              )}
            />
          </DataGrid>
        )}
      </div>

      {/* Create modal */}
      {createOpen && (
        <CreateEditModal mapping={null} connectors={connectors} onClose={() => setCreateOpen(false)} onSaved={handleSaved} />
      )}

      {/* Edit modal */}
      {editTarget && (
        <CreateEditModal mapping={editTarget} connectors={connectors} onClose={() => setEditTarget(null)} onSaved={handleSaved} />
      )}

      {/* Test modal */}
      {testTarget && (
        <TestModal mapping={testTarget} onClose={() => setTestTarget(null)} />
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1055, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="rounded p-4"
            style={{ background: 'rgba(15,23,42,.98)', border: '1px solid rgba(46,134,193,.3)', maxWidth: 400, width: '90%' }}
            onClick={e => e.stopPropagation()}
          >
            <h5 className="text-white mb-2">Delete Mapping?</h5>
            <p className="text-muted mb-4" style={{ fontSize: 13 }}>
              You are about to delete <strong className="text-white">"{deleteTarget.mappingName}"</strong>. This cannot be undone.
            </p>
            <div className="d-flex gap-2 justify-content-end">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={() => deleteMutation.mutate(deleteTarget.mappingId)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
