import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import DataGrid, { Column, MasterDetail, Paging, Pager, FilterRow, HeaderFilter, ColumnChooser, SearchPanel } from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'
import { getAntiForgeryToken, wasRedirected } from '../../services/csrf'

interface ConnectorEndpoint {
  endpointId: number
  endpointUrl: string
  httpMethod: string
  environmentName: string
  authMethodName: string
  isEnabled: boolean
}

interface Connector {
  connectorId: number
  connectorName: string
  connectorType: string
  description: string
  isEnabled: boolean
  status: string
  endpointCount: number
  createdBy: string
  createdAt: string
  endpoints: ConnectorEndpoint[]
}

interface Environment {
  environmentId: number
  environmentName: string
}

const TYPE_COLORS: Record<string, string> = {
  'REST API': '#3B82F6',
  Slack:     '#4A154B',
  Teams:     '#6264A7',
  Email:     '#0072C6',
  Webhook:   '#F97316',
  Jira:      '#0052CC',
  Solace:    '#00AD93',
  HTTP:      '#6B7280',
}

const METHOD_COLORS: Record<string, string> = {
  GET:    'success',
  POST:   'primary',
  PUT:    'warning',
  DELETE: 'danger',
  PATCH:  'info',
}

const AUTH_METHODS = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Basic Auth' },
  { value: '2', label: 'Bearer Token' },
  { value: '3', label: 'API Key' },
  { value: '4', label: 'Custom Headers' },
]

const CONNECTOR_TYPES = ['REST API', 'Webhook', 'Slack', 'Teams', 'Email', 'Jira', 'Solace', 'HTTP']

interface ConnectorForm {
  connectorName: string
  connectorType: string
  description: string
  isEnabled: boolean
  envId: string
  httpMethod: string
  authMethod: string
  baseUrl: string
  healthCheckPath: string
  username: string
  password: string
  bearerToken: string
  apiKeyHeader: string
  apiKeyValue: string
}

const EMPTY_FORM: ConnectorForm = {
  connectorName: '', connectorType: 'REST API', description: '', isEnabled: true,
  envId: '', httpMethod: 'POST', authMethod: '0',
  baseUrl: '', healthCheckPath: '', username: '', password: '',
  bearerToken: '', apiKeyHeader: 'X-API-Key', apiKeyValue: '',
}

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? '#6B7280'
  return <span className="badge" style={{ background: color, fontSize: 11 }}>{type}</span>
}

function EndpointsDetail({ data }: { data: { data: Connector } }) {
  const endpoints = data.data.endpoints ?? []
  if (!endpoints.length) {
    return <p className="text-muted px-3 py-2" style={{ fontSize: 13 }}>No endpoints configured.</p>
  }
  return (
    <div style={{ padding: '12px 24px' }}>
      <table className="table table-dark table-sm mb-0" style={{ fontSize: 12 }}>
        <thead><tr><th>Method</th><th>URL</th><th>Environment</th><th>Auth</th><th>Status</th></tr></thead>
        <tbody>
          {endpoints.map((ep) => (
            <tr key={ep.endpointId}>
              <td><span className={`badge bg-${METHOD_COLORS[ep.httpMethod] ?? 'secondary'}`} style={{ fontSize: 10 }}>{ep.httpMethod}</span></td>
              <td className="text-muted" style={{ wordBreak: 'break-all' }}>{ep.endpointUrl}</td>
              <td className="text-muted">{ep.environmentName}</td>
              <td><span className="badge bg-secondary" style={{ fontSize: 10 }}>{ep.authMethodName}</span></td>
              <td><span className={`badge ${ep.isEnabled ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: 10 }}>{ep.isEnabled ? 'Enabled' : 'Disabled'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface ConnectorModalProps {
  mode: 'create' | 'edit'
  connector?: Connector
  environments: Environment[]
  onClose: () => void
  onSuccess: () => void
}

function ConnectorModal({ mode, connector, environments, onClose, onSuccess }: ConnectorModalProps) {
  const [form, setForm] = useState<ConnectorForm>(() => {
    if (mode === 'edit' && connector) {
      return { ...EMPTY_FORM, connectorName: connector.connectorName, connectorType: connector.connectorType, description: connector.description ?? '', isEnabled: connector.isEnabled }
    }
    return { ...EMPTY_FORM }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: keyof ConnectorForm, value: string | boolean) =>
    setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.connectorName.trim()) { setError('Connector name is required'); return }
    if (mode === 'create' && !form.baseUrl.trim()) { setError('Base URL is required'); return }

    setSaving(true)
    setError('')

    try {
      const url = mode === 'create' ? '/Connectors/Create' : `/Connectors/Edit/${connector!.connectorId}`
      const token = await getAntiForgeryToken(mode === 'create' ? '/Connectors/Create' : `/Connectors/Edit/${connector!.connectorId}`)

      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      params.set('ConnectorName', form.connectorName)
      params.set('ConnectorType', form.connectorType)
      params.set('Description', form.description)
      params.set('IsEnabled', String(form.isEnabled))

      if (mode === 'create') {
        params.set('Endpoints[0].EnvironmentId', form.envId)
        params.set('Endpoints[0].HttpMethod', form.httpMethod)
        params.set('Endpoints[0].AuthMethod', form.authMethod)
        params.set('Endpoints[0].BaseUrl', form.baseUrl)
        params.set('Endpoints[0].HealthCheckPath', form.healthCheckPath)
        if (form.authMethod === '1') { params.set('Endpoints[0].Username', form.username); params.set('Endpoints[0].Password', form.password) }
        if (form.authMethod === '2') params.set('Endpoints[0].BearerToken', form.bearerToken)
        if (form.authMethod === '3') { params.set('Endpoints[0].ApiKeyHeader', form.apiKeyHeader); params.set('Endpoints[0].ApiKeyValue', form.apiKeyValue) }
      }

      const res = await apiClient.post(url, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      if (wasRedirected(res, url)) {
        onSuccess()
      } else {
        setError('Validation error — please check all required fields and try again.')
      }
    } catch {
      setError('Failed to save connector. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = { background: 'rgba(0,0,0,.3)', border: '1px solid rgba(46,134,193,.3)', color: '#ecf0f1', borderRadius: 4, padding: '6px 10px', width: '100%', fontSize: 13 }
  const labelStyle: React.CSSProperties = { color: '#bdc3c7', fontSize: 12, marginBottom: 4, display: 'block' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'rgba(15,23,42,.98)', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, padding: 28, width: '90%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h5 className="text-white mb-3"><i className="fas fa-plug me-2 text-primary" />{mode === 'create' ? 'Create Connector' : 'Edit Connector'}</h5>
        {error && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label style={labelStyle}>Connector Name *</label>
              <input style={inputStyle} value={form.connectorName} onChange={e => set('connectorName', e.target.value)} placeholder="e.g., Production Slack Alerts" required />
            </div>
            <div className="col-md-6">
              <label style={labelStyle}>Connector Type *</label>
              <select style={inputStyle} value={form.connectorType} onChange={e => set('connectorType', e.target.value)}>
                {CONNECTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description of this connector's purpose" />
          </div>

          <div className="mb-3">
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.isEnabled} onChange={e => set('isEnabled', e.target.checked)} />
              <span>Enabled</span>
            </label>
          </div>

          {mode === 'create' && (
            <div style={{ borderTop: '1px solid rgba(46,134,193,.2)', paddingTop: 16, marginTop: 8 }}>
              <h6 className="text-primary mb-3" style={{ fontSize: 13 }}><i className="fas fa-link me-2" />Endpoint #1</h6>
              <div className="row g-2 mb-2">
                <div className="col-md-4">
                  <label style={labelStyle}>Environment</label>
                  <select style={inputStyle} value={form.envId} onChange={e => set('envId', e.target.value)}>
                    <option value="">Select...</option>
                    {environments.map(env => <option key={env.environmentId} value={String(env.environmentId)}>{env.environmentName}</option>)}
                  </select>
                </div>
                <div className="col-md-3">
                  <label style={labelStyle}>HTTP Method</label>
                  <select style={inputStyle} value={form.httpMethod} onChange={e => set('httpMethod', e.target.value)}>
                    {['POST', 'GET', 'PUT', 'PATCH'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="col-md-5">
                  <label style={labelStyle}>Authentication</label>
                  <select style={inputStyle} value={form.authMethod} onChange={e => set('authMethod', e.target.value)}>
                    {AUTH_METHODS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-2">
                <label style={labelStyle}>Base URL *</label>
                <input style={inputStyle} type="url" value={form.baseUrl} onChange={e => set('baseUrl', e.target.value)} placeholder="https://api.example.com" required />
              </div>
              <div className="mb-2">
                <label style={labelStyle}>Health Check Path</label>
                <input style={inputStyle} value={form.healthCheckPath} onChange={e => set('healthCheckPath', e.target.value)} placeholder="/health" />
              </div>
              {form.authMethod === '1' && (
                <div className="row g-2 mb-2">
                  <div className="col-md-6"><label style={labelStyle}>Username</label><input style={inputStyle} value={form.username} onChange={e => set('username', e.target.value)} /></div>
                  <div className="col-md-6"><label style={labelStyle}>Password</label><input style={inputStyle} type="password" value={form.password} onChange={e => set('password', e.target.value)} /></div>
                </div>
              )}
              {form.authMethod === '2' && (
                <div className="mb-2"><label style={labelStyle}>Bearer Token</label><input style={inputStyle} value={form.bearerToken} onChange={e => set('bearerToken', e.target.value)} /></div>
              )}
              {form.authMethod === '3' && (
                <div className="row g-2 mb-2">
                  <div className="col-md-5"><label style={labelStyle}>API Key Header</label><input style={inputStyle} value={form.apiKeyHeader} onChange={e => set('apiKeyHeader', e.target.value)} /></div>
                  <div className="col-md-7"><label style={labelStyle}>API Key Value</label><input style={inputStyle} value={form.apiKeyValue} onChange={e => set('apiKeyValue', e.target.value)} /></div>
                </div>
              )}
            </div>
          )}

          {mode === 'edit' && (
            <p className="text-muted mb-3" style={{ fontSize: 12 }}>
              <i className="fas fa-info-circle me-1" />To manage endpoints and authentication details for this connector, use the full edit page.{' '}
              <Link to={`/Connectors/Edit/${connector!.connectorId}`} className="text-primary">Open full edit page</Link>
            </p>
          )}

          <div className="d-flex gap-2 justify-content-end mt-3">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</> : <><i className="fas fa-save me-1" />{mode === 'create' ? 'Create' : 'Save'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ConnectorsPage() {
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<Connector | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Connector | null>(null)

  const { data: connectors = [], isFetching } = useQuery<Connector[]>({
    queryKey: ['connectors'],
    queryFn: () => apiClient.get<Connector[]>('/Connectors/Api/List').then(r => r.data),
  })

  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments'],
    queryFn: () => apiClient.get<Environment[]>('/Admin/GetEnvironments').then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAntiForgeryToken(`/Connectors/Delete/${id}`)
      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      return apiClient.post(`/Connectors/Delete/${id}`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] })
      setDeleteTarget(null)
    },
  })

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) deleteMutation.mutate(deleteTarget.connectorId)
  }, [deleteTarget, deleteMutation])

  const handleModalSuccess = useCallback(() => {
    setShowCreate(false)
    setEditTarget(null)
    queryClient.invalidateQueries({ queryKey: ['connectors'] })
  }, [queryClient])

  const cardStyle: React.CSSProperties = {
    background: 'rgba(15,23,42,.9)',
    border: '1px solid rgba(46,134,193,.2)',
    overflow: 'hidden',
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1"><i className="fas fa-plug me-2 text-primary" />Connectors Management</h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>WHERE to send alerts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <i className="fas fa-plus me-2" />Create Connector
        </button>
      </div>

      <div className="rounded" style={cardStyle}>
        {isFetching && <div className="text-center py-5"><span className="spinner-border text-primary" /></div>}
        {!isFetching && (
          <DataGrid
            dataSource={connectors}
            keyExpr="connectorId"
            showBorders={false}
            showColumnLines={true}
            showRowLines={true}
            rowAlternationEnabled={true}
            columnAutoWidth={true}
            allowColumnResizing={true}
            height={620}
          >
            <SearchPanel visible={true} width={240} placeholder="Search connectors..." />
            <FilterRow visible={true} />
            <HeaderFilter visible={true} />
            <ColumnChooser enabled={true} />
            <Paging pageSize={25} />
            <Pager showPageSizeSelector={true} allowedPageSizes={[25, 50]} showInfo={true} visible={true} />

            <Column
              dataField="connectorName"
              caption="Connector Name"
              width={200}
              cellRender={({ data }) => (
                <button className="btn btn-link text-primary p-0 text-decoration-none" style={{ fontSize: 13 }} onClick={() => setEditTarget(data)}>
                  {data.connectorName}
                </button>
              )}
            />
            <Column dataField="connectorType" caption="Type" width={120} cellRender={({ value }) => <TypeBadge type={value} />} />
            <Column
              dataField="status"
              caption="Status"
              width={110}
              alignment="center"
              cellRender={({ value }) => (
                <span className={`badge ${value === 'Enabled' ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: 11 }}>{value}</span>
              )}
            />
            <Column dataField="description"   caption="Description"  width={280} />
            <Column dataField="endpointCount" caption="Endpoints"    width={100} alignment="center" />
            <Column dataField="createdBy"     caption="Created By"   width={140} />
            <Column dataField="createdAt"     caption="Created"      dataType="datetime" format="dd/MM/yyyy" width={120} />
            <Column
              caption="Actions"
              width={130}
              alignment="center"
              allowSorting={false}
              allowFiltering={false}
              cellRender={({ data }) => (
                <div className="d-flex gap-1 justify-content-center">
                  <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => setEditTarget(data)}>
                    <i className="fas fa-edit" />
                  </button>
                  <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => setDeleteTarget(data)}>
                    <i className="fas fa-trash" />
                  </button>
                </div>
              )}
            />

            <MasterDetail enabled={true} component={EndpointsDetail} />
          </DataGrid>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <ConnectorModal mode="create" environments={environments} onClose={() => setShowCreate(false)} onSuccess={handleModalSuccess} />
      )}

      {/* Edit Modal */}
      {editTarget && (
        <ConnectorModal mode="edit" connector={editTarget} environments={environments} onClose={() => setEditTarget(null)} onSuccess={handleModalSuccess} />
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteTarget(null)}>
          <div style={{ background: 'rgba(15,23,42,.98)', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%' }} onClick={e => e.stopPropagation()}>
            <h5 className="text-white mb-2">Delete Connector?</h5>
            <p className="text-muted mb-4" style={{ fontSize: 13 }}>You are about to delete <strong className="text-white">"{deleteTarget.connectorName}"</strong>. This action cannot be undone.</p>
            <div className="d-flex gap-2 justify-content-end">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteConfirm} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
