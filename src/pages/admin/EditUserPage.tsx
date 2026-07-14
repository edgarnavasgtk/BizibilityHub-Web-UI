import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

interface EditUserData {
  id: string
  email: string
  firstName: string
  lastName: string
  department: string
  jobTitle: string
  isActive: boolean
  allRoles: string[]
  userRoles: string[]
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  Admin:   'Full system access and user management',
  User:    'Standard user access to analytics and reports',
  Viewer:  'Read-only access to dashboards and reports',
}

// Fallback role list used when creating a new user (no server data yet)
const DEFAULT_ROLES = Object.keys(ROLE_DESCRIPTIONS)

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(46,134,193,0.3)',
  borderRadius: 8, padding: '12px 15px', color: '#FFFFFF',
  width: '100%', transition: 'all 0.3s ease', fontSize: 14, outline: 'none',
}

export default function EditUserPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // id is undefined when the route is /admin/users/new (no :id segment)
  const isNew = !id

  const { data: user, isLoading } = useQuery<EditUserData>({
    queryKey: ['edit-user', id],
    queryFn: () => apiClient.get(`/api/admin/users/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const [form, setForm] = useState<Omit<EditUserData, 'allRoles'>>({
    id: '', email: '', firstName: '', lastName: '',
    department: '', jobTitle: '', isActive: true, userRoles: [],
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setForm({
        id: user.id, email: user.email,
        firstName: user.firstName, lastName: user.lastName,
        department: user.department, jobTitle: user.jobTitle,
        isActive: user.isActive, userRoles: [...user.userRoles],
      })
    }
  }, [user])

  const saveMutation = useMutation({
    // FIX [CRITICAL + MEDIUM]: use POST /api/admin/users for create and PUT /api/admin/users/:id for update
    mutationFn: (data: typeof form) =>
      isNew
        ? apiClient.post('/api/admin/users', data)
        : apiClient.put(`/api/admin/users/${id}`, data),
    onSuccess: () => navigate('/admin/users'),
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Failed to save user.'),
  })

  // For create mode fall back to the known roles; for edit mode use what the server returned
  const allRoles = user?.allRoles ?? DEFAULT_ROLES

  const toggleRole = (role: string) =>
    setForm(f => ({
      ...f,
      userRoles: f.userRoles.includes(role)
        ? f.userRoles.filter(r => r !== role)
        : [...f.userRoles, role],
    }))

  const initials =
    `${form.firstName?.[0] ?? ''}${form.lastName?.[0] ?? ''}`.toUpperCase() ||
    (isNew ? '+' : '?')

  // Only show the spinner when editing an existing user; create mode needs no fetch
  if (!isNew && isLoading) {
    return (
      <div style={{ background: 'linear-gradient(180deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
        Loading user…
      </div>
    )
  }

  return (
    <div style={{ background: 'linear-gradient(180deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)', minHeight: '100vh', padding: 20 }}>
      {/* Page header */}
      <div style={{ marginBottom: 25, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ color: '#FFFFFF', fontWeight: 700, marginBottom: 8 }}>
            {isNew ? 'Create User' : 'Edit User'}
          </h2>
          <p style={{ color: '#BDC3C7', fontSize: 14, margin: 0 }}>
            {isNew
              ? 'Add a new user to the system'
              : 'Update user profile, roles, and account settings'}
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/users')}
          style={{ background: '#2E86C1', borderColor: '#2E86C1', color: '#fff', padding: '10px 20px', borderRadius: 6, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}
        >
          ← Back to Users
        </button>
      </div>

      {/* Form card */}
      <div style={{ background: '#1E293B', borderRadius: 12, padding: 30, boxShadow: '0 4px 16px rgba(0,0,0,0.5)', border: '1px solid rgba(46,134,193,0.2)', maxWidth: 900, margin: '0 auto' }}>

        {/* User avatar / header */}
        <div style={{ textAlign: 'center', paddingBottom: 25, marginBottom: 25, borderBottom: '1px solid rgba(46,134,193,0.2)' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg,#3498DB,#2E86C1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 32, fontWeight: 600, margin: '0 auto 15px',
            boxShadow: '0 4px 15px rgba(52,152,219,0.4)',
          }}>
            {initials}
          </div>
          <h3 style={{ color: '#FFFFFF', fontWeight: 600, marginBottom: 5 }}>
            {isNew
              ? 'New User'
              : `${form.firstName} ${form.lastName}`}
          </h3>
          <p style={{ color: '#BDC3C7', margin: 0 }}>
            {isNew ? 'Fill in the details below' : form.email}
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', padding: '10px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={e => { e.preventDefault(); setError(null); saveMutation.mutate(form) }}>
          {/* Personal Information */}
          <SectionHeader icon="👤">Personal Information</SectionHeader>

          {/* Email: editable on create, read-only on edit */}
          <FormGroup label="Email">
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="Enter email address"
              style={isNew ? inputStyle : { ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }}
              readOnly={!isNew}
              required
              onFocus={e => {
                if (isNew) {
                  e.target.style.borderColor = '#3498DB'
                  e.target.style.background = 'rgba(255,255,255,0.08)'
                }
              }}
              onBlur={e => {
                e.target.style.borderColor = 'rgba(46,134,193,0.3)'
                e.target.style.background = 'rgba(255,255,255,0.05)'
              }}
            />
          </FormGroup>

          <div className="row">
            <div className="col-md-6">
              <FormGroup label="First Name">
                <input
                  type="text"
                  value={form.firstName}
                  onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  placeholder="Enter first name"
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#3498DB'; e.target.style.background = 'rgba(255,255,255,0.08)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(46,134,193,0.3)'; e.target.style.background = 'rgba(255,255,255,0.05)' }}
                  required
                />
              </FormGroup>
            </div>
            <div className="col-md-6">
              <FormGroup label="Last Name">
                <input
                  type="text"
                  value={form.lastName}
                  onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                  placeholder="Enter last name"
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#3498DB'; e.target.style.background = 'rgba(255,255,255,0.08)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(46,134,193,0.3)'; e.target.style.background = 'rgba(255,255,255,0.05)' }}
                  required
                />
              </FormGroup>
            </div>
          </div>

          <div className="row">
            <div className="col-md-6">
              <FormGroup label="Department">
                <input
                  type="text"
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="Enter department"
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#3498DB'; e.target.style.background = 'rgba(255,255,255,0.08)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(46,134,193,0.3)'; e.target.style.background = 'rgba(255,255,255,0.05)' }}
                />
              </FormGroup>
            </div>
            <div className="col-md-6">
              <FormGroup label="Job Title">
                <input
                  type="text"
                  value={form.jobTitle}
                  onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                  placeholder="Enter job title"
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#3498DB'; e.target.style.background = 'rgba(255,255,255,0.08)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(46,134,193,0.3)'; e.target.style.background = 'rgba(255,255,255,0.05)' }}
                />
              </FormGroup>
            </div>
          </div>

          {/* Account Status */}
          <SectionHeader icon="⚡">Account Status</SectionHeader>

          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(46,134,193,0.2)', borderRadius: 10, padding: 15, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                style={{ width: 20, height: 20, accentColor: '#2ECC71', cursor: 'pointer' }}
              />
              <label htmlFor="isActive" style={{ color: '#FFFFFF', cursor: 'pointer' }}>User account is active</label>
            </div>
            <small style={{ color: '#95A5A6', marginLeft: 30 }}>Inactive users cannot log in to the system</small>
          </div>

          {/* User Roles */}
          <SectionHeader icon="🛡️">User Roles</SectionHeader>

          <div className="row">
            {allRoles.map((roleName, i) => {
              const checked = form.userRoles.includes(roleName)
              return (
                <div key={roleName} className="col-md-6">
                  <div
                    style={{
                      background: checked ? 'rgba(46,134,193,0.1)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${checked ? 'rgba(46,134,193,0.4)' : 'rgba(46,134,193,0.2)'}`,
                      borderRadius: 10, padding: 15, marginBottom: 12, cursor: 'pointer', transition: 'all 0.3s ease',
                    }}
                    onClick={() => toggleRole(roleName)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <input
                        type="checkbox"
                        id={`role_${i}`}
                        checked={checked}
                        onChange={() => toggleRole(roleName)}
                        style={{ width: 20, height: 20, accentColor: '#3498DB', cursor: 'pointer', marginTop: 2, flexShrink: 0 }}
                        onClick={e => e.stopPropagation()}
                      />
                      <label htmlFor={`role_${i}`} style={{ color: checked ? '#5DADE2' : '#FFFFFF', cursor: 'pointer' }}>
                        <strong>{roleName}</strong><br />
                        <small style={{ color: '#95A5A6' }}>{ROLE_DESCRIPTIONS[roleName] ?? 'Custom role with specific permissions'}</small>
                      </label>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 30, paddingTop: 25, borderTop: '1px solid rgba(46,134,193,0.2)' }}>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              style={{
                background: saveMutation.isPending ? 'rgba(52,152,219,0.4)' : 'linear-gradient(135deg,#3498DB,#2E86C1)',
                border: 'none', borderRadius: 8, padding: '12px 25px', fontWeight: 600, color: '#fff',
                cursor: saveMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 14,
              }}
            >
              {saveMutation.isPending ? 'Saving…' : isNew ? 'Create User' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 8, padding: '12px 25px', fontWeight: 600, color: '#BDC3C7',
                cursor: 'pointer', fontSize: 14, transition: 'all 0.3s ease',
              }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'rgba(255,255,255,0.1)'; el.style.color = '#fff' }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'transparent'; el.style.color = '#BDC3C7' }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SectionHeader({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h4 style={{
      color: '#FFFFFF', fontWeight: 600, fontSize: 16, marginBottom: 20,
      paddingBottom: 10, borderBottom: '2px solid rgba(46,134,193,0.3)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span>{icon}</span>{children}
    </h4>
  )
}

function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ color: '#BDC3C7', fontWeight: 500, marginBottom: 8, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
