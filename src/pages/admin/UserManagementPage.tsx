import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

interface UserRow {
  id: string
  firstName: string
  lastName: string
  email: string
  department?: string
  jobTitle?: string
  /** Backend may return a string[] or a comma-separated string — normalised at fetch time */
  roles: string[]
  isActive: boolean
  emailConfirmed: boolean
  isLockedOut: boolean
}

interface UserGridResult {
  users: UserRow[]
  totalCount: number
  activeCount: number
  inactiveCount: number
  lockedCount: number
}

interface ResetPasswordResponse {
  temporaryPassword: string
}

interface ResetModalState {
  open: boolean
  step: 1 | 2
  userId: string
  email: string
  name: string
  tempPassword: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Ensure roles is always string[] regardless of what the backend sends */
function normaliseRoles(raw: string[] | string | undefined | null): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return (raw as string).split(/,\s*/).filter(Boolean)
}

/**
 * Accept both legacy plain-array responses and the new { users, … } shape.
 * Counts are computed client-side when the backend returns a plain array.
 */
function normaliseResponse(raw: unknown): UserGridResult {
  if (Array.isArray(raw)) {
    const arr = (raw as Array<Omit<UserRow, 'roles'> & { roles: string[] | string }>).map(u => ({
      ...u,
      roles: normaliseRoles(u.roles),
    }))
    return {
      users: arr,
      totalCount: arr.length,
      activeCount: arr.filter(u => u.isActive && !u.isLockedOut).length,
      inactiveCount: arr.filter(u => !u.isActive).length,
      lockedCount: arr.filter(u => u.isLockedOut).length,
    }
  }
  const obj = raw as UserGridResult & { users: Array<Omit<UserRow, 'roles'> & { roles: string[] | string }> }
  return {
    ...obj,
    users: (obj.users ?? []).map(u => ({ ...u, roles: normaliseRoles(u.roles) })),
  }
}

// ── constants ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  Admin:               'primary',
  User:                'secondary',
  OperationCMI:        'info',
  'Data Analysis':     'warning',
  'Operations Viewer': 'success',
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ── sub-components ────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLORS[role] ?? 'secondary'
  return (
    <span className={`badge bg-${color} me-1`} style={{ fontSize: 11 }}>{role}</span>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div
      style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--gtek-primary-blue)',
        color: '#fff', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 12, fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

function StatusBadge({ isActive, isLockedOut }: { isActive: boolean; isLockedOut: boolean }) {
  if (isLockedOut) {
    return (
      <span className="badge" style={{ fontSize: 11, background: '#f59e0b', color: '#000' }}>
        Locked
      </span>
    )
  }
  return (
    <span className={`badge ${isActive ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: 11 }}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}

const MODAL_OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1050,
}

const MODAL_BOX: React.CSSProperties = {
  background: 'rgba(15,23,42,.97)',
  border: '1px solid rgba(46,134,193,.35)',
  borderRadius: 10,
  padding: '1.75rem',
  width: '100%',
  maxWidth: 460,
  color: '#e2e8f0',
}

const COL_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  fontSize: 11,
  background: 'rgba(30,41,59,.9)',
  color: '#e2e8f0',
  border: '1px solid rgba(46,134,193,.25)',
  borderRadius: 4,
  outline: 'none',
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  // global search
  const [search,       setSearch]      = useState('')
  // per-column filters
  const [filterDept,   setFilterDept]  = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'locked'>('all')
  // pagination
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(25)
  // modal
  const [copied, setCopied] = useState(false)
  const [resetModal, setResetModal] = useState<ResetModalState>({
    open: false, step: 1, userId: '', email: '', name: '', tempPassword: '',
  })

  const queryClient = useQueryClient()

  // [CRITICAL FIX 1] normalise API response — handles both plain array and object shapes
  const { data, isFetching, error } = useQuery<UserGridResult>({
    queryKey: ['admin', 'users'],
    queryFn: () =>
      apiClient.get('/Admin/GetUsersForGrid').then(r => normaliseResponse(r.data)),
  })

  // --- Reset Password mutation ---
  const resetPasswordMutation = useMutation<ResetPasswordResponse, unknown, string>({
    mutationFn: (userId: string) =>
      apiClient.post<ResetPasswordResponse>('/Admin/ResetUserPassword', { userId }).then(r => r.data),
    onSuccess: (res) => {
      setResetModal(prev => ({ ...prev, step: 2, tempPassword: res.temporaryPassword }))
    },
  })

  // --- Toggle Status mutation ---
  const toggleStatusMutation = useMutation<unknown, unknown, string>({
    mutationFn: (userId: string) =>
      apiClient.post('/Admin/ToggleUserStatus', { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })

  const openResetModal = (userId: string, email: string, name: string) => {
    setCopied(false)
    setResetModal({ open: true, step: 1, userId, email, name, tempPassword: '' })
  }

  const closeResetModal = () => {
    setResetModal({ open: false, step: 1, userId: '', email: '', name: '', tempPassword: '' })
    setCopied(false)
    resetPasswordMutation.reset()
  }

  const confirmReset = () => {
    resetPasswordMutation.mutate(resetModal.userId)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(resetModal.tempPassword).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  // reset to page 1 whenever any filter changes
  const updateSearch      = (v: string) => { setSearch(v);      setPage(1) }
  const updateFilterDept  = (v: string) => { setFilterDept(v);  setPage(1) }
  const updateFilterStatus = (v: typeof filterStatus) => { setFilterStatus(v); setPage(1) }
  const updatePageSize    = (v: number) => { setPageSize(v);    setPage(1) }

  // ── filter logic ──────────────────────────────────────────────────────────

  const filteredUsers = (data?.users ?? []).filter((u) => {
    // global search across name / email / department
    if (search) {
      const q = search.toLowerCase()
      const matches =
        u.email.toLowerCase().includes(q) ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        (u.department ?? '').toLowerCase().includes(q)
      if (!matches) return false
    }
    // per-column: department
    if (filterDept) {
      if (!(u.department ?? '').toLowerCase().includes(filterDept.toLowerCase())) return false
    }
    // per-column: status
    if (filterStatus === 'active'   && !(u.isActive && !u.isLockedOut)) return false
    if (filterStatus === 'inactive' && u.isActive)                       return false
    if (filterStatus === 'locked'   && !u.isLockedOut)                   return false
    return true
  })

  // ── pagination ────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pagedUsers = filteredUsers.slice((safePage - 1) * pageSize, safePage * pageSize)

  const statCards = [
    { icon: 'fas fa-users',      color: '#3b82f6', label: 'Total Users', value: data?.totalCount    ?? 0 },
    { icon: 'fas fa-user-check', color: '#10b981', label: 'Active',      value: data?.activeCount   ?? 0 },
    { icon: 'fas fa-user-times', color: '#ef4444', label: 'Inactive',    value: data?.inactiveCount ?? 0 },
    { icon: 'fas fa-user-lock',  color: '#f59e0b', label: 'Locked',      value: data?.lockedCount   ?? 0 },
  ]

  return (
    <div style={{ padding: '2rem 2rem 2rem 2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-users me-2" />User Management
          </h1>
          <p className="text-muted mb-0">Manage user accounts, roles, and permissions</p>
        </div>
        {/* [MEDIUM FIX] Route /admin/users/new is registered in App.tsx */}
        <Link to="/admin/users/new" className="btn btn-primary">
          <i className="fas fa-user-plus me-2" />Add New User
        </Link>
      </div>

      {/* Summary cards */}
      <div className="row g-3 mb-4">
        {statCards.map((c) => (
          <div key={c.label} className="col-6 col-md-3">
            <div
              className="text-center p-3 rounded"
              style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)' }}
            >
              <i className={c.icon} style={{ fontSize: 28, color: c.color }} />
              <div className="text-white fw-bold mt-2" style={{ fontSize: 28 }}>{c.value}</div>
              <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div
        className="rounded"
        style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(46,134,193,.2)', overflow: 'hidden' }}
      >
        {/* Search bar + page size selector */}
        <div
          className="p-3 d-flex justify-content-between align-items-center flex-wrap gap-2"
          style={{ borderBottom: '1px solid rgba(46,134,193,.15)' }}
        >
          <div className="d-flex align-items-center gap-2">
            <label className="text-muted" style={{ fontSize: 12 }}>Show</label>
            <select
              className="form-select form-select-sm"
              value={pageSize}
              onChange={(e) => updatePageSize(Number(e.target.value))}
              style={{ width: 80, background: 'rgba(30,41,59,.8)', color: '#e2e8f0', border: '1px solid rgba(46,134,193,.3)' }}
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="text-muted" style={{ fontSize: 12 }}>per page</label>
          </div>

          <div style={{ position: 'relative', width: 280 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 13 }} />
            <input
              className="form-control form-control-sm"
              placeholder="Search name, email, department…"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              style={{ paddingLeft: 32, background: 'rgba(30,41,59,.8)', color: '#e2e8f0', border: '1px solid rgba(46,134,193,.3)' }}
            />
          </div>
        </div>

        {isFetching && (
          <div className="text-center py-5">
            <span className="spinner-border text-primary" />
          </div>
        )}

        {error && (
          <div className="text-center py-5 text-muted">
            <i className="fas fa-lock me-2" />Admin access required
          </div>
        )}

        {!isFetching && !error && (
          <>
            <div className="table-responsive">
              <table className="table table-dark table-hover mb-0" style={{ fontSize: 13 }}>
                <thead style={{ background: 'rgba(30,41,59,.6)', borderBottom: '1px solid rgba(46,134,193,.2)' }}>
                  {/* [MEDIUM FIX] Column header labels */}
                  <tr>
                    <th className="ps-3">User</th>
                    <th>Department</th>
                    <th>Job Title</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>Verified</th>
                    <th className="text-center">Actions</th>
                  </tr>
                  {/* [MEDIUM FIX] Per-column filter row */}
                  <tr style={{ background: 'rgba(15,23,42,.7)' }}>
                    <th className="ps-3 py-2">
                      {/* global search already covers name/email — no duplicate input here */}
                    </th>
                    <th className="py-2">
                      <input
                        style={COL_INPUT_STYLE}
                        placeholder="Filter dept…"
                        value={filterDept}
                        onChange={(e) => updateFilterDept(e.target.value)}
                      />
                    </th>
                    <th className="py-2" />
                    <th className="py-2" />
                    <th className="py-2">
                      <select
                        style={{ ...COL_INPUT_STYLE, cursor: 'pointer' }}
                        value={filterStatus}
                        onChange={(e) => updateFilterStatus(e.target.value as typeof filterStatus)}
                      >
                        <option value="all">All</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="locked">Locked</option>
                      </select>
                    </th>
                    <th className="py-2" />
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((u) => {
                    // [CRITICAL FIX 2] roles may still be a string if normalisation was skipped;
                    // the normaliseResponse function handles it but we guard here defensively.
                    const rolesList = Array.isArray(u.roles)
                      ? u.roles
                      : (u.roles as unknown as string).split(/,\s*/).filter(Boolean)

                    return (
                      <tr key={u.id}>
                        <td className="ps-3">
                          <div className="d-flex align-items-center gap-2">
                            <Avatar name={`${u.firstName} ${u.lastName}`} />
                            <div>
                              <div className="text-white fw-semibold">{u.firstName} {u.lastName}</div>
                              <div className="text-muted" style={{ fontSize: 11 }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-muted">{u.department ?? '—'}</td>
                        <td className="text-muted">{u.jobTitle ?? '—'}</td>
                        <td>
                          {rolesList.map((r) => <RoleBadge key={r} role={r} />)}
                        </td>
                        <td>
                          <StatusBadge isActive={u.isActive} isLockedOut={u.isLockedOut} />
                        </td>
                        <td>
                          <span className={`badge ${u.emailConfirmed ? 'bg-primary' : 'bg-secondary'}`} style={{ fontSize: 11 }}>
                            {u.emailConfirmed ? 'Verified' : 'Unverified'}
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="d-flex justify-content-center gap-1">
                            {/* [MEDIUM FIX] Route /admin/users/:id/edit is registered in App.tsx */}
                            <Link to={`/admin/users/${u.id}/edit`} className="btn btn-sm btn-outline-primary" title="Edit">
                              <i className="fas fa-edit" />
                            </Link>
                            <button
                              className="btn btn-sm btn-outline-warning"
                              title="Reset password"
                              onClick={() => openResetModal(u.id, u.email, `${u.firstName} ${u.lastName}`)}
                            >
                              <i className="fas fa-key" />
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              title={u.isActive ? 'Disable user' : 'Enable user'}
                              disabled={toggleStatusMutation.isPending}
                              onClick={() => toggleStatusMutation.mutate(u.id)}
                            >
                              <i className={`fas ${u.isActive ? 'fa-ban' : 'fa-check-circle'}`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {pagedUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">No users found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* [MEDIUM FIX] Pagination controls */}
            <div
              className="d-flex justify-content-between align-items-center px-3 py-2"
              style={{ borderTop: '1px solid rgba(46,134,193,.15)', fontSize: 12 }}
            >
              <span className="text-muted">
                {filteredUsers.length === 0
                  ? 'No records'
                  : `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filteredUsers.length)} of ${filteredUsers.length}`}
              </span>
              <div className="d-flex align-items-center gap-1">
                <button
                  className="btn btn-sm btn-outline-secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage(1)}
                  title="First page"
                >
                  <i className="fas fa-angle-double-left" />
                </button>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  title="Previous page"
                >
                  <i className="fas fa-angle-left" />
                </button>
                <span className="text-muted px-2">
                  Page {safePage} / {totalPages}
                </span>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  title="Next page"
                >
                  <i className="fas fa-angle-right" />
                </button>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                  title="Last page"
                >
                  <i className="fas fa-angle-double-right" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Reset Password Modal ── */}
      {resetModal.open && (
        <div style={MODAL_OVERLAY} onClick={closeResetModal}>
          <div style={MODAL_BOX} onClick={(e) => e.stopPropagation()}>

            {resetModal.step === 1 && (
              <>
                <h5 className="mb-1" style={{ color: '#f59e0b' }}>
                  <i className="fas fa-key me-2" />Reset Password
                </h5>
                <p className="text-muted mb-3" style={{ fontSize: 13 }}>
                  A temporary password will be generated for this user.
                </p>

                <div
                  className="rounded p-3 mb-3"
                  style={{ background: 'rgba(30,41,59,.8)', border: '1px solid rgba(46,134,193,.2)', fontSize: 13 }}
                >
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <Avatar name={resetModal.name} />
                    <div>
                      <div className="text-white fw-semibold">{resetModal.name}</div>
                      <div className="text-muted">{resetModal.email}</div>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded p-3 mb-4 d-flex gap-2"
                  style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.35)', fontSize: 13 }}
                >
                  <i className="fas fa-exclamation-triangle mt-1" style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <span style={{ color: '#fcd34d' }}>
                    The user's current password will be invalidated. They will be required to change the temporary
                    password on next login.
                  </span>
                </div>

                {resetPasswordMutation.isError && (
                  <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>
                    Failed to reset password. Please try again.
                  </div>
                )}

                <div className="d-flex justify-content-end gap-2">
                  <button className="btn btn-sm btn-secondary" onClick={closeResetModal}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-sm btn-warning"
                    onClick={confirmReset}
                    disabled={resetPasswordMutation.isPending}
                  >
                    {resetPasswordMutation.isPending
                      ? <><span className="spinner-border spinner-border-sm me-2" />Resetting…</>
                      : <><i className="fas fa-key me-2" />Reset Password</>
                    }
                  </button>
                </div>
              </>
            )}

            {resetModal.step === 2 && (
              <>
                <h5 className="mb-1" style={{ color: '#10b981' }}>
                  <i className="fas fa-check-circle me-2" />Password Reset Successfully
                </h5>
                <p className="text-muted mb-3" style={{ fontSize: 13 }}>
                  Share this temporary password with <strong style={{ color: '#e2e8f0' }}>{resetModal.name}</strong>.
                  It will be required to change on first login.
                </p>

                <label className="text-muted mb-1 d-block" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Temporary Password
                </label>
                <div className="d-flex gap-2 mb-4">
                  <input
                    readOnly
                    value={resetModal.tempPassword}
                    className="form-control form-control-sm"
                    style={{
                      background: 'rgba(30,41,59,.8)',
                      color: '#e2e8f0',
                      border: '1px solid rgba(46,134,193,.3)',
                      fontFamily: 'monospace',
                      fontSize: 14,
                      letterSpacing: '0.05em',
                    }}
                  />
                  <button
                    className={`btn btn-sm ${copied ? 'btn-success' : 'btn-outline-info'}`}
                    style={{ whiteSpace: 'nowrap', minWidth: 80 }}
                    onClick={copyToClipboard}
                  >
                    {copied
                      ? <><i className="fas fa-check me-1" />Copied</>
                      : <><i className="fas fa-copy me-1" />Copy</>
                    }
                  </button>
                </div>

                <div className="d-flex justify-content-end">
                  <button className="btn btn-sm btn-primary" onClick={closeResetModal}>
                    Done
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  )
}
