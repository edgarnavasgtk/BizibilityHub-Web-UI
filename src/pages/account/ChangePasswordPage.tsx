import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import apiClient from '../../services/apiClient'

const cardStyle: React.CSSProperties = {
  background: 'rgba(15,23,42,.9)',
  border: '1px solid rgba(46,134,193,.2)',
  borderRadius: 12,
  padding: '2rem',
  width: '100%',
  maxWidth: 500,
  height: 'fit-content',
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(30,41,59,.8)',
  color: '#e2e8f0',
  border: '1px solid rgba(46,134,193,.3)',
}

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isForced = searchParams.get('forced') === 'true'
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiClient.post('/Account/ChangePassword', { ...form, IsForced: isForced })
      navigate(isForced ? '/' : '/account/profile')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to change password. Check your current password and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)', display: 'flex', justifyContent: 'center' }}>
      <div style={cardStyle}>
        {isForced && (
          <div className="alert alert-warning d-flex align-items-center mb-3" role="alert">
            <i className="fas fa-exclamation-triangle me-2" />
            <span>You must change your temporary password before continuing.</span>
          </div>
        )}
        <h1 className="h4 text-white mb-1">
          {isForced
            ? <><i className="fas fa-exclamation-triangle me-2 text-warning" />Password Change Required</>
            : <><i className="fas fa-key me-2 text-primary" />Change Password</>}
        </h1>
        <p className="text-muted mb-4" style={{ fontSize: 14 }}>
          {isForced ? 'You must change your temporary password before continuing' : 'Update your account password'}
        </p>

        {error && (
          <div className="alert alert-danger mb-4">{error}</div>
        )}

        {/* Requirements */}
        <div className="mb-4 p-3 rounded" style={{ borderLeft: '3px solid var(--gtek-accent-blue)', background: 'rgba(46,134,193,.08)', fontSize: 13 }}>
          <div className="text-white fw-semibold mb-2">Password requirements:</div>
          <ul className="text-muted mb-0 ps-3" style={{ fontSize: 12 }}>
            <li>At least 8 characters</li>
            <li>Upper and lower case letters</li>
            <li>At least one number</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Password</label>
            <input type="password" className="form-control" value={form.currentPassword} onChange={set('currentPassword')} required style={inputStyle} />
          </div>
          <div className="mb-3">
            <label className="form-label text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>New Password</label>
            <input type="password" className="form-control" value={form.newPassword} onChange={set('newPassword')} required minLength={8} style={inputStyle} />
          </div>
          <div className="mb-4">
            <label className="form-label text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirm New Password</label>
            <input type="password" className="form-control" value={form.confirmPassword} onChange={set('confirmPassword')} required style={inputStyle} />
          </div>

          <div className="d-flex gap-3 align-items-center">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner-border spinner-border-sm me-2" />Changing…</> : <><i className="fas fa-lock me-2" />Change Password</>}
            </button>
            {!isForced && (
              <Link to="/account/profile" className="btn btn-outline-secondary btn-sm">
                <i className="fas fa-arrow-left me-2" />Back to Profile
              </Link>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
