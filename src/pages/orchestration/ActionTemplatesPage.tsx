import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../services/apiClient'
import { getAntiForgeryToken, wasRedirected } from '../../services/csrf'

interface ActionTemplate {
  actionTemplateId: number
  templateName: string
  description: string
  endpoint: string
  authenticationType: string
  isEnabled: boolean
  usedByCount: number
  createdAt: string
}

// Full detail shape returned by /ActionTemplates/Api/Details/{id}
interface ActionTemplateDetail extends ActionTemplate {
  messageTemplate: string
  isDynamicUrl: boolean
  urlTemplate: string
  authUsername: string
  authPassword: string
  authToken: string
}

interface TemplateForm {
  templateName: string
  description: string
  isEnabled: boolean
  solaceEndpointUrl: string
  isDynamicUrl: boolean
  urlTemplate: string
  authenticationType: string
  authUsername: string
  authPassword: string
  authToken: string
  messageTemplate: string
}

interface TestResult {
  finalUrl: string
  sendResult: string
  renderedMessage: string
  transactions: Record<string, unknown>[]
  dataSource: string
  transactionCount?: number
}

const EMPTY_FORM: TemplateForm = {
  templateName: '', description: '', isEnabled: true,
  solaceEndpointUrl: '', isDynamicUrl: false, urlTemplate: '',
  authenticationType: 'None', authUsername: '', authPassword: '', authToken: '',
  messageTemplate: '',
}

const AUTH_OPTS = [
  { value: 'None', label: 'None' },
  { value: 'Basic', label: 'Basic Authentication' },
  { value: 'Bearer', label: 'Bearer Token' },
  { value: 'ClientCredentials', label: 'Client Credentials' },
]

const EXAMPLE_TEMPLATES: Record<string, string> = {
  simple: `{\n  "alert": {\n    "rule": "{{ ruleName }}",\n    "time": "{{ triggeredAt | date: 'yyyy-MM-dd HH:mm:ss' }}",\n    "matches": {{ matchCount }},\n    "message": "{{ conditions }}"\n  }\n}`,
  slack: `{\n  "text": "🚨 *{{ ruleName }}* triggered",\n  "blocks": [{\n    "type": "section",\n    "text": {\n      "type": "mrkdwn",\n      "text": "*{{ ruleName }}*\\nTriggered at {{ triggeredAt | date: 'HH:mm:ss' }} with {{ matchCount }} matches"\n    }\n  }]\n}`,
}

// ── HTML scraping helper ────────────────────────────────────────────────────

async function loadTemplateForEdit(id: number): Promise<Partial<TemplateForm>> {
  // Try JSON API first
  try {
    const r = await apiClient.get<ActionTemplateDetail>(`/ActionTemplates/Api/Details/${id}`)
    const d = r.data
    return {
      templateName:       d.templateName,
      description:        d.description,
      isEnabled:          d.isEnabled,
      solaceEndpointUrl:  d.endpoint,
      isDynamicUrl:       d.isDynamicUrl,
      urlTemplate:        d.urlTemplate ?? '',
      authenticationType: d.authenticationType,
      authUsername:       d.authUsername ?? '',
      authPassword:       d.authPassword ?? '',
      authToken:          d.authToken ?? '',
      messageTemplate:    d.messageTemplate ?? '',
    }
  } catch { /* fall through to HTML scrape */ }

  // Fall back: scrape the Razor edit page
  try {
    const res = await apiClient.get<string>(`/ActionTemplates/Edit/${id}`, {
      responseType: 'text',
      headers: { Accept: 'text/html' },
    })
    const html = typeof res.data === 'string' ? res.data : ''

    const getInput = (name: string): string => {
      const m =
        html.match(new RegExp(`name="${name}"[^>]+value="([^"]*)"`, 'i')) ??
        html.match(new RegExp(`value="([^"]*)"[^>]+name="${name}"`, 'i'))
      return m?.[1] ?? ''
    }

    const getTextarea = (name: string): string => {
      const m = html.match(new RegExp(`name="${name}"[^>]*>([\\s\\S]*?)<\\/textarea>`, 'i'))
      return m?.[1] ?? ''
    }

    const hasChecked = (name: string): boolean => {
      const m = html.match(new RegExp(`name="${name}"[^>]*>`, 'i'))
      if (!m) return false
      return m[0].includes('checked')
    }

    return {
      templateName:       getInput('TemplateName') || getInput('templateName'),
      description:        getInput('Description') || getInput('description'),
      isEnabled:          hasChecked('IsEnabled') || hasChecked('isEnabled'),
      solaceEndpointUrl:  getInput('SolaceEndpointUrl') || getInput('solaceEndpointUrl') || getInput('EndpointUrl') || getInput('Endpoint'),
      isDynamicUrl:       hasChecked('IsDynamicUrl') || hasChecked('isDynamicUrl'),
      urlTemplate:        getInput('UrlTemplate') || getInput('urlTemplate'),
      authenticationType: getInput('AuthenticationType') || getInput('authenticationType') || 'None',
      authUsername:       getInput('AuthUsername') || getInput('authUsername'),
      authPassword:       '',
      authToken:          '',
      messageTemplate:    getTextarea('MessageTemplate') || getTextarea('messageTemplate'),
    }
  } catch { return {} }
}

// ── shared input styles ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(15,23,42,.85)', color: '#F1F5F9',
  border: '1px solid rgba(46,134,193,.3)', borderRadius: 6,
  padding: '7px 10px', fontSize: 13,
}
const labelStyle: React.CSSProperties = {
  display: 'block', color: '#94A3B8', fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4,
}

// ── Test Modal ──────────────────────────────────────────────────────────────────

function TestModal({
  templateId,
  templateName,
  onClose,
}: {
  templateId: number
  templateName: string
  onClose: () => void
}) {
  const [result, setResult] = useState<TestResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTest = useCallback(async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const r = await apiClient.post<TestResult>('/ActionTemplates/Test', { actionTemplateId: templateId })
      setResult(r.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Test failed. Check the backend logs.')
    } finally {
      setRunning(false)
    }
  }, [templateId])

  useEffect(() => { runTest() }, [runTest])

  const isSendSuccess = result?.sendResult?.toLowerCase() === 'success'

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1060, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0F172A', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, width: '100%', maxWidth: 920, boxShadow: '0 24px 60px rgba(0,0,0,.8)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(46,134,193,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h5 style={{ color: '#fff', margin: 0, fontWeight: 700 }}>
            <i className="fas fa-flask me-2 text-warning" />
            Test Template &mdash; <span style={{ color: '#94A3B8', fontWeight: 400 }}>{templateName}</span>
          </h5>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer' }}>&times;</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {running && (
            <div className="text-center py-5">
              <span className="spinner-border text-warning mb-3" style={{ display: 'block', margin: '0 auto 12px' }} />
              <p className="text-muted mb-0" style={{ fontSize: 13 }}>Running test against live transaction data&hellip;</p>
            </div>
          )}

          {error && !running && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', color: '#EF4444', padding: '12px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
              <i className="fas fa-exclamation-triangle me-2" />{error}
            </div>
          )}

          {result && !running && (
            <>
              {/* Summary chips */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(46,134,193,.1)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6, padding: '7px 14px', fontSize: 12 }}>
                  <span style={{ color: '#94A3B8' }}>Transactions: </span>
                  <span style={{ color: '#F1F5F9', fontWeight: 600 }}>
                    {result.transactionCount ?? result.transactions?.length ?? 0}
                  </span>
                </div>
                <div style={{ background: 'rgba(46,134,193,.1)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6, padding: '7px 14px', fontSize: 12 }}>
                  <span style={{ color: '#94A3B8' }}>Data Source: </span>
                  <span style={{ color: '#F1F5F9', fontWeight: 600 }}>{result.dataSource || '—'}</span>
                </div>
                <div style={{ background: isSendSuccess ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', border: `1px solid ${isSendSuccess ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`, borderRadius: 6, padding: '7px 14px', fontSize: 12 }}>
                  <span style={{ color: '#94A3B8' }}>Send Result: </span>
                  <span style={{ color: isSendSuccess ? '#4ADE80' : '#EF4444', fontWeight: 600 }}>{result.sendResult || '—'}</span>
                </div>
              </div>

              {/* Two-column: Transaction Data + Rendered Message */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 6 }}>Transaction Data Used</div>
                  <pre style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6, padding: 12, fontSize: 11, color: '#F1F5F9', overflowX: 'auto', maxHeight: 380, overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(result.transactions, null, 2)}
                  </pre>
                </div>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 6 }}>Rendered Message</div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ color: '#94A3B8', fontSize: 11 }}>Final URL: </span>
                    <code style={{ color: '#FED7AA', fontSize: 11, wordBreak: 'break-all' }}>{result.finalUrl || '—'}</code>
                  </div>
                  <pre style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6, padding: 12, fontSize: 11, color: '#F1F5F9', overflowX: 'auto', maxHeight: 340, overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {result.renderedMessage || '(empty)'}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(46,134,193,.2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={runTest}
            disabled={running}
            style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)', border: 'none', color: '#fff', padding: '8px 22px', borderRadius: 6, fontWeight: 600, cursor: running ? 'wait' : 'pointer' }}
          >
            <i className="fas fa-redo me-2" />{running ? 'Running…' : 'Re-run Test'}
          </button>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(148,163,184,.4)', color: '#94A3B8', padding: '8px 18px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create / Edit Modal ─────────────────────────────────────────────────────────

function TemplateModal({
  editId,
  initial,
  onClose,
  onSaved,
}: {
  editId: number | null
  initial: TemplateForm
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<TemplateForm>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<TemplateForm>) => setForm(f => ({ ...f, ...patch }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // Use the existing MVC form-POST actions with form-encoded params + CSRF token
      const pageUrl = editId
        ? `/ActionTemplates/Edit/${editId}`
        : '/ActionTemplates/Create'
      const token = await getAntiForgeryToken(pageUrl)

      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      if (editId) params.set('ActionTemplateId', String(editId))
      params.set('TemplateName', form.templateName)
      params.set('Description', form.description)
      params.set('IsEnabled', String(form.isEnabled))
      params.set('SolaceEndpointUrl', form.solaceEndpointUrl)
      params.set('IsDynamicUrl', String(form.isDynamicUrl))
      params.set('UrlTemplate', form.urlTemplate)
      params.set('AuthenticationType', form.authenticationType)
      params.set('AuthUsername', form.authUsername)
      params.set('AuthPassword', form.authPassword)
      params.set('AuthToken', form.authToken)
      params.set('MessageTemplate', form.messageTemplate)

      const res = await apiClient.post(pageUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      if (wasRedirected(res, pageUrl)) {
        onSaved()
      } else {
        setError('Validation error — check required fields.')
      }
    } catch {
      setError('Failed to save. Check the backend logs.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0F172A', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, width: '100%', maxWidth: 720, boxShadow: '0 24px 60px rgba(0,0,0,.8)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(46,134,193,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h5 style={{ color: '#fff', margin: 0, fontWeight: 700 }}>
            <i className="fas fa-layer-group me-2 text-primary" />
            {editId ? 'Edit Template' : 'Create Action Template'}
          </h5>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {error && (
              <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', color: '#EF4444', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>
                {error}
              </div>
            )}

            {/* Basic */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Template Name *</label>
                <input required style={inputStyle} value={form.templateName} onChange={e => set({ templateName: e.target.value })} placeholder="e.g., High Priority Alert Template" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Description</label>
                <textarea rows={2} style={{ ...inputStyle, resize: 'vertical' }} value={form.description} onChange={e => set({ description: e.target.value })} placeholder="What this template does..." />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="isEnabled" checked={form.isEnabled} onChange={e => set({ isEnabled: e.target.checked })} />
                <label htmlFor="isEnabled" style={{ color: '#F1F5F9', fontSize: 13, cursor: 'pointer' }}>Enabled</label>
              </div>
            </div>

            {/* Endpoint */}
            <div>
              <label style={{ ...labelStyle, color: '#2E86C1' }}>Endpoint Configuration</label>
              <div style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Solace Endpoint URL *</label>
                  <input required style={inputStyle} value={form.solaceEndpointUrl} onChange={e => set({ solaceEndpointUrl: e.target.value })} placeholder="https://broker.example.com/SEMP/v2/publish" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="isDynamic" checked={form.isDynamicUrl} onChange={e => set({ isDynamicUrl: e.target.checked })} />
                  <label htmlFor="isDynamic" style={{ color: '#F1F5F9', fontSize: 13, cursor: 'pointer' }}>Dynamic URL (append path based on transaction data)</label>
                </div>
                {form.isDynamicUrl && (
                  <div>
                    <label style={labelStyle}>URL Template</label>
                    <input style={inputStyle} value={form.urlTemplate} onChange={e => set({ urlTemplate: e.target.value })} placeholder="TI/{businessSegmentName}/error/{errorCode}/v1/{transactionId}" />
                    <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>Common: businessSegmentName, brandName, businessProcessName, errorCode, transactionId</div>
                  </div>
                )}
              </div>
            </div>

            {/* Auth */}
            <div>
              <label style={{ ...labelStyle, color: '#2E86C1' }}>Authentication</label>
              <div style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Authentication Type *</label>
                  <select style={inputStyle} value={form.authenticationType} onChange={e => set({ authenticationType: e.target.value })}>
                    {AUTH_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {form.authenticationType === 'Basic' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Username</label>
                      <input style={inputStyle} value={form.authUsername} onChange={e => set({ authUsername: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Password</label>
                      <input type="password" style={inputStyle} value={form.authPassword} onChange={e => set({ authPassword: e.target.value })} />
                    </div>
                  </div>
                )}
                {(form.authenticationType === 'Bearer' || form.authenticationType === 'ClientCredentials') && (
                  <div>
                    <label style={labelStyle}>Bearer Token / Client Secret</label>
                    <input type="password" style={inputStyle} value={form.authToken} onChange={e => set({ authToken: e.target.value })} />
                  </div>
                )}
              </div>
            </div>

            {/* Message Template */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...labelStyle, margin: 0 }}>Message Template *</label>
                <select style={{ background: 'rgba(15,23,42,.85)', color: '#94A3B8', border: '1px solid rgba(46,134,193,.2)', borderRadius: 4, padding: '3px 8px', fontSize: 12 }}
                  onChange={e => { if (e.target.value) set({ messageTemplate: EXAMPLE_TEMPLATES[e.target.value] ?? '' }) }}>
                  <option value="">Load example…</option>
                  <option value="simple">Simple Alert</option>
                  <option value="slack">Slack Webhook</option>
                </select>
              </div>
              <textarea
                required
                rows={10}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}
                value={form.messageTemplate}
                onChange={e => set({ messageTemplate: e.target.value })}
                placeholder={'{\n  "alert": {\n    "rule": "{{ ruleName }}",\n    "matches": {{ matchCount }}\n  }\n}'}
              />
              <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>
                Liquid syntax: <code style={{ color: '#FED7AA' }}>{'{{ ruleName }}'}</code> · <code style={{ color: '#FED7AA' }}>{'{{ matchCount }}'}</code> · <code style={{ color: '#FED7AA' }}>{'{{ triggeredAt }}'}</code> · <code style={{ color: '#FED7AA' }}>{'{% for t in sampleTransactions %}'}</code>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(46,134,193,.2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(148,163,184,.4)', color: '#94A3B8', padding: '8px 18px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ background: 'linear-gradient(135deg,#2E86C1,#3498DB)', border: 'none', color: '#fff', padding: '8px 22px', borderRadius: 6, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving…' : (editId ? 'Save Changes' : 'Create Template')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function ActionTemplatesPage() {
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<ActionTemplate | null>(null)
  const [modal, setModal] = useState<{ editId: number | null; initial: TemplateForm } | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [testTarget, setTestTarget] = useState<ActionTemplate | null>(null)
  const [detailsTarget, setDetailsTarget] = useState<ActionTemplateDetail | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  const openDetails = useCallback(async (id: number) => {
    setDetailsLoading(true)
    try {
      const r = await apiClient.get<ActionTemplateDetail>(`/ActionTemplates/Api/Details/${id}`)
      setDetailsTarget(r.data)
    } catch {
      alert('Failed to load template details.')
    } finally {
      setDetailsLoading(false)
    }
  }, [])

  const { data: templates = [], isFetching, isError } = useQuery<ActionTemplate[]>({
    queryKey: ['action-templates'],
    queryFn: () =>
      apiClient.get<ActionTemplate[]>('/ActionTemplates/Api/List').then(r => r.data),
    retry: false,
  })

  // FIX: Enable — fetch antiforgery token and POST form-encoded
  const enableMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAntiForgeryToken(`/ActionTemplates/Enable/${id}`)
      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      return apiClient.post(`/ActionTemplates/Enable/${id}`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-templates'] }),
  })

  // FIX: Disable — fetch antiforgery token and POST form-encoded
  const disableMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAntiForgeryToken(`/ActionTemplates/Disable/${id}`)
      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      return apiClient.post(`/ActionTemplates/Disable/${id}`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-templates'] }),
  })

  // FIX: Delete — fetch antiforgery token and POST form-encoded (same pattern as ConnectorsPage)
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAntiForgeryToken(`/ActionTemplates/Delete/${id}`)
      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      return apiClient.post(`/ActionTemplates/Delete/${id}`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-templates'] })
      setDeleteTarget(null)
    },
  })

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) deleteMutation.mutate(deleteTarget.actionTemplateId)
  }, [deleteTarget, deleteMutation])

  const openCreate = () => setModal({ editId: null, initial: EMPTY_FORM })

  // FIX: use loadTemplateForEdit which tries JSON API then falls back to HTML scraping
  const openEdit = async (t: ActionTemplate) => {
    setEditLoading(true)
    try {
      const data = await loadTemplateForEdit(t.actionTemplateId)
      setModal({
        editId: t.actionTemplateId,
        initial: {
          ...EMPTY_FORM,
          templateName:       data.templateName       ?? t.templateName,
          description:        data.description        ?? t.description,
          isEnabled:          data.isEnabled          ?? t.isEnabled,
          solaceEndpointUrl:  data.solaceEndpointUrl  ?? t.endpoint,
          isDynamicUrl:       data.isDynamicUrl       ?? false,
          urlTemplate:        data.urlTemplate        ?? '',
          authenticationType: data.authenticationType ?? t.authenticationType,
          authUsername:       data.authUsername       ?? '',
          authPassword:       data.authPassword       ?? '',
          authToken:          data.authToken          ?? '',
          messageTemplate:    data.messageTemplate    ?? '',
        },
      })
    } catch {
      // Last-resort fallback: open with list fields only
      setModal({
        editId: t.actionTemplateId,
        initial: {
          ...EMPTY_FORM,
          templateName:       t.templateName,
          description:        t.description,
          isEnabled:          t.isEnabled,
          solaceEndpointUrl:  t.endpoint,
          authenticationType: t.authenticationType,
        },
      })
    } finally {
      setEditLoading(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'rgba(15,23,42,.9)',
    border: '1px solid rgba(46,134,193,.2)',
    overflow: 'hidden',
    borderRadius: 8,
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-layer-group me-2 text-primary" />Action Templates
          </h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>
            Configure Action Templates for Rules Engine
          </p>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <Link
            to="/orchestration/rules"
            className="btn btn-secondary"
            style={{ fontSize: 13 }}
          >
            <i className="fas fa-arrow-left me-2" />Back to Rules
          </Link>
          <button className="btn btn-primary" onClick={openCreate} disabled={editLoading}>
            <i className="fas fa-plus me-2" />Create Template
          </button>
        </div>
      </div>

      {/* Edit-loading indicator */}
      {editLoading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1040, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0F172A', border: '1px solid rgba(46,134,193,.3)', borderRadius: 10, padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="spinner-border spinner-border-sm text-primary" />
            <span style={{ color: '#F1F5F9', fontSize: 13 }}>Loading template details…</span>
          </div>
        </div>
      )}

      <div style={cardStyle}>
        {isFetching && (
          <div className="text-center py-5">
            <span className="spinner-border text-primary" />
          </div>
        )}

        {isError && (
          <div className="text-center py-5">
            <div style={{ fontSize: 48, opacity: .3, marginBottom: 16 }}>
              <i className="fas fa-layer-group" />
            </div>
            <p className="text-white mb-1">Action Templates</p>
            <p className="text-muted" style={{ fontSize: 13 }}>Could not load templates from the backend.</p>
            <button className="btn btn-outline-primary btn-sm mt-2" onClick={openCreate}>
              <i className="fas fa-plus me-2" />Create Template
            </button>
          </div>
        )}

        {!isFetching && !isError && (
          <div className="table-responsive" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <table className="table table-dark table-hover mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: 'rgba(46,134,193,.15)', position: 'sticky', top: 0, zIndex: 5 }}>
                <tr>
                  <th className="ps-3">Template Name</th>
                  <th>Description</th>
                  <th>Endpoint</th>
                  <th>Auth Type</th>
                  <th>Status</th>
                  <th>Used By</th>
                  <th>Created</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-muted py-5">
                      No action templates configured yet.{' '}
                      <button className="btn btn-link btn-sm p-0 text-primary" onClick={openCreate}>Create your first template</button>
                    </td>
                  </tr>
                )}
                {templates.map((t) => (
                  <tr key={t.actionTemplateId}>
                    <td className="ps-3">
                      <button
                        className="btn btn-link btn-sm p-0 text-primary text-decoration-none"
                        onClick={() => openEdit(t)}
                        disabled={editLoading}
                      >
                        {t.templateName}
                      </button>
                    </td>
                    <td className="text-muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.description || '—'}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{t.endpoint}</td>
                    <td>
                      <span className="badge bg-primary" style={{ fontSize: 11 }}>{t.authenticationType}</span>
                    </td>
                    <td>
                      <span className={`badge ${t.isEnabled ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: 11 }}>
                        {t.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      {t.usedByCount > 0
                        ? <span className="badge bg-secondary" style={{ fontSize: 11 }}>{t.usedByCount} rules</span>
                        : <span className="text-muted" style={{ fontSize: 12 }}>Not used</span>
                      }
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
                    </td>
                    <td className="text-center">
                      <div className="d-flex gap-1 justify-content-center">
                        <button
                          className="btn btn-sm btn-outline-info"
                          title="View Details"
                          onClick={() => openDetails(t.actionTemplateId)}
                          disabled={detailsLoading}
                        >
                          <i className="fas fa-eye" />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          title="Edit"
                          onClick={() => openEdit(t)}
                          disabled={editLoading}
                        >
                          <i className="fas fa-edit" />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-warning"
                          title="Test Template"
                          onClick={() => setTestTarget(t)}
                        >
                          <i className="fas fa-flask" />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-warning"
                          title={t.isEnabled ? 'Disable' : 'Enable'}
                          onClick={() => t.isEnabled ? disableMutation.mutate(t.actionTemplateId) : enableMutation.mutate(t.actionTemplateId)}
                        >
                          <i className={`fas fa-${t.isEnabled ? 'pause' : 'play'}`} />
                        </button>
                        {t.usedByCount === 0 && (
                          <button
                            className="btn btn-sm btn-outline-danger"
                            title="Delete"
                            onClick={() => setDeleteTarget(t)}
                          >
                            <i className="fas fa-trash" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Test Modal */}
      {testTarget && (
        <TestModal
          templateId={testTarget.actionTemplateId}
          templateName={testTarget.templateName}
          onClose={() => setTestTarget(null)}
        />
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <TemplateModal
          editId={modal.editId}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            queryClient.invalidateQueries({ queryKey: ['action-templates'] })
          }}
        />
      )}

      {/* Details Modal */}
      {detailsTarget && (
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.6)', position: 'fixed', inset: 0, zIndex: 1050, overflowY: 'auto' }}
          onClick={() => setDetailsTarget(null)}
        >
          <div
            className="rounded p-4 my-4"
            style={{ background: 'rgba(15,23,42,.98)', border: '1px solid rgba(46,134,193,.3)', maxWidth: 700, width: '95%' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="text-white mb-0"><i className="fas fa-paper-plane me-2 text-info" />{detailsTarget.templateName}</h5>
              <button className="btn-close btn-close-white" onClick={() => setDetailsTarget(null)} />
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 8, fontSize: 13 }}>
              <dt className="text-muted">Status</dt>
              <dd className="text-white mb-0">{detailsTarget.isEnabled ? <span className="badge bg-success">Enabled</span> : <span className="badge bg-secondary">Disabled</span>}</dd>
              <dt className="text-muted">Auth Type</dt>
              <dd className="text-white mb-0">{detailsTarget.authenticationType || '—'}</dd>
              <dt className="text-muted">Description</dt>
              <dd className="text-white mb-0">{detailsTarget.description || '—'}</dd>
              <dt className="text-muted">Endpoint</dt>
              <dd className="mb-0" style={{ wordBreak: 'break-all' }}>
                {detailsTarget.isDynamicUrl
                  ? <><span className="badge bg-info me-1">Dynamic</span><code className="text-info">{detailsTarget.urlTemplate}</code></>
                  : <code className="text-info">{detailsTarget.endpoint}</code>}
              </dd>
              {detailsTarget.authenticationType === 'Basic' && <>
                <dt className="text-muted">Username</dt>
                <dd className="text-white mb-0">{detailsTarget.authUsername || '—'}</dd>
              </>}
              {detailsTarget.authenticationType === 'Bearer' && <>
                <dt className="text-muted">Token</dt>
                <dd className="text-white mb-0" style={{ wordBreak: 'break-all' }}>{detailsTarget.authToken ? '••••••••' : '—'}</dd>
              </>}
              <dt className="text-muted">Used by</dt>
              <dd className="text-white mb-0">{detailsTarget.usedByCount ?? 0} rule(s)</dd>
            </dl>
            {detailsTarget.messageTemplate && (
              <div className="mt-3">
                <div className="text-muted mb-1" style={{ fontSize: 12 }}>Message Template</div>
                <pre style={{ background: 'rgba(30,41,59,.8)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6, padding: 12, fontSize: 12, color: '#AED6F1', maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                  {detailsTarget.messageTemplate}
                </pre>
              </div>
            )}
            <div className="d-flex gap-2 justify-content-end mt-3">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setDetailsTarget(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)', position: 'fixed', inset: 0, zIndex: 1050 }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="rounded p-4"
            style={{ background: 'rgba(15,23,42,.98)', border: '1px solid rgba(46,134,193,.3)', maxWidth: 400, width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h5 className="text-white mb-2">Delete Template?</h5>
            <p className="text-muted mb-4" style={{ fontSize: 13 }}>
              You are about to delete <strong className="text-white">"{deleteTarget.templateName}"</strong>. This cannot be undone.
            </p>
            <div className="d-flex gap-2 justify-content-end">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
