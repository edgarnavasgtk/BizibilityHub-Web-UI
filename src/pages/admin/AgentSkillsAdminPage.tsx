import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

interface AgentOption {
  key: string
  displayName: string
}

interface AgentSkill {
  id: string
  agentKey: string
  name: string
  slug: string
  description: string
  isActive: boolean
  displayOrder: number
  body?: string
  lastModifiedAtUtc: string
}

interface SkillForm {
  agentKey: string
  name: string
  slug: string
  description: string
  displayOrder: number
  isActive: boolean
  body: string
}

const EMPTY_FORM: SkillForm = {
  agentKey: '', name: '', slug: '', description: '', displayOrder: 100, isActive: true, body: '',
}

const pageStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)',
  minHeight: '100vh',
  padding: 20,
  color: '#F1F5F9',
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(15,23,42,.85)', color: '#F1F5F9',
  border: '1px solid rgba(46,134,193,.3)', borderRadius: 8,
  padding: '8px 12px', fontSize: 14, fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block', color: '#94A3B8', fontSize: 12, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6,
}

// ── SkillModal ─────────────────────────────────────────────────────────────────

function SkillModal({
  editId,
  initial,
  agents,
  onClose,
  onSaved,
  onDuplicated,
}: {
  editId: string | null
  initial: SkillForm
  agents: AgentOption[]
  onClose: () => void
  onSaved: () => void
  onDuplicated?: () => void
}) {
  const [form, setForm] = useState<SkillForm>(initial)
  const [saving, setSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<SkillForm>) => setForm(f => ({ ...f, ...patch }))

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editId) {
        await apiClient.put(`/api/agent-skills/${editId}`, form)
      } else {
        await apiClient.post('/api/agent-skills', form)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Failed to save. Check backend logs.')
    } finally {
      setSaving(false)
    }
  }

  const handleDuplicate = async () => {
    if (!editId) return
    setDuplicating(true)
    setError(null)
    try {
      await apiClient.post(`/api/agent-skills/${editId}/duplicate`)
      onDuplicated?.()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Failed to duplicate skill. Check backend logs.')
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0F172A', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, width: '100%', maxWidth: 700, boxShadow: '0 24px 60px rgba(0,0,0,.8)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(46,134,193,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h5 style={{ color: '#fff', margin: 0, fontWeight: 700 }}>
            {editId ? `Edit Skill — ${initial.name}` : 'New Agent Skill'}
          </h5>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 0 }}>
            {/* Left: metadata */}
            <div style={{ padding: '20px 18px', borderRight: '1px solid rgba(46,134,193,.15)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ color: '#2E86C1', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', margin: 0 }}>Skill Metadata</p>

              {error && (
                <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', color: '#EF4444', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                  {error}
                </div>
              )}

              <div>
                <label style={labelStyle}>Agent</label>
                {editId ? (
                  <>
                    <input type="text" value={form.agentKey} disabled style={{ ...inputStyle, background: 'rgba(15,23,42,.5)', color: '#94A3B8', cursor: 'not-allowed' }} />
                    <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>Locked after create.</div>
                  </>
                ) : (
                  <>
                    <select required style={inputStyle} value={form.agentKey} onChange={e => set({ agentKey: e.target.value })}>
                      <option value="">— Select agent —</option>
                      {agents.map(a => <option key={a.key} value={a.key}>{a.displayName} ({a.key})</option>)}
                    </select>
                    <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>Cannot be changed after create.</div>
                  </>
                )}
              </div>

              <div>
                <label style={labelStyle}>Name *</label>
                <input
                  required maxLength={120} style={inputStyle}
                  value={form.name}
                  onChange={e => {
                    const name = e.target.value
                    set({ name, slug: editId ? form.slug : autoSlug(name) })
                  }}
                />
              </div>

              <div>
                <label style={labelStyle}>Slug *</label>
                <input required maxLength={120} style={inputStyle} value={form.slug} onChange={e => set({ slug: e.target.value })} />
                <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>URL-safe identifier, unique per agent.</div>
              </div>

              <div>
                <label style={labelStyle}>Short Description</label>
                <input maxLength={500} style={inputStyle} value={form.description} onChange={e => set({ description: e.target.value })} />
              </div>

              <div>
                <label style={labelStyle}>Display Order</label>
                <input type="number" style={inputStyle} value={form.displayOrder} onChange={e => set({ displayOrder: parseInt(e.target.value, 10) || 0 })} />
                <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>Lower numbers appear first.</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => set({ isActive: e.target.checked })} />
                <label htmlFor="isActive" style={{ color: '#F1F5F9', fontSize: 13, cursor: 'pointer', margin: 0 }}>
                  Active (injected into agent's system prompt)
                </label>
              </div>
            </div>

            {/* Right: body markdown */}
            <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ color: '#2E86C1', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', margin: 0 }}>Skill Body (Markdown)</p>
              <textarea
                rows={18}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: "'JetBrains Mono',monospace", fontSize: 13, lineHeight: 1.55, flex: 1 }}
                value={form.body}
                onChange={e => set({ body: e.target.value })}
                placeholder="## Domain expertise&#10;&#10;Describe what this agent knows and how it should behave in this domain area..."
              />
              <div style={{ color: '#94A3B8', fontSize: 11 }}>Markdown supported. This text is injected verbatim into the agent's system prompt when active.</div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(46,134,193,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            {/* Left side: Duplicate (edit mode only) */}
            <div>
              {editId && (
                <button
                  type="button"
                  disabled={duplicating || saving}
                  onClick={handleDuplicate}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(251,191,36,.45)',
                    color: '#FCD34D',
                    padding: '8px 18px',
                    borderRadius: 8,
                    fontWeight: 500,
                    cursor: duplicating ? 'wait' : 'pointer',
                    fontSize: 13,
                  }}
                >
                  {duplicating ? 'Duplicating…' : 'Duplicate'}
                </button>
              )}
            </div>
            {/* Right side: Cancel / Save */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(148,163,184,.4)', color: '#94A3B8', padding: '8px 18px', borderRadius: 8, fontWeight: 500, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={saving || duplicating} style={{ background: 'linear-gradient(135deg,#2E86C1,#3498DB)', border: 'none', color: '#fff', padding: '8px 22px', borderRadius: 8, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Saving…' : (editId ? 'Save Changes' : 'Create Skill')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── BtnAction ──────────────────────────────────────────────────────────────────

function BtnAction({ onClick, danger, children }: {
  onClick?: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  const base: React.CSSProperties = {
    background: 'transparent',
    border: danger ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(46,134,193,0.4)',
    color: danger ? '#EF4444' : '#2E86C1',
    padding: '4px 10px', borderRadius: 6,
    textDecoration: 'none', fontSize: 12, cursor: 'pointer', marginLeft: 6,
    transition: 'background 0.15s ease',
    display: 'inline-block',
  }
  return (
    <button type="button" style={base} onClick={onClick}
      onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = danger ? 'rgba(239,68,68,0.15)' : 'rgba(46,134,193,0.15)'; el.style.color = '#fff' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = 'transparent'; el.style.color = danger ? '#EF4444' : '#2E86C1' }}
    >{children}</button>
  )
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function AgentSkillsAdminPage() {
  const [agentFilter, setAgentFilter] = useState('')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [modal, setModal] = useState<{ editId: string | null; initial: SkillForm } | null>(null)
  const queryClient = useQueryClient()

  const { data: agents = [] } = useQuery<AgentOption[]>({
    queryKey: ['agent-options'],
    queryFn: () => apiClient.get('/api/agents/options').then(r => r.data),
  })

  const { data: skills = [], isLoading } = useQuery<AgentSkill[]>({
    queryKey: ['agent-skills', agentFilter],
    queryFn: () =>
      apiClient.get('/api/agent-skills', { params: agentFilter ? { agent: agentFilter } : {} }).then(r => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/agent-skills/${id}/toggle-active`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] })
      setToast({ msg: 'Skill updated.' })
      setTimeout(() => setToast(null), 3000)
    },
    onError: () => setToast({ msg: 'Failed to toggle skill.', err: true }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/agent-skills/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] })
      setToast({ msg: 'Skill removed.' })
      setTimeout(() => setToast(null), 3000)
    },
    onError: () => setToast({ msg: 'Failed to remove skill.', err: true }),
  })

  const agentLabel = agents.find(a => a.key === agentFilter)?.displayName ?? agentFilter
  const activeCount = skills.filter(s => s.isActive).length

  const handleDelete = (s: AgentSkill) => {
    if (window.confirm(`Remove skill "${s.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(s.id)
    }
  }

  const openCreate = () => setModal({
    editId: null,
    initial: { ...EMPTY_FORM, agentKey: agentFilter },
  })

  const openEdit = (s: AgentSkill) => setModal({
    editId: s.id,
    initial: {
      agentKey: s.agentKey,
      name: s.name,
      slug: s.slug,
      description: s.description,
      displayOrder: s.displayOrder,
      isActive: s.isActive,
      body: s.body ?? '',
    },
  })

  return (
    <div style={pageStyle}>
      <h2 style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>Agent Skills</h2>
      <p style={{ color: '#BDC3C7', fontSize: 14, marginBottom: 24 }}>
        Curated domain skills injected into each agent's system prompt. Skills are scoped to a single agent.
        {agentFilter && <> Filtered to <strong style={{ color: '#FED7AA' }}>{agentLabel}</strong>.</>}
      </p>

      {toast && (
        <div style={{
          background: toast.err ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
          border: `1px solid ${toast.err ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
          color: toast.err ? '#EF4444' : '#22C55E',
          padding: '10px 16px', borderRadius: 8, marginBottom: 16,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ color: '#94A3B8', fontSize: 13 }}>
            {skills.length} total · {activeCount} active
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="agentFilter" style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Agent</label>
            <select
              id="agentFilter"
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value)}
              style={{
                background: 'rgba(15,23,42,0.85)', color: '#F1F5F9',
                border: '1px solid rgba(46,134,193,0.3)', borderRadius: 6,
                padding: '5px 10px', fontSize: 13,
              }}
            >
              <option value="">All agents</option>
              {agents.map(a => (
                <option key={a.key} value={a.key}>{a.displayName} ({a.key})</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={openCreate}
          style={{
            background: 'linear-gradient(135deg,#2E86C1,#3498DB)',
            color: '#fff', padding: '8px 16px', borderRadius: 8,
            border: 'none', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer',
          }}
        >
          ＋ New skill
        </button>
      </div>

      {isLoading && <div style={{ color: '#94A3B8', padding: '60px 20px', textAlign: 'center' }}>Loading…</div>}

      {!isLoading && skills.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94A3B8', padding: '60px 20px' }}>
          {agentFilter
            ? <>No skills for <strong>{agentLabel}</strong>. Click <strong>New skill</strong> to add one.</>
            : <>No skills yet. Click <strong>New skill</strong> to add one.</>}
        </div>
      )}

      {skills.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            background: 'rgba(15,23,42,0.6)',
            border: '1px solid rgba(46,134,193,0.3)',
            borderRadius: 12,
            overflow: 'hidden',
            borderCollapse: 'separate',
            borderSpacing: 0,
          }}>
            <thead>
              <tr>
                {['Agent', 'Name', 'Slug', 'Description', 'Status', 'Order', 'Last modified', 'Actions'].map(h => (
                  <th key={h} style={{
                    background: 'rgba(46,134,193,0.15)', color: '#2E86C1',
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.08em', padding: '12px 16px', textAlign: 'left',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skills.map(s => {
                const modDate = new Date(s.lastModifiedAtUtc).toISOString().slice(0, 16).replace('T', ' ')
                return (
                  <tr key={s.id}
                    onMouseEnter={e => Array.from((e.currentTarget as HTMLTableRowElement).cells).forEach(c => (c.style.background = 'rgba(46,134,193,0.06)'))}
                    onMouseLeave={e => Array.from((e.currentTarget as HTMLTableRowElement).cells).forEach(c => (c.style.background = ''))}
                  >
                    <td style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: '#94A3B8' }}>{s.agentKey}</span>
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', color: '#F1F5F9' }}>
                      <strong>{s.name}</strong>
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: '#94A3B8' }}>{s.slug}</span>
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', color: '#BDC3C7', fontSize: 13, maxWidth: 360 }}>
                      {s.description}
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      {s.isActive
                        ? <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.35)', display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Active</span>
                        : <span style={{ background: 'rgba(148,163,184,0.15)', color: '#94A3B8', border: '1px solid rgba(148,163,184,0.3)', display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Inactive</span>}
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'right', color: '#F1F5F9', fontVariantNumeric: 'tabular-nums' }}>
                      {s.displayOrder}
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', color: '#94A3B8', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {modDate}
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <BtnAction onClick={() => openEdit(s)}>Edit</BtnAction>
                      <BtnAction onClick={() => toggleMutation.mutate(s.id)}>
                        {s.isActive ? 'Deactivate' : 'Activate'}
                      </BtnAction>
                      <BtnAction danger onClick={() => handleDelete(s)}>Remove</BtnAction>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <SkillModal
          editId={modal.editId}
          initial={modal.initial}
          agents={agents}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            queryClient.invalidateQueries({ queryKey: ['agent-skills'] })
            setToast({ msg: modal.editId ? 'Skill saved.' : 'Skill created.' })
            setTimeout(() => setToast(null), 3000)
          }}
          onDuplicated={() => {
            setModal(null)
            queryClient.invalidateQueries({ queryKey: ['agent-skills'] })
            setToast({ msg: 'Skill duplicated successfully.' })
            setTimeout(() => setToast(null), 3000)
          }}
        />
      )}
    </div>
  )
}
