import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface AgentSkillCount {
  active: number
  total: number
}

interface Agent {
  id: number
  agentKey: string
  displayName: string
  shortDescription: string
  avatarUrl?: string
  model?: string
  leanPrompt: boolean
  displayOrder: number
  isActive: boolean
  lastModifiedAtUtc: string
  skillCounts?: AgentSkillCount
}

interface AgentForm {
  displayName: string
  avatarUrl: string
  shortDescription: string
  displayOrder: number
  isActive: boolean
  model: string
  leanPrompt: boolean
}

interface PromptSection {
  id: number
  slot: string
  body: string
  isActive: boolean
  defaultBody: string
}

interface SeedSuggestion {
  id: number
  text: string
  isActive: boolean
  displayOrder: number
}

interface AgentDetailResponse {
  id: number
  agentKey: string
  displayName: string
  shortDescription: string
  avatarUrl?: string
  model?: string
  leanPrompt: boolean
  displayOrder: number
  isActive: boolean
  lastModifiedAtUtc: string
  sections: PromptSection[]
  seeds: SeedSuggestion[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { value: '', label: 'Use appsettings default' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 — best quality, lowest rate limit' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fastest, highest rate limit' },
]

const SLOT_LABELS: Record<string, string> = {
  identity: 'Identity & Policy',
  dialect: 'Postgres Dialect Rules',
  ui_guard: 'Commercial UI Guardrail',
  learning: 'Self-Learning Workflow',
  meta: 'Meta Tag Instruction',
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(15,23,42,.85)', color: '#F1F5F9',
  border: '1px solid rgba(46,134,193,.3)', borderRadius: 8,
  padding: '8px 12px', fontSize: 14, fontFamily: 'inherit',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 180,
  resize: 'vertical',
  lineHeight: 1.5,
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
  fontSize: 13,
}

const labelStyle: React.CSSProperties = {
  display: 'block', color: '#94A3B8', fontSize: 12, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6,
}

// Helper to extract error message from Axios error
function getApiError(err: unknown): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'An error occurred.'
}

// ── EditModal ──────────────────────────────────────────────────────────────────

type ModalTab = 'identity' | 'prompt' | 'suggestions' | 'model'

function EditModal({
  agent,
  onClose,
  onSaved,
}: {
  agent: Agent
  onClose: () => void
  onSaved: () => void
}) {
  const [tab, setTab] = useState<ModalTab>('identity')

  // Identity / model form state
  const [form, setForm] = useState<AgentForm>({
    displayName: agent.displayName,
    avatarUrl: agent.avatarUrl ?? '',
    shortDescription: agent.shortDescription,
    displayOrder: agent.displayOrder,
    isActive: agent.isActive,
    model: agent.model ?? '',
    leanPrompt: agent.leanPrompt,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Prompt section state
  const [sections, setSections] = useState<PromptSection[]>([])
  const [sectionSaving, setSectionSaving] = useState<Record<string, boolean>>({})

  // Seed suggestion state
  const [seeds, setSeeds] = useState<SeedSuggestion[]>([])
  const [newSeedText, setNewSeedText] = useState('')
  const [seedSaving, setSeedSaving] = useState(false)
  const [editingSeedId, setEditingSeedId] = useState<number | null>(null)
  const [editingSeedText, setEditingSeedText] = useState('')

  // Detail loading
  const [detailLoaded, setDetailLoaded] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // Load sections and seeds once on mount
  useEffect(() => {
    apiClient
      .get<AgentDetailResponse>(`/api/agents/${agent.id}/detail`)
      .then(r => {
        setSections(r.data.sections)
        setSeeds(r.data.seeds)
        setDetailLoaded(true)
      })
      .catch(() => setDetailError('Failed to load prompt sections and suggestions.'))
  }, [agent.id])

  const set = (patch: Partial<AgentForm>) => setForm(f => ({ ...f, ...patch }))
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800) }

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Save identity + model via JSON API (PUT /api/agents/{id})
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiClient.put(`/api/agents/${agent.id}`, {
        displayName: form.displayName,
        avatarUrl: form.avatarUrl,
        shortDescription: form.shortDescription,
        model: form.model,
        leanPrompt: form.leanPrompt,
        displayOrder: form.displayOrder,
        isActive: form.isActive,
      })
      showToast('Saved.')
      onSaved()
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  // Update a section field in local state
  const updateSection = (slot: string, patch: Partial<PromptSection>) =>
    setSections(prev => prev.map(s => s.slot === slot ? { ...s, ...patch } : s))

  // Save one prompt section
  const handleSaveSection = async (section: PromptSection) => {
    setSectionSaving(prev => ({ ...prev, [section.slot]: true }))
    setError(null)
    try {
      await apiClient.post(`/api/agents/${agent.id}/sections`, {
        slot: section.slot,
        body: section.body,
        isActive: section.isActive,
      })
      showToast(`Saved "${SLOT_LABELS[section.slot] ?? section.slot}".`)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setSectionSaving(prev => ({ ...prev, [section.slot]: false }))
    }
  }

  // Restore a prompt section to its default body
  const handleRestoreSection = async (slot: string) => {
    setSectionSaving(prev => ({ ...prev, [slot]: true }))
    setError(null)
    try {
      const res = await apiClient.post<{ restoredBody: string }>(
        `/api/agents/${agent.id}/restore-section`,
        { slot },
      )
      updateSection(slot, { body: res.data.restoredBody, isActive: true })
      showToast(`Restored "${SLOT_LABELS[slot] ?? slot}" to default.`)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setSectionSaving(prev => ({ ...prev, [slot]: false }))
    }
  }

  // Add a new seed suggestion
  const handleAddSeed = async () => {
    const text = newSeedText.trim()
    if (!text) return
    setSeedSaving(true)
    setError(null)
    try {
      const res = await apiClient.post<SeedSuggestion>(`/api/agents/${agent.id}/seeds`, { text })
      setSeeds(prev => [...prev, res.data])
      setNewSeedText('')
      showToast('Seed suggestion added.')
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setSeedSaving(false)
    }
  }

  // Commit an inline seed text edit
  const handleSaveSeedEdit = async (seed: SeedSuggestion) => {
    const text = editingSeedText.trim() || seed.text
    setSeedSaving(true)
    setError(null)
    try {
      const res = await apiClient.put<SeedSuggestion>(
        `/api/agents/${agent.id}/seeds/${seed.id}`,
        { text, isActive: seed.isActive, displayOrder: seed.displayOrder },
      )
      setSeeds(prev => prev.map(s => s.id === seed.id ? res.data : s))
      setEditingSeedId(null)
      setEditingSeedText('')
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setSeedSaving(false)
    }
  }

  // Toggle a seed's isActive without opening the edit UI
  const handleToggleSeed = async (seed: SeedSuggestion) => {
    try {
      const res = await apiClient.put<SeedSuggestion>(
        `/api/agents/${agent.id}/seeds/${seed.id}`,
        { text: seed.text, isActive: !seed.isActive, displayOrder: seed.displayOrder },
      )
      setSeeds(prev => prev.map(s => s.id === seed.id ? res.data : s))
    } catch (err) {
      setError(getApiError(err))
    }
  }

  // Delete a seed suggestion
  const handleDeleteSeed = async (seedId: number) => {
    try {
      await apiClient.delete(`/api/agents/${agent.id}/seeds/${seedId}`)
      setSeeds(prev => prev.filter(s => s.id !== seedId))
    } catch (err) {
      setError(getApiError(err))
    }
  }

  // ── Tab button helper ─────────────────────────────────────────────────────

  const tabBtn = (t: ModalTab, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setTab(t)}
      style={{
        background: tab === t ? 'rgba(46,134,193,.18)' : 'transparent',
        color: tab === t ? '#fff' : '#94A3B8',
        border: '1px solid',
        borderColor: tab === t ? 'rgba(46,134,193,.5)' : 'transparent',
        borderBottom: 'none',
        padding: '9px 16px',
        borderRadius: '6px 6px 0 0',
        fontSize: 12, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '.06em',
        cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0F172A', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, width: '100%', maxWidth: 640, boxShadow: '0 24px 60px rgba(0,0,0,.8)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(46,134,193,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h5 style={{ color: '#fff', margin: 0, fontWeight: 700 }}>{agent.displayName}</h5>
            <code style={{ color: '#FED7AA', fontSize: 12 }}>{agent.agentKey}</code>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer' }}>&times;</button>
        </div>

        <div style={{ padding: '16px 22px 0' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(46,134,193,.3)', marginBottom: 18, overflowX: 'auto' }}>
            {tabBtn('identity', 'Identity')}
            {tabBtn('prompt', 'Prompt')}
            {tabBtn('suggestions', 'Suggestions')}
            {tabBtn('model', 'Model')}
          </div>

          {/* Feedback banners */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', color: '#EF4444', padding: '8px 14px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}
          {toast && (
            <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.4)', color: '#22C55E', padding: '8px 14px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
              {toast}
            </div>
          )}

          {/* ── Identity tab ─────────────────────────────────────────────── */}
          {tab === 'identity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Display Name</label>
                <input style={inputStyle} value={form.displayName} maxLength={80} required onChange={e => set({ displayName: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Avatar URL</label>
                <input style={inputStyle} value={form.avatarUrl} maxLength={256} onChange={e => set({ avatarUrl: e.target.value })} placeholder="Site-relative or absolute URL. Falls back to first letter." />
              </div>
              <div>
                <label style={labelStyle}>Short Description</label>
                <input style={inputStyle} value={form.shortDescription} maxLength={500} onChange={e => set({ shortDescription: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Display Order</label>
                <input type="number" style={inputStyle} value={form.displayOrder} onChange={e => set({ displayOrder: parseInt(e.target.value, 10) || 0 })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="agentIsActive" checked={form.isActive} onChange={e => set({ isActive: e.target.checked })} />
                <label htmlFor="agentIsActive" style={{ color: '#F1F5F9', fontSize: 13, cursor: 'pointer', margin: 0 }}>Active (visible in the agent menu)</label>
              </div>
            </div>
          )}

          {/* ── Prompt tab ───────────────────────────────────────────────── */}
          {tab === 'prompt' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {detailError && (
                <div style={{ color: '#EF4444', fontSize: 13 }}>{detailError}</div>
              )}
              {!detailLoaded && !detailError && (
                <div style={{ color: '#94A3B8', fontSize: 13 }}>Loading sections…</div>
              )}
              {detailLoaded && sections.map(section => (
                <div
                  key={section.slot}
                  style={{ background: 'rgba(46,134,193,.05)', border: '1px solid rgba(46,134,193,.15)', borderRadius: 8, padding: '14px 16px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ color: '#93C5FD', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      {SLOT_LABELS[section.slot] ?? section.slot}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94A3B8', fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={section.isActive}
                          onChange={e => updateSection(section.slot, { isActive: e.target.checked })}
                        />
                        Active
                      </label>
                      <SmallBtn
                        onClick={() => handleRestoreSection(section.slot)}
                        disabled={sectionSaving[section.slot]}
                        variant="muted"
                      >
                        Restore default
                      </SmallBtn>
                      <SmallBtn
                        onClick={() => handleSaveSection(section)}
                        disabled={sectionSaving[section.slot]}
                        variant="primary"
                      >
                        {sectionSaving[section.slot] ? 'Saving…' : 'Save'}
                      </SmallBtn>
                    </div>
                  </div>
                  <textarea
                    style={textareaStyle}
                    value={section.body}
                    onChange={e => updateSection(section.slot, { body: e.target.value })}
                    rows={8}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Suggestions tab ──────────────────────────────────────────── */}
          {tab === 'suggestions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {detailError && (
                <div style={{ color: '#EF4444', fontSize: 13 }}>{detailError}</div>
              )}
              {!detailLoaded && !detailError && (
                <div style={{ color: '#94A3B8', fontSize: 13 }}>Loading suggestions…</div>
              )}

              {/* Existing seeds */}
              {detailLoaded && seeds.length === 0 && (
                <div style={{ color: '#94A3B8', fontSize: 13 }}>No starter suggestions yet. Add one below.</div>
              )}
              {detailLoaded && seeds.map(seed => (
                <div
                  key={seed.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(46,134,193,.05)', border: '1px solid rgba(46,134,193,.15)',
                    borderRadius: 8, padding: '10px 12px',
                  }}
                >
                  {/* Active toggle */}
                  <input
                    type="checkbox"
                    title="Active"
                    checked={seed.isActive}
                    onChange={() => handleToggleSeed(seed)}
                    style={{ flexShrink: 0, cursor: 'pointer' }}
                  />

                  {/* Text (read or edit mode) */}
                  {editingSeedId === seed.id ? (
                    <input
                      style={{ ...inputStyle, flex: 1, padding: '5px 10px' }}
                      value={editingSeedText}
                      maxLength={240}
                      autoFocus
                      onChange={e => setEditingSeedText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveSeedEdit(seed)
                        if (e.key === 'Escape') { setEditingSeedId(null); setEditingSeedText('') }
                      }}
                    />
                  ) : (
                    <span
                      style={{ flex: 1, color: seed.isActive ? '#F1F5F9' : '#94A3B8', fontSize: 13, lineHeight: 1.4, cursor: 'text' }}
                      onDoubleClick={() => { setEditingSeedId(seed.id); setEditingSeedText(seed.text) }}
                    >
                      {seed.text}
                    </span>
                  )}

                  {/* Action buttons */}
                  {editingSeedId === seed.id ? (
                    <>
                      <SmallBtn onClick={() => handleSaveSeedEdit(seed)} disabled={seedSaving} variant="primary">Save</SmallBtn>
                      <SmallBtn onClick={() => { setEditingSeedId(null); setEditingSeedText('') }} variant="muted">Cancel</SmallBtn>
                    </>
                  ) : (
                    <>
                      <SmallBtn onClick={() => { setEditingSeedId(seed.id); setEditingSeedText(seed.text) }} variant="muted">Edit</SmallBtn>
                      <SmallBtn onClick={() => handleDeleteSeed(seed.id)} variant="danger">Del</SmallBtn>
                    </>
                  )}
                </div>
              ))}

              {/* Add new seed */}
              {detailLoaded && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="New starter suggestion (max 240 chars)…"
                    maxLength={240}
                    value={newSeedText}
                    onChange={e => setNewSeedText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSeed() }}
                  />
                  <button
                    type="button"
                    onClick={handleAddSeed}
                    disabled={seedSaving || !newSeedText.trim()}
                    style={{
                      background: 'linear-gradient(135deg,#2E86C1,#3498DB)',
                      border: 'none', color: '#fff', padding: '8px 16px',
                      borderRadius: 8, fontWeight: 600,
                      cursor: seedSaving || !newSeedText.trim() ? 'not-allowed' : 'pointer',
                      opacity: !newSeedText.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
                    }}
                  >
                    {seedSaving ? 'Adding…' : 'Add'}
                  </button>
                </div>
              )}
              <p style={{ color: '#64748B', fontSize: 11, margin: 0 }}>
                Double-click a suggestion to edit inline. Active suggestions are randomly sampled for the "Try asking" chips in the chat UI.
              </p>
            </div>
          )}

          {/* ── Model tab ────────────────────────────────────────────────── */}
          {tab === 'model' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Model</label>
                <select style={inputStyle} value={form.model} onChange={e => set({ model: e.target.value })}>
                  {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>
                  Leave on default to inherit <code style={{ color: '#FED7AA' }}>Anthropic:Model</code> from appsettings.json.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="leanPrompt" checked={form.leanPrompt} onChange={e => set({ leanPrompt: e.target.checked })} />
                <label htmlFor="leanPrompt" style={{ color: '#F1F5F9', fontSize: 13, cursor: 'pointer', margin: 0 }}>Lean prompt (smaller schema dump — recommended for Haiku)</label>
              </div>
            </div>
          )}
        </div>

        {/* Footer — only show primary Save for identity/model tabs */}
        {(tab === 'identity' || tab === 'model') && (
          <div style={{ padding: '16px 22px', display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(148,163,184,.4)', color: '#94A3B8', padding: '8px 18px', borderRadius: 8, fontWeight: 500, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving} style={{ background: 'linear-gradient(135deg,#2E86C1,#3498DB)', border: 'none', color: '#fff', padding: '8px 22px', borderRadius: 8, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
        {(tab === 'prompt' || tab === 'suggestions') && (
          <div style={{ padding: '12px 22px', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(148,163,184,.4)', color: '#94A3B8', padding: '8px 18px', borderRadius: 8, fontWeight: 500, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── SmallBtn ───────────────────────────────────────────────────────────────────

function SmallBtn({
  children,
  onClick,
  disabled,
  variant = 'primary',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'muted' | 'danger'
}) {
  const colors: Record<string, { color: string; border: string }> = {
    primary: { color: '#2E86C1', border: 'rgba(46,134,193,.4)' },
    muted:   { color: '#94A3B8', border: 'rgba(148,163,184,.4)' },
    danger:  { color: '#EF4444', border: 'rgba(239,68,68,.4)' },
  }
  const { color, border } = colors[variant]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid ${border}`,
        color,
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

// ── AgentCard ──────────────────────────────────────────────────────────────────

function AgentCard({ agent, onEdit }: { agent: Agent; onEdit: (a: Agent) => void }) {
  const initial = agent.displayName?.[0]?.toUpperCase() ?? '?'
  const counts = agent.skillCounts ?? { active: 0, total: 0 }
  const modDate = new Date(agent.lastModifiedAtUtc).toISOString().slice(0, 16).replace('T', ' ')

  return (
    <div style={{
      background: 'rgba(15,23,42,0.6)',
      border: '1px solid rgba(46,134,193,0.3)',
      borderRadius: 12, padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12,
      transition: 'transform 0.15s ease, border-color 0.15s ease',
    }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = 'translateY(-2px)'; el.style.borderColor = 'rgba(46,134,193,0.6)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = ''; el.style.borderColor = 'rgba(46,134,193,0.3)' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#2E86C1,#1E3A8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 22, overflow: 'hidden', flexShrink: 0 }}>
          {agent.avatarUrl ? <img src={agent.avatarUrl} alt={agent.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
        </div>
        <div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 17, margin: 0 }}>{agent.displayName}</p>
          <span style={{ color: '#94A3B8', fontSize: 12, fontFamily: 'JetBrains Mono,monospace' }}>{agent.agentKey}</span>
        </div>
      </div>

      <div style={{ color: '#BDC3C7', fontSize: 13, lineHeight: 1.45, minHeight: 38 }}>{agent.shortDescription}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        <MetaChip>{agent.model ? agent.model : 'model: appsettings'}</MetaChip>
        {agent.leanPrompt && <MetaChip>lean prompt</MetaChip>}
        <MetaChip>order {agent.displayOrder}</MetaChip>
        <MetaChip>{counts.active}/{counts.total} skills</MetaChip>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {agent.isActive
          ? <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.35)', display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active</span>
          : <span style={{ background: 'rgba(148,163,184,0.15)', color: '#94A3B8', border: '1px solid rgba(148,163,184,0.3)', display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Inactive</span>}
        <span style={{ color: '#94A3B8', fontSize: 11 }}>edited {modDate}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <ActionBtn onClick={() => onEdit(agent)}>Edit agent</ActionBtn>
        <ActionBtn to="/admin/agent-skills">Skills</ActionBtn>
      </div>
    </div>
  )
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: 'rgba(46,134,193,0.12)', color: '#93C5FD', border: '1px solid rgba(46,134,193,0.3)', fontSize: 11, padding: '2px 8px', borderRadius: 999, fontFamily: 'JetBrains Mono,monospace' }}>{children}</span>
  )
}

function ActionBtn({ href, to, onClick, children }: { href?: string; to?: string; onClick?: () => void; children: React.ReactNode }) {
  const style: React.CSSProperties = { background: 'transparent', border: '1px solid rgba(46,134,193,0.4)', color: '#2E86C1', padding: '6px 12px', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s ease' }
  const enter = (e: React.MouseEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.background = 'rgba(46,134,193,0.15)'; (e.currentTarget as HTMLElement).style.color = '#fff' }
  const leave = (e: React.MouseEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#2E86C1' }
  if (to) return <Link to={to} style={style} onMouseEnter={enter} onMouseLeave={leave}>{children}</Link>
  if (href) return <a href={href} style={style} onMouseEnter={enter} onMouseLeave={leave}>{children}</a>
  return <button type="button" style={style} onClick={onClick} onMouseEnter={enter} onMouseLeave={leave}>{children}</button>
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AgentsAdminPage() {
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const queryClient = useQueryClient()

  // Replace HTML-scraping with a plain JSON API call
  const { data: agents = [], isLoading, error } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () => apiClient.get<Agent[]>('/api/agents').then(r => r.data),
  })

  const pageStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)',
    minHeight: '100vh',
    padding: 20,
    color: '#F1F5F9',
  }

  return (
    <div style={pageStyle}>
      <h2 style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>Agents</h2>
      <p style={{ color: '#BDC3C7', fontSize: 14, marginBottom: 24 }}>
        Configure each AI agent's identity, system prompt, model, and starter suggestions. Skills are managed under Admin Hub &rarr; Agent Skills.
      </p>

      {isLoading && (
        <div style={{ color: '#94A3B8', textAlign: 'center', padding: '60px 20px' }}>Loading agents…</div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', padding: '10px 16px', borderRadius: 8, marginBottom: 16 }}>
          Failed to load agents.
        </div>
      )}

      {!isLoading && !error && agents.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94A3B8', padding: '60px 20px' }}>
          No agents yet. Restart the app to seed Nahual into the database.
        </div>
      )}

      {agents.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
          {agents.map(a => (
            <AgentCard key={a.id} agent={a} onEdit={setEditAgent} />
          ))}
        </div>
      )}

      {editAgent && (
        <EditModal
          agent={editAgent}
          onClose={() => setEditAgent(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['agents'] })
          }}
        />
      )}
    </div>
  )
}
