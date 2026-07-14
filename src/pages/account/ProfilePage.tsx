import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import apiClient from '../../services/apiClient'

interface ProfileForm {
  email: string
  firstName: string
  lastName: string
  department: string
  jobTitle: string
}

const pageStyle: React.CSSProperties = {
  padding: '2rem',
  minHeight: 'calc(100vh - 160px)',
  display: 'flex',
  justifyContent: 'center',
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(15,23,42,.9)',
  border: '1px solid rgba(46,134,193,.2)',
  borderRadius: 12,
  padding: '2rem',
  width: '100%',
  maxWidth: 600,
  height: 'fit-content',
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(30,41,59,.8)',
  color: '#e2e8f0',
  border: '1px solid rgba(46,134,193,.3)',
}

const roStyle: React.CSSProperties = {
  ...inputStyle,
  opacity: 0.7,
  cursor: 'not-allowed',
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState<ProfileForm>({
    email: user?.email ?? '',
    firstName: '',
    lastName: user?.displayName ?? '',
    department: '',
    jobTitle: '',
  })
  const [profileLoading, setProfileLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // [FIX] Replace silent .catch(() => {}) with proper error surfacing.
  // If the endpoint returns a non-JSON Razor view or does not exist the user
  // now sees a clear message instead of silently blank fields.
  useEffect(() => {
    setProfileLoading(true)
    setLoadError(null)
    apiClient
      .get<ProfileForm>('/Account/GetProfile')
      .then((r) => {
        setForm(r.data)
      })
      .catch((err) => {
        const status: number | undefined = err?.response?.status
        let msg = 'Failed to load profile data. Please refresh the page.'
        if (status === 404) {
          msg = 'Profile endpoint not found (/Account/GetProfile). Contact support.'
        } else if (status === 401) {
          // 401 is handled globally by the interceptor (redirect to /login),
          // but surface something in case the redirect hasn't fired yet.
          msg = 'Session expired. Please log in again.'
        } else if (err?.message) {
          msg = err.message
        }
        setLoadError(msg)
      })
      .finally(() => setProfileLoading(false))
  }, [])

  const handleChange = (field: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }))

  // [FIX] The Razor MVC action uses [FromForm] binding which ignores JSON bodies.
  // Send as application/x-www-form-urlencoded with URLSearchParams so that
  // ASP.NET Core model binding can actually read FirstName / LastName.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = new URLSearchParams()
      body.append('FirstName', form.firstName)
      body.append('LastName', form.lastName)
      // Include read-only fields so the model binder has a full picture
      // in case the action validates or echoes them.
      body.append('Email', form.email)
      body.append('Department', form.department)
      body.append('JobTitle', form.jobTitle)
      await apiClient.post('/Account/Profile', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Failed to update profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 className="h4 text-white mb-1">
          <i className="fas fa-user-circle me-2 text-primary" />My Profile
        </h1>
        <p className="text-muted mb-4" style={{ fontSize: 14 }}>Manage your account information</p>

        {/* Load error: shown when GET /Account/GetProfile fails */}
        {loadError && (
          <div className="alert alert-warning d-flex align-items-center mb-4" role="alert">
            <i className="fas fa-exclamation-triangle me-2" />
            {loadError}
          </div>
        )}

        {success && (
          <div className="alert alert-success d-flex align-items-center mb-4" role="alert">
            <i className="fas fa-check-circle me-2" />Profile updated successfully.
          </div>
        )}
        {error && (
          <div className="alert alert-danger mb-4" role="alert">{error}</div>
        )}

        {profileLoading ? (
          <div className="d-flex align-items-center gap-2 text-muted py-3">
            <span className="spinner-border spinner-border-sm" />
            Loading profile…
          </div>
        ) : (
        <form onSubmit={handleSubmit}>
          {/* Email — read-only */}
          <div className="mb-3">
            <label className="form-label text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
            <input className="form-control" value={form.email} readOnly style={roStyle} />
            <div className="form-text text-muted" style={{ fontSize: 11 }}>Email cannot be changed</div>
          </div>

          {/* Name row */}
          <div className="row g-3 mb-3">
            <div className="col-6">
              <label className="form-label text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>First Name</label>
              <input className="form-control" value={form.firstName} onChange={handleChange('firstName')} required style={inputStyle} />
            </div>
            <div className="col-6">
              <label className="form-label text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Last Name</label>
              <input className="form-control" value={form.lastName} onChange={handleChange('lastName')} required style={inputStyle} />
            </div>
          </div>

          {/* Department / Job Title — read-only */}
          <div className="row g-3 mb-4">
            <div className="col-6">
              <label className="form-label text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Department</label>
              <input className="form-control" value={form.department} readOnly style={roStyle} />
              <div className="form-text text-muted" style={{ fontSize: 11 }}>Can only be changed by an administrator</div>
            </div>
            <div className="col-6">
              <label className="form-label text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Job Title</label>
              <input className="form-control" value={form.jobTitle} readOnly style={roStyle} />
              <div className="form-text text-muted" style={{ fontSize: 11 }}>Can only be changed by an administrator</div>
            </div>
          </div>

          <div className="d-flex gap-3 align-items-center">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner-border spinner-border-sm me-2" />Saving…</> : <><i className="fas fa-save me-2" />Update Profile</>}
            </button>
            <Link to="/account/change-password" className="btn btn-outline-secondary btn-sm">
              <i className="fas fa-key me-2" />Change Password
            </Link>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
