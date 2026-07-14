import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'
import { getFilterOptions } from '../../services/dashboardService'
import type { FilterOptions, SelectOption } from '../../types/api'

/* ── Types ──────────────────────────────────────────────────────── */
interface SectionItem {
  key: string
  label: string
  icon: string
}

interface SectionGroup {
  groupName: string
  groupIcon: string
  sections: SectionItem[]
}

/**
 * scopeValue is the integer entity ID (sent in POST, matches Razor scopeValue[]).
 * scopeLabel is optional — populated locally from filterOptions when adding a scope,
 * or may be returned by the server GET response for display.
 */
interface DataScope {
  sectionKey: string
  scopeType: number
  scopeValue: number
  scopeLabel?: string
}

interface AccessRole {
  roleName: string
  allowedSections: SectionItem[]
  dataScopes: DataScope[]
}

interface AccessScopeData {
  accessRoles: AccessRole[]
  sectionCheckGroups: SectionGroup[]
}

const SCOPE_TYPE_LABELS: Record<number, string> = {
  1: 'Process', 2: 'Subprocess', 3: 'Country', 4: 'Segment', 5: 'Brand',
}

/** Returns the appropriate entity list from filterOptions for a given scopeType. */
function getOptionsForType(type: number, opts: FilterOptions | undefined): SelectOption[] {
  if (!opts) return []
  switch (type) {
    case 1: return opts.businessProcesses
    case 2: return opts.businessSubprocesses
    case 3: return opts.countries
    case 4: return opts.businessSegments
    case 5: return opts.brands
    default: return []
  }
}

/* ── Styles ─────────────────────────────────────────────────────── */
const S = {
  page: {
    background: 'linear-gradient(180deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)',
    minHeight: '100vh', padding: '20px 0',
  } as React.CSSProperties,
  container: { maxWidth: 1200, margin: '0 auto', padding: '0 20px' } as React.CSSProperties,
  card: { border: '1.5px solid #334155', borderRadius: 10, overflow: 'hidden', background: '#1e293b' } as React.CSSProperties,
  cardHead: { background: '#0f172a', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
}

/* ── Role item ──────────────────────────────────────────────────── */
function RoleItem({ role, onEdit, onDelete }: {
  role: AccessRole
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid #334155' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', cursor: 'pointer', transition: 'background 0.12s' }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(15,23,42,0.6)'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}
      >
        <span style={{ color: '#94a3b8', width: 14, textAlign: 'center', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>›</span>
        <span style={{ background: '#1e293b', color: '#f1f5f9', fontSize: '.85rem', padding: '8px 14px', borderRadius: 999, border: '1px solid #334155', flexShrink: 0 }}>
          {role.roleName}
        </span>
        <span style={{ color: '#64748b', fontSize: '.82rem', flex: 1 }}>
          {role.allowedSections.length} sections
          {role.dataScopes.length > 0
            ? <span style={{ color: '#92400e', fontWeight: 600 }}> · {role.dataScopes.length} restrictions</span>
            : <span style={{ color: '#94a3b8' }}> · no restrictions</span>}
        </span>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            style={{ background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
          >Edit</button>
          <button
            onClick={onDelete}
            style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
          >Delete</button>
        </div>
      </div>
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '2px 20px 18px 48px' }}>
          {role.allowedSections.map(s => (
            <span key={s.key} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '.78rem', padding: '6px 11px', borderRadius: 999, fontWeight: 500 }}>
              {s.label}
            </span>
          ))}
          {role.dataScopes.length > 0 && (
            <>
              <span style={{ color: '#cbd5e1', margin: '0 4px' }}>|</span>
              {role.dataScopes.map((ds, i) => (
                <span key={i} style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontSize: '.74rem', padding: '5px 9px', borderRadius: 999 }}>
                  <span style={{ color: '#78350f' }}>{ds.sectionKey} · {SCOPE_TYPE_LABELS[ds.scopeType] ?? ds.scopeType}:</span>{' '}
                  {ds.scopeLabel ?? ds.scopeValue}
                </span>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Create / Edit Role Form ────────────────────────────────────── */
function CreateRoleForm({
  groups,
  onSaved,
  initialRole,
}: {
  groups: SectionGroup[]
  onSaved: () => void
  initialRole?: AccessRole
}) {
  const isEditing = !!initialRole

  const [roleName, setRoleName] = useState(initialRole?.roleName ?? '')
  const [selectedSections, setSelectedSections] = useState<string[]>(
    initialRole?.allowedSections.map(s => s.key) ?? []
  )
  const [dataScopes, setDataScopes] = useState<DataScope[]>(
    initialRole?.dataScopes ?? []
  )
  const [saving, setSaving] = useState(false)

  // Pending scope inputs
  const [pendingSection, setPendingSection] = useState('')
  const [pendingType, setPendingType] = useState<number>(3) // default: Country
  // string so it matches the native <select> value; parsed to Number on add
  const [pendingValue, setPendingValue] = useState<string>('')

  // Fetch the five dimension option lists from the API
  const { data: filterOptions, isLoading: optionsLoading } = useQuery<FilterOptions>({
    queryKey: ['filterOptions'],
    queryFn: getFilterOptions,
  })

  const currentOptions = getOptionsForType(pendingType, filterOptions)

  /* ── Section helpers ── */
  const allSections = groups.flatMap(g => g.sections)
  const sectionLabel = (key: string) => allSections.find(s => s.key === key)?.label ?? key

  const allSectionKeys = groups.flatMap(g => g.sections.map(s => s.key))

  const selectAllSections = () => setSelectedSections(allSectionKeys)

  const clearAllSections = () => {
    setSelectedSections([])
    setDataScopes([])
    setPendingSection('')
  }

  const toggleSection = (key: string) => {
    const willDeselect = selectedSections.includes(key)
    setSelectedSections(prev => willDeselect ? prev.filter(k => k !== key) : [...prev, key])
    if (willDeselect) {
      setDataScopes(prev => prev.filter(d => d.sectionKey !== key))
      if (pendingSection === key) setPendingSection('')
    }
  }

  /* ── Scope helpers ── */
  const addScope = () => {
    if (!pendingSection || !pendingValue) return
    const id = Number(pendingValue)
    if (!id) return
    const opts = getOptionsForType(pendingType, filterOptions)
    const found = opts.find(o => o.value === id)
    setDataScopes(prev => [
      ...prev,
      {
        sectionKey: pendingSection,
        scopeType: pendingType,
        scopeValue: id,
        scopeLabel: found?.text,
      },
    ])
    setPendingValue('')
  }

  const removeScope = (index: number) =>
    setDataScopes(prev => prev.filter((_, i) => i !== index))

  /* ── Submit: send {sectionKey, scopeType, scopeValue(int ID)} — no labels ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roleName.trim()) return
    setSaving(true)
    try {
      const payload = {
        roleName: roleName.trim(),
        sectionKeys: selectedSections,
        dataScopes: dataScopes.map(ds => ({
          sectionKey: ds.sectionKey,
          scopeType: ds.scopeType,
          scopeValue: ds.scopeValue,
        })),
      }
      if (isEditing) {
        await apiClient.put('/api/access-scope/roles', payload)
      } else {
        await apiClient.post('/api/access-scope/roles', payload)
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const selectStyle: React.CSSProperties = {
    background: '#1e293b', border: '1.5px solid #334155', borderRadius: 6, padding: '7px 10px',
    color: '#f1f5f9', fontSize: '.83rem', outline: 'none', cursor: 'pointer',
  }

  const canAdd = Boolean(pendingSection && pendingValue)

  return (
    <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
      {/* Role name */}
      <div style={{ background: '#0f172a', borderRadius: 10, padding: '24px 28px', marginBottom: 22, border: '1.5px solid #334155' }}>
        <label style={{ color: '#f1f5f9', fontSize: '1rem', fontWeight: 700, display: 'block', marginBottom: 6 }}>Role name</label>
        <p style={{ color: '#94a3b8', fontSize: '.82rem', marginBottom: 14 }}>Will appear in User Management where you can assign it to users.</p>
        <input
          type="text"
          value={roleName}
          onChange={e => setRoleName(e.target.value)}
          placeholder="e.g. Finance Team, IT Support, Operations Viewer"
          required
          maxLength={256}
          disabled={isEditing}
          style={{
            background: isEditing ? 'rgba(15,23,42,0.6)' : '#1e293b',
            border: '2px solid #334155', borderRadius: 8, padding: '10px 14px',
            color: isEditing ? '#94a3b8' : '#f1f5f9', fontSize: '1rem', width: '100%', maxWidth: 500, outline: 'none',
          }}
          onFocus={e => { if (!isEditing) e.target.style.borderColor = '#3b82f6' }}
          onBlur={e => (e.target.style.borderColor = '#334155')}
        />
        {isEditing && (
          <p style={{ color: '#64748b', fontSize: '.78rem', marginTop: 6 }}>Role name cannot be changed after creation.</p>
        )}
      </div>

      {/* Visible sections */}
      <div style={{ marginBottom: 22 }}>
        {/* Header row with Select all / Clear all bulk-action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '.95rem', margin: 0 }}>Visible sections</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={selectAllSections}
              style={{
                background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)',
                color: '#93c5fd', borderRadius: 6, padding: '4px 12px', fontSize: '.78rem',
                cursor: 'pointer', fontWeight: 600,
              }}
            >Select all</button>
            <button
              type="button"
              onClick={clearAllSections}
              style={{
                background: 'rgba(100,116,139,0.1)', border: '1px solid #475569',
                color: '#94a3b8', borderRadius: 6, padding: '4px 12px', fontSize: '.78rem',
                cursor: 'pointer', fontWeight: 600,
              }}
            >Clear all</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
          {groups.map(grp => (
            <div key={grp.groupName} style={{ border: '1.5px solid #334155', borderRadius: 10, overflow: 'hidden', background: '#0f172a' }}>
              <div style={{ background: '#1e293b', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#fff' }}>
                  {grp.groupName}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '.72rem', color: '#93c5fd', fontWeight: 600 }}>
                  {grp.sections.filter(s => selectedSections.includes(s.key)).length}/{grp.sections.length}
                </span>
              </div>
              <div style={{ padding: '10px 12px' }}>
                {grp.sections.map(sec => (
                  <div key={sec.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      id={`cb-${sec.key}`}
                      checked={selectedSections.includes(sec.key)}
                      onChange={() => toggleSection(sec.key)}
                      style={{ width: 17, height: 17, cursor: 'pointer', flexShrink: 0, marginTop: 2, accentColor: '#3b82f6' }}
                    />
                    <label htmlFor={`cb-${sec.key}`} style={{ cursor: 'pointer', color: '#e2e8f0', fontSize: '.86rem', lineHeight: 1.4, fontWeight: 500 }}>
                      {sec.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data restrictions */}
      <div style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', borderRadius: 10, padding: '20px 24px', marginBottom: 22 }}>
        <p style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '.95rem', marginBottom: 4 }}>Data restrictions</p>
        <p style={{ color: '#64748b', fontSize: '.80rem', marginBottom: 16 }}>
          Restrict which data records each section can see. Leave empty for no restrictions.
        </p>

        {/* Add scope row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
          {/* SECTION select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: '#94a3b8', fontSize: '.74rem', fontWeight: 600, letterSpacing: '.04em' }}>SECTION</span>
            <select
              value={pendingSection}
              onChange={e => setPendingSection(e.target.value)}
              style={{ ...selectStyle, minWidth: 160 }}
            >
              <option value="">— pick section —</option>
              {selectedSections.map(key => (
                <option key={key} value={key}>{sectionLabel(key)}</option>
              ))}
            </select>
          </div>

          {/* TYPE select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: '#94a3b8', fontSize: '.74rem', fontWeight: 600, letterSpacing: '.04em' }}>TYPE</span>
            <select
              value={pendingType}
              onChange={e => { setPendingType(Number(e.target.value)); setPendingValue('') }}
              style={{ ...selectStyle, minWidth: 130 }}
            >
              {(Object.entries(SCOPE_TYPE_LABELS) as [string, string][]).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>

          {/* VALUE select — entity-ID-backed, populated from filterOptions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 }}>
            <span style={{ color: '#94a3b8', fontSize: '.74rem', fontWeight: 600, letterSpacing: '.04em' }}>VALUE</span>
            {optionsLoading ? (
              <div style={{ ...selectStyle, minWidth: 180, color: '#64748b', display: 'flex', alignItems: 'center' }}>
                Loading options…
              </div>
            ) : (
              <select
                value={pendingValue}
                onChange={e => setPendingValue(e.target.value)}
                style={{ ...selectStyle, minWidth: 180, width: '100%' }}
              >
                <option value="">— select {SCOPE_TYPE_LABELS[pendingType] ?? 'value'} —</option>
                {currentOptions.map(opt => (
                  <option key={opt.value} value={String(opt.value)}>{opt.text}</option>
                ))}
              </select>
            )}
          </div>

          <button
            type="button"
            onClick={addScope}
            disabled={!canAdd}
            style={{
              background: !canAdd ? 'rgba(46,134,193,0.1)' : 'rgba(46,134,193,0.25)',
              border: '1px solid rgba(46,134,193,.4)', color: '#93c5fd',
              borderRadius: 6, padding: '7px 16px', fontSize: '.83rem',
              cursor: !canAdd ? 'not-allowed' : 'pointer',
              fontWeight: 600, flexShrink: 0,
            }}
          >+ Add</button>
        </div>

        {/* State hints */}
        {selectedSections.length === 0 && (
          <p style={{ color: '#475569', fontSize: '.8rem', fontStyle: 'italic' }}>Select at least one section above to add restrictions.</p>
        )}
        {selectedSections.length > 0 && dataScopes.length === 0 && (
          <p style={{ color: '#475569', fontSize: '.8rem', fontStyle: 'italic' }}>No restrictions added — this role will see all data.</p>
        )}

        {/* Scope chips */}
        {dataScopes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dataScopes.map((ds, i) => (
              <span
                key={i}
                style={{
                  background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                  fontSize: '.76rem', padding: '5px 9px', borderRadius: 999,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ color: '#78350f', fontWeight: 600 }}>
                  {sectionLabel(ds.sectionKey)} · {SCOPE_TYPE_LABELS[ds.scopeType] ?? ds.scopeType}:
                </span>
                {ds.scopeLabel ?? ds.scopeValue}
                <button
                  type="button"
                  onClick={() => removeScope(i)}
                  aria-label="Remove restriction"
                  style={{ background: 'none', border: 'none', color: '#92400e', cursor: 'pointer', padding: '0 0 0 2px', fontSize: '.9rem', lineHeight: 1, fontWeight: 700 }}
                >×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <div style={{ paddingTop: 16, borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          type="submit"
          disabled={saving || !roleName.trim()}
          style={{
            background: saving ? 'rgba(46,134,193,0.4)' : '#2E86C1',
            color: '#fff', padding: '10px 24px', borderRadius: 8, fontWeight: 600,
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14,
          }}
        >
          {saving
            ? (isEditing ? 'Saving…' : 'Creating…')
            : (isEditing ? 'Save changes' : 'Create access role')}
        </button>
        <span style={{ fontSize: 14, color: '#64748b' }}>
          {isEditing ? 'Updating' : 'Will create'}{' '}
          <strong style={{ color: '#f1f5f9' }}>{roleName || 'this role'}</strong> with{' '}
          <strong style={{ color: '#f1f5f9' }}>{selectedSections.length}</strong> sections
          {dataScopes.length > 0 && (
            <> · <strong style={{ color: '#f1f5f9' }}>{dataScopes.length}</strong> restriction{dataScopes.length !== 1 ? 's' : ''}</>
          )}.
        </span>
      </div>
    </form>
  )
}

/* ── Main page ──────────────────────────────────────────────────── */
export default function AccessScopePage() {
  const [activeTab, setActiveTab] = useState<'active' | 'create'>('active')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [editingRole, setEditingRole] = useState<AccessRole | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<AccessScopeData>({
    queryKey: ['access-scope'],
    queryFn: () => apiClient.get('/api/access-scope').then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (roleName: string) => apiClient.delete('/api/access-scope/roles', { data: { roleName } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-scope'] })
      setToast({ msg: 'Role deleted.' })
      setTimeout(() => setToast(null), 3000)
    },
    onError: () => setToast({ msg: 'Failed to delete role.', err: true }),
  })

  const handleDelete = (roleName: string) => {
    if (window.confirm(`Delete role '${roleName}'?\n\nUsers with this role will lose their custom section access.`)) {
      deleteMutation.mutate(roleName)
    }
  }

  const handleEdit = (role: AccessRole) => {
    setEditingRole(role)
    setActiveTab('create')
  }

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['access-scope'] })
    setToast({ msg: editingRole ? 'Role updated successfully.' : 'Role created successfully.' })
    setTimeout(() => setToast(null), 3000)
    setEditingRole(null)
    setActiveTab('active')
  }

  const handleTabChange = (tab: 'active' | 'create') => {
    if (tab === 'active') setEditingRole(null)
    setActiveTab(tab)
  }

  const roles = data?.accessRoles ?? []
  const groups = data?.sectionCheckGroups ?? []
  const filtered = roles.filter(r => r.roleName.toLowerCase().includes(search.toLowerCase()))

  const tabStyle = (active: boolean): React.CSSProperties => ({
    color: active ? '#fff' : '#94a3b8',
    background: active ? '#2E86C1' : 'rgba(255,255,255,.04)',
    border: `1px solid ${active ? '#2E86C1' : '#334155'}`,
    borderRadius: 10, fontWeight: 600, fontSize: '.9rem',
    padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
    transition: 'all .15s',
  })

  return (
    <div style={S.page}>
      <div style={S.container}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>Access Scope</h2>
          <p style={{ color: '#BDC3C7', fontSize: 14, margin: 0 }}>Create custom access roles and control which sections each role can see.</p>
        </div>

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

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button style={tabStyle(activeTab === 'active')} onClick={() => handleTabChange('active')}>
            Active roles <span style={{ fontSize: '.72rem', background: 'rgba(255,255,255,.18)', borderRadius: 999, padding: '1px 8px' }}>{roles.length}</span>
          </button>
          <button style={tabStyle(activeTab === 'create')} onClick={() => handleTabChange('create')}>
            {editingRole ? `Editing: ${editingRole.roleName}` : '+ Create role'}
          </button>
        </div>

        {/* Active roles tab */}
        {activeTab === 'active' && (
          <div style={S.card}>
            <div style={{ ...S.cardHead, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '.95rem' }}>Active access roles</span>
                <span style={{ background: '#3b82f6', color: '#fff', fontSize: '.72rem', padding: '1px 8px', borderRadius: 999 }}>{roles.length}</span>
              </div>
              {roles.length > 0 && (
                <input
                  type="text"
                  placeholder="Search role…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    background: '#0f172a', border: '1.5px solid #334155', color: '#f1f5f9',
                    borderRadius: 6, padding: '5px 12px', fontSize: 13, maxWidth: 280, outline: 'none',
                  }}
                />
              )}
            </div>

            {isLoading && <div style={{ color: '#94a3b8', textAlign: 'center', padding: '60px 20px' }}>Loading…</div>}

            {!isLoading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                {roles.length === 0
                  ? <>No access roles yet. Create the first one in the <b>Create role</b> tab.</>
                  : 'No roles match your search.'}
              </div>
            )}

            {filtered.map(role => (
              <RoleItem
                key={role.roleName}
                role={role}
                onEdit={() => handleEdit(role)}
                onDelete={() => handleDelete(role.roleName)}
              />
            ))}
          </div>
        )}

        {/* Create / Edit role tab */}
        {activeTab === 'create' && (
          <div style={S.card}>
            <div style={S.cardHead}>
              <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '.95rem' }}>
                {editingRole ? `Edit access role: ${editingRole.roleName}` : 'Create new access role'}
              </span>
            </div>
            {isLoading
              ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: '60px 20px' }}>Loading sections…</div>
              : <CreateRoleForm
                  key={editingRole?.roleName ?? '__new__'}
                  groups={groups}
                  onSaved={handleSaved}
                  initialRole={editingRole ?? undefined}
                />}
          </div>
        )}
      </div>
    </div>
  )
}
