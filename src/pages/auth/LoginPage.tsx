import { useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'

export default function LoginPage() {
  const { login, loading, error } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await login(email, password)
  }

  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: '100vh', background: 'var(--gradient-dark)' }}
    >
      <div
        className="card p-4"
        style={{
          width: 420,
          background: 'rgba(30, 41, 59, 0.95)',
          border: '1px solid var(--gtek-glass-border)',
          borderRadius: 12,
          color: 'var(--gtek-text-white)',
        }}
      >
        <div className="text-center mb-4">
          <img
            src="/images/BizibilityHubLogoNoBG.png"
            alt="BizibilityHub"
            style={{ height: 56, marginBottom: 12 }}
          />
          <p style={{ color: 'var(--gtek-text-gray)', fontSize: 14 }}>
            Sign in to continue
          </p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>
            <i className="fas fa-exclamation-circle me-2" />{error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label" style={{ color: 'var(--gtek-text-gray)', fontSize: 13 }}>
              Email
            </label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              style={{
                background: 'rgba(46,134,193,0.08)',
                border: '1px solid var(--gtek-glass-border)',
                color: 'var(--gtek-text-white)',
              }}
            />
          </div>
          <div className="mb-4">
            <label className="form-label" style={{ color: 'var(--gtek-text-gray)', fontSize: 13 }}>
              Password
            </label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                background: 'rgba(46,134,193,0.08)',
                border: '1px solid var(--gtek-glass-border)',
                color: 'var(--gtek-text-white)',
              }}
            />
          </div>
          <button
            type="submit"
            className="btn w-100"
            disabled={loading}
            style={{
              background: loading ? 'rgba(46,134,193,0.5)' : 'var(--gradient-primary)',
              color: '#fff',
              fontWeight: 600,
              border: 'none',
              borderRadius: 8,
              padding: '10px',
            }}
          >
            {loading
              ? <><i className="fas fa-spinner fa-spin me-2" />Signing in…</>
              : <><i className="fas fa-sign-in-alt me-2" />Sign In</>
            }
          </button>
        </form>
      </div>
    </div>
  )
}
