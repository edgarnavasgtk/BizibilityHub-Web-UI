import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useEffect } from 'react'
import DataGrid, { Column, Paging, Pager, FilterRow, HeaderFilter, ColumnChooser } from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'
import { getAntiForgeryToken, wasRedirected } from '../../services/csrf'

// ── interfaces ─────────────────────────────────────────────────────────────

interface Rule {
  ruleId: number
  ruleName: string
  description: string
  isPatternRule: boolean
  patternCount?: number
  patternWindowMinutes?: number
  isActive: boolean
  cooldownPeriodMinutes: number
  conditionsCount: number
  createdAt: string
  cooldownRemaining?: string
}

interface RulesResponse {
  rules: Rule[]
}

interface MappingOption {
  mappingId: number
  mappingName: string
  connectorName?: string
  displayName: string
}

interface EnvOption {
  environmentId: number
  environmentName: string
}

interface ConditionRow {
  fieldName: string
  operator: string
  value: string
  logicalOperator: string
  groupLevel: number
}

interface RuleForm {
  ruleId: number
  ruleName: string
  description: string
  mappingId: number | ''
  selectedEnvIds: number[]
  cooldownPeriodMinutes: number
  isEnabled: boolean
  isPatternRule: boolean
  patternCount: number
  patternTimeWindowMinutes: number
  conditions: ConditionRow[]
}

// ── JSON API detail shape (GET /Rules/Api/Details/{id}) ───────────────────

interface RuleApiDetail {
  ruleId: number
  ruleName: string
  description: string
  mappingId: number | null
  selectedEnvironmentIds: number[]
  cooldownPeriodMinutes: number
  isEnabled: boolean
  isPatternRule: boolean
  patternCount: number
  patternTimeWindowMinutes: number
  conditions: ConditionRow[]
}

// ── TestComprehensive response shapes ──────────────────────────────────────

interface ConditionEvalResult {
  fieldName: string
  operator: string
  value: string
  matched: boolean
  actualValue?: string
}

interface SampleTransaction {
  [key: string]: unknown
}

interface TestComprehensiveResult {
  success: boolean
  matchCount: number
  conditionResults?: ConditionEvalResult[]
  sampleMatches?: SampleTransaction[]
  resolvedUrl?: string
  resolvedMessage?: string
  message?: string
  error?: string
}

// ── constants ──────────────────────────────────────────────────────────────

const AVAILABLE_FIELDS = [
  'BrandName','BusinessProcessName','BusinessProcessStage','BusinessSegmentName',
  'BusinessSubprocessName','CountryCode','CountryName','Direction','DocumentTypeName',
  'EnvironmentName','ErrorCode','ErrorMessage','IntegrationName','ReferenceDocumentTypeName',
  'SourceSystem','Status','TargetSystem',
]

const OPERATORS = [
  'Equals','NotEquals','Contains','DoesNotContain','StartsWith','EndsWith','IsEmpty','IsNotEmpty',
]

const VALUE_FREE = ['IsEmpty','IsNotEmpty']

const BLANK_FORM: RuleForm = {
  ruleId: 0,
  ruleName: '',
  description: '',
  mappingId: '',
  selectedEnvIds: [],
  cooldownPeriodMinutes: 15,
  isEnabled: false,
  isPatternRule: false,
  patternCount: 2,
  patternTimeWindowMinutes: 60,
  conditions: [{ fieldName: 'Status', operator: 'Equals', value: '', logicalOperator: '', groupLevel: 0 }],
}

// ── html-parse helpers ─────────────────────────────────────────────────────

function parseRulesHtml(html: string): Rule[] {
  const m = html.match(/const rulesData = (\[[\s\S]*?\]);/)
  if (!m) return []
  try {
    const raw: Record<string, unknown>[] = JSON.parse(m[1])
    return raw.map(r => ({
      ruleId:               Number(r.RuleId ?? r.ruleId),
      ruleName:             String(r.RuleName ?? r.ruleName ?? ''),
      description:          String(r.Description ?? r.description ?? ''),
      isPatternRule:        Boolean(r.IsPatternRule ?? r.isPatternRule),
      patternCount:         r.PatternCount != null ? Number(r.PatternCount) : undefined,
      patternWindowMinutes: r.PatternTimeWindowMinutes != null ? Number(r.PatternTimeWindowMinutes) : undefined,
      isActive:             Boolean(r.IsEnabled ?? r.isActive),
      cooldownPeriodMinutes: Number(r.CooldownPeriodMinutes ?? r.cooldownPeriodMinutes ?? 0),
      conditionsCount:      Number(r.ConditionsCount ?? r.conditionsCount ?? 0),
      createdAt:            String(r.CreatedAt ?? r.createdAt ?? ''),
      cooldownRemaining:    undefined,
    }))
  } catch { return [] }
}

function applyCooldown(html: string, rules: Rule[]): Rule[] {
  const matches = [...html.matchAll(/cooldownData\[(\d+)\]\s*=\s*"([^"]+)"/g)]
  if (!matches.length) return rules
  const copy = rules.map(r => ({ ...r }))
  for (const [, id, status] of matches) {
    const rule = copy.find(r => r.ruleId === Number(id))
    if (rule) rule.cooldownRemaining = status
  }
  return copy
}

async function loadRuleForEdit(id: number): Promise<Partial<RuleForm>> {
  // ── prefer dedicated JSON API ──────────────────────────────────────────
  try {
    const res = await apiClient.get<RuleApiDetail>(`/Rules/Api/Details/${id}`)
    const d = res.data
    if (d && d.ruleId) {
      return {
        ruleId:               d.ruleId,
        ruleName:             d.ruleName ?? '',
        description:          d.description ?? '',
        mappingId:            d.mappingId ?? '',
        selectedEnvIds:       Array.isArray(d.selectedEnvironmentIds) ? d.selectedEnvironmentIds : [],
        cooldownPeriodMinutes: d.cooldownPeriodMinutes ?? 15,
        isEnabled:            d.isEnabled ?? false,
        isPatternRule:        d.isPatternRule ?? false,
        patternCount:         d.patternCount ?? 2,
        patternTimeWindowMinutes: d.patternTimeWindowMinutes ?? 60,
        conditions:           Array.isArray(d.conditions) && d.conditions.length ? d.conditions : BLANK_FORM.conditions,
      }
    }
  } catch { /* fall through to HTML scraping */ }

  // ── fallback: parse Razor Edit HTML ───────────────────────────────────
  try {
    const res = await apiClient.get<string>(`/Rules/Edit/${id}`, {
      responseType: 'text',
      headers: { Accept: 'text/html' },
    })
    const html = typeof res.data === 'string' ? res.data : ''

    const getInput = (name: string): string => {
      const m = html.match(new RegExp(`name="${name}"[^>]+value="([^"]*)"`, 'i'))
               ?? html.match(new RegExp(`value="([^"]*)"[^>]+name="${name}"`, 'i'))
      return m?.[1] ?? ''
    }

    const conditionsMatch = html.match(/const existingConditions\s*=\s*(\[[\s\S]*?\]);/)
    let conditions: ConditionRow[] = []
    if (conditionsMatch) {
      try {
        const raw: Record<string, unknown>[] = JSON.parse(conditionsMatch[1])
        conditions = raw.map(c => ({
          fieldName:       String(c.FieldName ?? c.fieldName ?? ''),
          operator:        String(c.Operator ?? c.operator ?? 'Equals'),
          value:           String(c.Value ?? c.value ?? ''),
          logicalOperator: String(c.LogicalOperator ?? c.logicalOperator ?? ''),
          groupLevel:      Number(c.GroupLevel ?? c.groupLevel ?? 0),
        }))
      } catch { /* ignore */ }
    }

    const mapMatch = html.match(/const initialMappingId\s*=\s*(\d+|null)/)
    const envMatch = html.match(/const initialEnvironmentIds\s*=\s*'([^']*)'/)
    let selectedEnvIds: number[] = []
    if (envMatch?.[1]) {
      try { selectedEnvIds = JSON.parse(envMatch[1]) } catch { /* ignore */ }
    }

    return {
      ruleId:               Number(getInput('RuleId')) || id,
      ruleName:             getInput('RuleName'),
      description:          getInput('Description'),
      mappingId:            mapMatch?.[1] && mapMatch[1] !== 'null' ? Number(mapMatch[1]) : '',
      selectedEnvIds,
      cooldownPeriodMinutes: Number(getInput('CooldownPeriodMinutes')) || 15,
      isEnabled:            html.includes('name="IsEnabled" type="checkbox"') && html.includes('checked'),
      isPatternRule:        html.includes('id="isPatternRule"') && html.includes('checked'),
      patternCount:         Number(getInput('PatternCount')) || 2,
      patternTimeWindowMinutes: Number(getInput('PatternTimeWindowMinutes')) || 60,
      conditions: conditions.length ? conditions : BLANK_FORM.conditions,
    }
  } catch { return {} }
}

// ── ConditionsBuilder ──────────────────────────────────────────────────────

interface CondBuilderProps {
  conditions: ConditionRow[]
  onChange: (c: ConditionRow[]) => void
}

function ConditionsBuilder({ conditions, onChange }: CondBuilderProps) {
  const updateCond = (i: number, field: keyof ConditionRow, val: string | number) => {
    onChange(conditions.map((c, idx) => idx === i ? { ...c, [field]: val } : c))
  }
  const addCond = () =>
    onChange([...conditions, { fieldName: 'Status', operator: 'Equals', value: '', logicalOperator: 'AND', groupLevel: 0 }])
  const removeCond = (i: number) => onChange(conditions.filter((_, idx) => idx !== i))

  return (
    <div>
      {conditions.map((c, i) => (
        <div key={i} className="d-flex gap-2 align-items-center mb-2 flex-wrap">
          {i > 0 && (
            <select
              className="form-select form-select-sm bg-dark text-white border-secondary"
              style={{ width: 72 }}
              value={c.logicalOperator}
              onChange={e => updateCond(i, 'logicalOperator', e.target.value)}
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
          )}
          <select
            className="form-select form-select-sm bg-dark text-white border-secondary"
            style={{ width: 210 }}
            value={c.fieldName}
            onChange={e => updateCond(i, 'fieldName', e.target.value)}
          >
            {AVAILABLE_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            className="form-select form-select-sm bg-dark text-white border-secondary"
            style={{ width: 160 }}
            value={c.operator}
            onChange={e => updateCond(i, 'operator', e.target.value)}
          >
            {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          {!VALUE_FREE.includes(c.operator) && (
            <input
              className="form-control form-control-sm bg-dark text-white border-secondary"
              style={{ width: 160 }}
              placeholder="Value"
              value={c.value}
              onChange={e => updateCond(i, 'value', e.target.value)}
            />
          )}
          <select
            className="form-select form-select-sm bg-dark text-white border-secondary"
            title="Group level"
            style={{ width: 76 }}
            value={c.groupLevel}
            onChange={e => updateCond(i, 'groupLevel', Number(e.target.value))}
          >
            <option value={0}>G0</option>
            <option value={1}>G1</option>
            <option value={2}>G2</option>
          </select>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeCond(i)}>
            <i className="fas fa-times" />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm btn-outline-secondary mt-1" onClick={addCond}>
        <i className="fas fa-plus me-1" />Add Condition
      </button>
    </div>
  )
}

// ── RuleFormModal ──────────────────────────────────────────────────────────

interface RuleFormModalProps {
  ruleId?: number
  mappings: MappingOption[]
  onClose: () => void
  onSaved: () => void
}

function RuleFormModal({ ruleId, mappings, onClose, onSaved }: RuleFormModalProps) {
  const isEdit = !!ruleId
  const [form, setForm] = useState<RuleForm>({ ...BLANK_FORM })
  const [activeTab, setActiveTab] = useState<'basic'|'conditions'>('basic')
  const [envOptions, setEnvOptions] = useState<EnvOption[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; matchCount?: number; message?: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const loadEnvs = useCallback(async (mappingId: number) => {
    if (!mappingId) return
    try {
      const res = await apiClient.get<EnvOption[]>(`/Rules/GetEnvironmentsByMapping/${mappingId}`)
      setEnvOptions(Array.isArray(res.data) ? res.data : [])
    } catch { setEnvOptions([]) }
  }, [])

  useEffect(() => {
    if (isEdit && ruleId) {
      setLoading(true)
      loadRuleForEdit(ruleId).then(data => {
        setForm(f => ({ ...f, ...data }))
        if (data.mappingId) loadEnvs(Number(data.mappingId))
        setLoading(false)
      })
    }
  }, [isEdit, ruleId, loadEnvs])

  const setF = <K extends keyof RuleForm>(key: K, val: RuleForm[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const handleMappingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value === '' ? '' : Number(e.target.value)
    setF('mappingId', val as number | '')
    setF('selectedEnvIds', [])
    setEnvOptions([])
    if (val) loadEnvs(Number(val))
  }

  const toggleEnv = (id: number) =>
    setF('selectedEnvIds', form.selectedEnvIds.includes(id)
      ? form.selectedEnvIds.filter(x => x !== id)
      : [...form.selectedEnvIds, id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.ruleName.trim()) { setError('Rule Name is required.'); return }
    if (!form.mappingId) { setError('A Mapping must be selected.'); return }
    if (!form.conditions.length) { setError('At least one condition is required.'); return }

    setSaving(true)
    setError('')
    try {
      const getUrl = isEdit ? `/Rules/Edit/${ruleId}` : '/Rules/Create'
      const postUrl = isEdit ? `/Rules/Edit/${ruleId}` : '/Rules/Create'
      const token = await getAntiForgeryToken(getUrl)

      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      if (isEdit) params.set('RuleId', String(ruleId))
      params.set('RuleName', form.ruleName.trim())
      params.set('Description', form.description)
      params.set('MappingId', String(form.mappingId))
      params.set('SelectedEnvironmentIds', JSON.stringify(form.selectedEnvIds))
      params.set('CooldownPeriodMinutes', String(form.cooldownPeriodMinutes))
      params.set('IsEnabled', form.isEnabled ? 'true' : 'false')
      params.set('IsPatternRule', form.isPatternRule ? 'true' : 'false')
      if (form.isPatternRule) {
        params.set('PatternCount', String(form.patternCount))
        params.set('PatternTimeWindowMinutes', String(form.patternTimeWindowMinutes))
      }
      form.conditions.forEach((c, i) => {
        params.set(`Conditions[${i}].FieldName`, c.fieldName)
        params.set(`Conditions[${i}].Operator`, c.operator)
        params.set(`Conditions[${i}].Value`, VALUE_FREE.includes(c.operator) ? '' : c.value)
        params.set(`Conditions[${i}].LogicalOperator`, i === 0 ? '' : c.logicalOperator)
        params.set(`Conditions[${i}].GroupLevel`, String(c.groupLevel))
        params.set(`Conditions[${i}].SequenceOrder`, String(i + 1))
      })

      const res = await apiClient.post(postUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      if (wasRedirected(res, postUrl)) {
        onSaved()
      } else {
        setError('Validation error — check required fields.')
      }
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const testConditions = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await apiClient.post<{ success: boolean; matchCount: number; message?: string }>(
        '/Rules/TestConditions',
        { conditions: form.conditions.map(c => ({
            fieldName: c.fieldName, operator: c.operator, value: c.value,
            logicalOperator: c.logicalOperator, groupLevel: c.groupLevel,
          })),
          timeWindowMinutes: 60,
          useRedis: true,
        }
      )
      setTestResult(res.data)
    } catch {
      setTestResult({ success: false, message: 'Test request failed' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1055, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '2rem 1rem' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 900, background: 'rgba(15,23,42,.98)', border: '1px solid rgba(46,134,193,.3)', borderRadius: 8 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-center p-4 border-bottom border-secondary">
          <h5 className="text-white mb-0">
            <i className={`fas fa-${isEdit ? 'edit' : 'plus'} me-2 text-primary`} />
            {isEdit ? 'Edit Rule' : 'Create Rule'}
          </h5>
          <button className="btn-close btn-close-white" onClick={onClose} />
        </div>

        {loading ? (
          <div className="text-center py-5"><span className="spinner-border text-primary" /></div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-4 pt-3">
              <ul className="nav nav-pills" style={{ gap: 8 }}>
                {(['basic','conditions'] as const).map(t => (
                  <li key={t} className="nav-item">
                    <button
                      type="button"
                      className={`nav-link ${activeTab === t ? 'active' : 'text-secondary'}`}
                      style={{ fontSize: 13 }}
                      onClick={() => setActiveTab(t)}
                    >
                      {t === 'basic' ? '1  Basic Configuration' : '2  Conditions'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4">
              {error && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>{error}</div>}

              {activeTab === 'basic' && (
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label text-white" style={{ fontSize: 13 }}>Mapping *</label>
                    <select className="form-select bg-dark text-white border-secondary" value={form.mappingId} onChange={handleMappingChange} required>
                      <option value="">— Select Mapping —</option>
                      {mappings.map(m => (
                        <option key={m.mappingId} value={m.mappingId}>{m.displayName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-white" style={{ fontSize: 13 }}>Environments</label>
                    <div className="p-2 rounded border border-secondary" style={{ background: 'rgba(0,0,0,.3)', minHeight: 38, maxHeight: 120, overflowY: 'auto' }}>
                      {envOptions.length === 0
                        ? <span className="text-muted" style={{ fontSize: 12 }}>Select a mapping to load environments</span>
                        : envOptions.map(env => (
                          <div key={env.environmentId} className="form-check mb-0">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id={`env-${env.environmentId}`}
                              checked={form.selectedEnvIds.includes(env.environmentId)}
                              onChange={() => toggleEnv(env.environmentId)}
                            />
                            <label className="form-check-label text-white" htmlFor={`env-${env.environmentId}`} style={{ fontSize: 12 }}>
                              {env.environmentName}
                            </label>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                  <div className="col-md-8">
                    <label className="form-label text-white" style={{ fontSize: 13 }}>Rule Name *</label>
                    <input className="form-control bg-dark text-white border-secondary" value={form.ruleName} onChange={e => setF('ruleName', e.target.value)} required />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label text-white" style={{ fontSize: 13 }}>Cooldown (min)</label>
                    <input type="number" className="form-control bg-dark text-white border-secondary" value={form.cooldownPeriodMinutes} onChange={e => setF('cooldownPeriodMinutes', Number(e.target.value))} min={1} max={10080} />
                  </div>
                  <div className="col-12">
                    <label className="form-label text-white" style={{ fontSize: 13 }}>Description</label>
                    <input className="form-control bg-dark text-white border-secondary" value={form.description} onChange={e => setF('description', e.target.value)} />
                  </div>
                  <div className="col-12">
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" id="chkIsEnabled" checked={form.isEnabled} onChange={e => setF('isEnabled', e.target.checked)} />
                      <label className="form-check-label text-white" htmlFor="chkIsEnabled" style={{ fontSize: 13 }}>Enabled</label>
                    </div>
                  </div>
                  <div className="col-12">
                    <div className="form-check mb-2">
                      <input className="form-check-input" type="checkbox" id="chkPattern" checked={form.isPatternRule} onChange={e => setF('isPatternRule', e.target.checked)} />
                      <label className="form-check-label text-white" htmlFor="chkPattern" style={{ fontSize: 13 }}>Pattern Rule (trigger after repeated matches)</label>
                    </div>
                    {form.isPatternRule && (
                      <div className="row g-2 ms-3">
                        <div className="col-auto">
                          <label className="form-label text-white" style={{ fontSize: 13 }}>Trigger Count</label>
                          <input type="number" className="form-control form-control-sm bg-dark text-white border-secondary" value={form.patternCount} onChange={e => setF('patternCount', Number(e.target.value))} min={1} style={{ width: 100 }} />
                        </div>
                        <div className="col-auto">
                          <label className="form-label text-white" style={{ fontSize: 13 }}>Within (min)</label>
                          <input type="number" className="form-control form-control-sm bg-dark text-white border-secondary" value={form.patternTimeWindowMinutes} onChange={e => setF('patternTimeWindowMinutes', Number(e.target.value))} min={1} style={{ width: 100 }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'conditions' && (
                <div>
                  <p className="text-muted mb-3" style={{ fontSize: 13 }}>
                    Define the conditions that trigger this rule. Use AND/OR to combine conditions; use Group (G0/G1/G2) for nested logic.
                  </p>
                  <ConditionsBuilder conditions={form.conditions} onChange={c => setF('conditions', c)} />
                  <div className="mt-4">
                    <button type="button" className="btn btn-outline-info btn-sm" onClick={testConditions} disabled={testing}>
                      {testing ? <><span className="spinner-border spinner-border-sm me-2" />Testing…</> : 'Test Against Last 60 min'}
                    </button>
                    {testResult && (
                      <div className={`mt-2 p-2 rounded border ${testResult.success ? 'border-success' : 'border-danger'}`} style={{ fontSize: 13 }}>
                        {testResult.success
                          ? <span className="text-success">{testResult.matchCount} matching transactions in the last 60 minutes.</span>
                          : <span className="text-danger">{testResult.message ?? 'Test failed'}</span>
                        }
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="d-flex justify-content-between gap-2 p-4 border-top border-secondary">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setActiveTab(activeTab === 'basic' ? 'conditions' : 'basic')}>
                {activeTab === 'basic' ? 'Next: Conditions →' : '← Back: Basic Config'}
              </button>
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving
                    ? <><span className="spinner-border spinner-border-sm me-2" />{isEdit ? 'Saving…' : 'Creating…'}</>
                    : isEdit ? 'Save Changes' : 'Create Rule'
                  }
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── RuleTestModal ──────────────────────────────────────────────────────────

interface RuleTestModalProps {
  rule: Rule
  onClose: () => void
}

function RuleTestModal({ rule, onClose }: RuleTestModalProps) {
  const [result, setResult] = useState<TestComprehensiveResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)

  const runTest = useCallback(async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    setSendResult(null)
    try {
      const r = await apiClient.post<TestComprehensiveResult>('/Rules/TestComprehensive', { ruleId: rule.ruleId })
      setResult(r.data)
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data
      setError(errData?.error ?? errData?.message ?? 'Test request failed. Check the backend logs.')
    } finally {
      setRunning(false)
    }
  }, [rule.ruleId])

  useEffect(() => { runTest() }, [runTest])

  const sendTestMessage = async () => {
    setSending(true)
    setSendResult(null)
    try {
      const r = await apiClient.post<{ success: boolean; message?: string }>('/Rules/SendTestMessage', { ruleId: rule.ruleId })
      setSendResult(r.data?.message ?? (r.data?.success ? 'Message sent successfully.' : 'Send failed.'))
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setSendResult(msg ?? 'Failed to send test message.')
    } finally {
      setSending(false)
    }
  }

  const sampleCols: string[] = result?.sampleMatches?.length
    ? Object.keys(result.sampleMatches[0]).slice(0, 6)
    : []

  const labelStyle: React.CSSProperties = {
    color: '#94A3B8', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 6,
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1060, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0F172A', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, width: '100%', maxWidth: 960, boxShadow: '0 24px 60px rgba(0,0,0,.8)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(46,134,193,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h5 style={{ color: '#fff', margin: 0, fontWeight: 700 }}>
            <i className="fas fa-vial me-2 text-info" />
            Test Rule &mdash; <span style={{ color: '#94A3B8', fontWeight: 400 }}>{rule.ruleName}</span>
          </h5>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer' }}>&times;</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {running && (
            <div className="text-center py-5">
              <span className="spinner-border text-info" style={{ display: 'block', margin: '0 auto 12px' }} />
              <p className="text-muted mb-0" style={{ fontSize: 13 }}>Running comprehensive test against live transaction data&hellip;</p>
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
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(46,134,193,.1)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6, padding: '7px 14px', fontSize: 12 }}>
                  <span style={{ color: '#94A3B8' }}>Matches: </span>
                  <span style={{ color: '#F1F5F9', fontWeight: 600 }}>{result.matchCount}</span>
                </div>
                <div style={{
                  background: result.success ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
                  border: `1px solid ${result.success ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
                  borderRadius: 6, padding: '7px 14px', fontSize: 12,
                }}>
                  <span style={{ color: '#94A3B8' }}>Result: </span>
                  <span style={{ color: result.success ? '#4ADE80' : '#EF4444', fontWeight: 600 }}>
                    {result.success ? 'Passed' : (result.message ?? 'No matches')}
                  </span>
                </div>
              </div>

              {/* Per-condition evaluation */}
              {result.conditionResults && result.conditionResults.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={labelStyle}>Condition Evaluation</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'rgba(46,134,193,.1)' }}>
                          {['Field', 'Operator', 'Expected', 'Actual', 'Match'].map(h => (
                            <th key={h} style={{ padding: '7px 12px', textAlign: h === 'Match' ? 'center' : 'left', color: '#94A3B8', fontWeight: 600, borderBottom: '1px solid rgba(46,134,193,.2)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.conditionResults.map((cr, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(46,134,193,.1)' }}>
                            <td style={{ padding: '6px 12px', color: '#F1F5F9' }}>{cr.fieldName}</td>
                            <td style={{ padding: '6px 12px', color: '#94A3B8' }}>{cr.operator}</td>
                            <td style={{ padding: '6px 12px', color: '#FED7AA' }}>{cr.value || '—'}</td>
                            <td style={{ padding: '6px 12px', color: '#94A3B8' }}>{cr.actualValue ?? '—'}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                              {cr.matched
                                ? <i className="fas fa-check-circle text-success" />
                                : <i className="fas fa-times-circle text-danger" />
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Resolved URL and rendered message preview */}
              {(result.resolvedUrl || result.resolvedMessage) && (
                <div style={{ display: 'grid', gridTemplateColumns: result.resolvedUrl && result.resolvedMessage ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 20 }}>
                  {result.resolvedUrl && (
                    <div>
                      <div style={labelStyle}>Resolved URL</div>
                      <div style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6, padding: '10px 12px' }}>
                        <code style={{ color: '#FED7AA', fontSize: 12, wordBreak: 'break-all' }}>{result.resolvedUrl}</code>
                      </div>
                    </div>
                  )}
                  {result.resolvedMessage && (
                    <div>
                      <div style={labelStyle}>Rendered Message Preview</div>
                      <pre style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6, padding: '10px 12px', fontSize: 11, color: '#F1F5F9', overflowX: 'auto', maxHeight: 180, overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {result.resolvedMessage}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Sample matches table */}
              {result.sampleMatches && result.sampleMatches.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={labelStyle}>Sample Matches ({result.sampleMatches.length})</div>
                  <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: 'rgba(46,134,193,.1)' }}>
                          {sampleCols.map(col => (
                            <th key={col} style={{ padding: '6px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, borderBottom: '1px solid rgba(46,134,193,.2)', whiteSpace: 'nowrap' }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.sampleMatches.map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(46,134,193,.08)' }}>
                            {sampleCols.map(col => (
                              <td key={col} style={{ padding: '5px 10px', color: '#F1F5F9', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {String(row[col] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Send test message result */}
              {sendResult && (
                <div style={{ background: 'rgba(46,134,193,.08)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#F1F5F9', marginTop: 8 }}>
                  <i className="fas fa-paper-plane me-2 text-info" />{sendResult}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(46,134,193,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={runTest}
              disabled={running}
              style={{ background: 'linear-gradient(135deg,#0e7490,#0891b2)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 6, fontWeight: 600, cursor: running ? 'wait' : 'pointer', fontSize: 13 }}
            >
              <i className="fas fa-redo me-2" />{running ? 'Running…' : 'Re-run Test'}
            </button>
            {result?.success && (
              <button
                type="button"
                onClick={sendTestMessage}
                disabled={sending}
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 6, fontWeight: 600, cursor: sending ? 'wait' : 'pointer', fontSize: 13 }}
              >
                <i className="fas fa-paper-plane me-2" />{sending ? 'Sending…' : 'Send Test Message'}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid rgba(148,163,184,.4)', color: '#94A3B8', padding: '8px 18px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RulesPage ──────────────────────────────────────────────────────────────

export default function RulesPage() {
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<number | null>(null)
  const [testTarget, setTestTarget] = useState<Rule | null>(null)

  const { data, isFetching, isError } = useQuery<RulesResponse>({
    queryKey: ['rules'],
    queryFn: async () => {
      // Try dedicated JSON endpoint first
      try {
        const r = await apiClient.get<{ rules: Array<Rule & { patternTimeWindowMinutes?: number }> }>(
          '/Rules/GetRulesJson',
          { headers: { Accept: 'application/json' } },
        )
        if (r.data?.rules) {
          // Normalise both possible camelCase names from .NET serialisation
          const rules: Rule[] = r.data.rules.map(rule => ({
            ...rule,
            patternWindowMinutes: rule.patternWindowMinutes ?? rule.patternTimeWindowMinutes,
          }))
          return { rules }
        }
      } catch { /* fall through */ }

      // Fall back: parse Razor Index HTML
      const htmlRes = await apiClient.get<string>('/Rules', {
        responseType: 'text',
        headers: { Accept: 'text/html' },
      })
      const html = typeof htmlRes.data === 'string' ? htmlRes.data : ''
      let rules = parseRulesHtml(html)
      rules = applyCooldown(html, rules)
      if (!rules.length && !html.includes('rulesData')) throw new Error('no-data')
      return { rules }
    },
    retry: false,
  })

  const { data: mappings = [] } = useQuery<MappingOption[]>({
    queryKey: ['mappings-for-rules'],
    queryFn: () => apiClient.get<MappingOption[]>('/Rules/GetMappings').then(r => r.data),
  })

  const rules = data?.rules ?? []

  const enableMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAntiForgeryToken('/Rules')
      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      return apiClient.post(`/Rules/Enable/${id}`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  })

  const disableMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAntiForgeryToken('/Rules')
      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      return apiClient.post(`/Rules/Disable/${id}`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAntiForgeryToken(`/Rules/Delete/${id}`)
      const params = new URLSearchParams()
      if (token) params.set('__RequestVerificationToken', token)
      return apiClient.post(`/Rules/Delete/${id}`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      setDeleteTarget(null)
    },
  })

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) deleteMutation.mutate(deleteTarget.ruleId)
  }, [deleteTarget, deleteMutation])

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['rules'] })
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

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-code-branch me-2 text-primary" />Rules Engine
          </h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>WHEN to Send Alerts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <i className="fas fa-plus me-2" />Create Rule
        </button>
      </div>

      <div className="rounded" style={cardStyle}>
        {isFetching && (
          <div className="text-center py-5">
            <span className="spinner-border text-primary" />
          </div>
        )}

        {isError && (
          <div className="text-center py-5">
            <div style={{ fontSize: 48, opacity: .3, marginBottom: 16 }}>
              <i className="fas fa-code-branch" />
            </div>
            <p className="text-white mb-1">Rules Engine</p>
            <p className="text-muted" style={{ fontSize: 13 }}>
              Use the Create button above to add rules, or manage the full list in the .NET interface.
            </p>
            <button className="btn btn-outline-primary btn-sm mt-2" onClick={() => window.location.reload()}>
              <i className="fas fa-sync me-2" />Retry
            </button>
          </div>
        )}

        {!isFetching && !isError && (
          <DataGrid
            dataSource={rules}
            keyExpr="ruleId"
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
            <Pager showPageSizeSelector={true} allowedPageSizes={[25, 50]} showInfo={true} visible={true} />

            <Column
              dataField="ruleName"
              caption="Rule Name"
              width={220}
              cellRender={({ data }) => (
                <button className="btn btn-link text-primary text-decoration-none p-0" style={{ fontSize: 13 }} onClick={() => setEditTarget(data.ruleId)}>
                  {data.ruleName}
                </button>
              )}
            />
            <Column dataField="description" caption="Description" width={260} />
            <Column
              dataField="isPatternRule"
              caption="Type"
              width={130}
              cellRender={({ data }) => (
                data.isPatternRule
                  ? <span className="badge" style={{ background: '#a855f7', fontSize: 11 }}>
                      Pattern ({data.patternCount}×/{data.patternWindowMinutes}m)
                    </span>
                  : <span className="badge bg-primary" style={{ fontSize: 11 }}>Simple</span>
              )}
            />
            <Column
              dataField="isActive"
              caption="Status"
              width={130}
              cellRender={({ data }) => {
                if (data.cooldownRemaining) {
                  return <span className="badge bg-warning text-dark" style={{ fontSize: 11 }}>Cooldown {data.cooldownRemaining}</span>
                }
                return (
                  <span className={`badge ${data.isActive ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: 11 }}>
                    {data.isActive ? 'Active' : 'Disabled'}
                  </span>
                )
              }}
            />
            <Column
              dataField="conditionsCount"
              caption="Conditions"
              width={110}
              alignment="center"
              cellRender={({ value }) => (
                <span className="badge bg-secondary" style={{ fontSize: 11 }}>{value}</span>
              )}
            />
            <Column dataField="cooldownPeriodMinutes" caption="Cooldown (min)" width={130} alignment="center" />
            <Column dataField="createdAt" caption="Created" dataType="datetime" format="dd/MM/yyyy" width={120} />
            <Column
              caption="Actions"
              width={220}
              alignment="center"
              allowSorting={false}
              allowFiltering={false}
              cellRender={({ data }) => (
                <div className="d-flex gap-1 justify-content-center">
                  <button className="btn btn-sm btn-outline-info" title="Test Rule" onClick={() => setTestTarget(data)}>
                    <i className="fas fa-vial" />
                  </button>
                  <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => setEditTarget(data.ruleId)}>
                    <i className="fas fa-edit" />
                  </button>
                  <button
                    className="btn btn-sm btn-outline-warning"
                    title={data.isActive ? 'Disable' : 'Enable'}
                    onClick={() => data.isActive ? disableMutation.mutate(data.ruleId) : enableMutation.mutate(data.ruleId)}
                  >
                    <i className={`fas fa-${data.isActive ? 'pause' : 'play'}`} />
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

      {testTarget && (
        <RuleTestModal rule={testTarget} onClose={() => setTestTarget(null)} />
      )}

      {createOpen && (
        <RuleFormModal mappings={mappings} onClose={() => setCreateOpen(false)} onSaved={handleSaved} />
      )}

      {editTarget !== null && (
        <RuleFormModal ruleId={editTarget} mappings={mappings} onClose={() => setEditTarget(null)} onSaved={handleSaved} />
      )}

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
            <h5 className="text-white mb-2">Delete Rule?</h5>
            <p className="text-muted mb-4" style={{ fontSize: 13 }}>
              You are about to delete <strong className="text-white">"{deleteTarget.ruleName}"</strong>. This cannot be undone.
            </p>
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
