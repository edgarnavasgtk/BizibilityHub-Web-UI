import { useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'

export default function LoginPage() {
  const { login, loading, error } = useAuth()
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [rememberMe, setRememberMe] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await login(email, password, rememberMe)
  }

  const inputStyle: React.CSSProperties = {
    background:   'rgba(30, 41, 59, 0.5)',
    border:       '1px solid rgba(46, 134, 193, 0.3)',
    color:        '#fff',
    borderRadius: 12,
    padding:      '15px',
    fontSize:     16,
    transition:   'all 0.3s ease',
  }

  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' }}
    >
      <div
        style={{
          background:     'linear-gradient(135deg, rgba(15,23,42,.95) 0%, rgba(30,41,59,.95) 100%)',
          border:         '1px solid rgba(46, 134, 193, 0.3)',
          boxShadow:      '0 8px 25px rgba(0,0,0,.5)',
          borderRadius:   20,
          padding:        50,
          backdropFilter: 'blur(20px)',
          maxWidth:       650,
          width:          '100%',
        }}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <img
            src="/images/BizibilityHubLogoNoBG.png"
            alt="Bizibility Hub"
            style={{ width: 300, height: 'auto', marginBottom: 30 }}
          />
          <p style={{ color: 'rgba(174, 214, 241, 0.9)', marginBottom: 0, fontSize: 16 }}>
            Please sign in to your account
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-danger py-2 mb-3 d-flex align-items-center" style={{ fontSize: 14 }}>
            <i className="fas fa-exclamation-circle me-2" />{error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div className="mb-3">
            <label className="form-label" style={{ color: '#AED6F1', fontWeight: 500, marginBottom: 8 }}>
              Email
            </label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              style={inputStyle}
            />
          </div>

          {/* Password */}
          <div className="mb-3">
            <label className="form-label" style={{ color: '#AED6F1', fontWeight: 500, marginBottom: 8 }}>
              Password
            </label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          {/* Remember me */}
          <div className="d-flex align-items-center gap-2 mt-3 mb-1">
            <input
              className="form-check-input m-0"
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{
                background: rememberMe ? '#3b82f6' : 'rgba(30,41,59,.5)',
                borderColor: 'rgba(46,134,193,.3)',
                cursor: 'pointer',
              }}
            />
            <label
              htmlFor="rememberMe"
              className="form-check-label"
              style={{ color: '#fff', fontWeight: 500, cursor: 'pointer' }}
            >
              Remember me
            </label>
          </div>

          {/* Sign In */}
          <button
            type="submit"
            className="btn w-100 mt-4"
            disabled={loading}
            style={{
              background:    loading ? 'rgba(59,130,246,.5)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              border:        '1px solid rgba(59,130,246,.5)',
              color:         '#fff',
              borderRadius:  12,
              padding:       '15px',
              fontSize:      16,
              fontWeight:    600,
              transition:    'all 0.3s ease',
            }}
          >
            {loading
              ? <><i className="fas fa-spinner fa-spin me-2" />Signing in…</>
              : <><i className="fas fa-sign-in-alt me-2" />Sign In</>
            }
          </button>
        </form>

        {/* SSO Divider */}
        <div
          className="d-flex align-items-center my-4"
          style={{ color: 'rgba(174,214,241,.5)', fontSize: 13 }}
        >
          <div style={{ flex: 1, borderTop: '1px solid rgba(46,134,193,.2)' }} />
          <span className="mx-3">o</span>
          <div style={{ flex: 1, borderTop: '1px solid rgba(46,134,193,.2)' }} />
        </div>

        {/* Microsoft SSO */}
        <button
          type="button"
          className="d-flex align-items-center justify-content-center w-100"
          style={{
            background:   'rgba(15,23,42,.6)',
            border:       '1px solid rgba(46,134,193,.4)',
            color:        '#AED6F1',
            borderRadius: 12,
            padding:      '14px',
            fontSize:     15,
            fontWeight:   500,
            cursor:       'pointer',
            transition:   'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(30,41,59,.8)'
            e.currentTarget.style.borderColor = 'rgba(59,130,246,.7)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(15,23,42,.6)'
            e.currentTarget.style.borderColor = 'rgba(46,134,193,.4)'
            e.currentTarget.style.color = '#AED6F1'
          }}
          onClick={() => {
            // SSO via .NET ExternalLogin — redirect directly
            window.location.href = '/Account/ExternalLogin?provider=AzureAD'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 21 21" style={{ marginRight: 10, flexShrink: 0 }}>
            <path d="M0 0h10v10H0z" fill="#f25022"/>
            <path d="M11 0h10v10H11z" fill="#7fba00"/>
            <path d="M0 11h10v10H0z" fill="#00a4ef"/>
            <path d="M11 11h10v10H11z" fill="#ffb900"/>
          </svg>
          Iniciar sesión con cuenta corporativa
        </button>
      </div>
    </div>
  )
}
