import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import apiClient from '../../services/apiClient'

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldErrors = {
  FirstName?:       string
  LastName?:        string
  Email?:           string
  Department?:      string
  JobTitle?:        string
  Role?:            string
  Password?:        string
  ConfirmPassword?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateStrongPassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const digits  = '23456789'
  const all     = upper + lower + digits

  const chars: string[] = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
  ]
  for (let i = 3; i < 10; i++) chars.push(all[Math.floor(Math.random() * all.length)])

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/** Parse ASP.NET MVC validation errors out of an HTML string. */
function parseServerErrors(html: string): { model: string[]; fields: FieldErrors } {
  const doc    = new DOMParser().parseFromString(html, 'text/html')
  const model: string[] = []

  doc
    .querySelectorAll(
      '[data-valmsg-summary="true"] ul li, .validation-summary-errors ul li'
    )
    .forEach((li) => {
      const t = li.textContent?.trim()
      if (t) model.push(t)
    })

  const fields: FieldErrors                = {}
  const names: (keyof FieldErrors)[]       = [
    'FirstName', 'LastName', 'Email', 'Department',
    'JobTitle',  'Role',     'Password', 'ConfirmPassword',
  ]
  for (const name of names) {
    const span = doc.querySelector(`[data-valmsg-for="${name}"]`)
    const t    = span?.textContent?.trim()
    if (t) fields[name] = t
  }

  return { model, fields }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate()

  // Form state
  const [firstName,       setFirstName]       = useState('')
  const [lastName,        setLastName]         = useState('')
  const [email,           setEmail]            = useState('')
  const [department,      setDepartment]       = useState('')
  const [jobTitle,        setJobTitle]         = useState('')
  const [role,            setRole]             = useState('User')
  const [password,        setPassword]         = useState('')
  const [confirmPassword, setConfirmPassword]  = useState('')

  // UI state
  const [loading,           setLoading]         = useState(false)
  const [modelErrors,       setModelErrors]     = useState<string[]>([])
  const [fieldErrors,       setFieldErrors]     = useState<FieldErrors>({})
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [showGenerated,     setShowGenerated]   = useState(false)
  const [copiedPw,          setCopiedPw]         = useState(false)
  const [pwSuggested,       setPwSuggested]      = useState(false)

  // ── Shared styles ────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    background:   'rgba(30, 41, 59, 0.5)',
    border:       '1px solid rgba(46, 134, 193, 0.3)',
    color:        '#fff',
    borderRadius: 10,
    padding:      '12px',
    fontSize:     15,
    transition:   'all 0.3s ease',
  }

  const labelStyle: React.CSSProperties = {
    color:        '#AED6F1',
    fontWeight:   500,
    marginBottom: 6,
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setModelErrors([])
    setFieldErrors({})

    try {
      // 1. Fetch a fresh CSRF token from the register page
      const getRes = await apiClient.get<string>('/Account/Register')
      const getDoc = new DOMParser().parseFromString(getRes.data, 'text/html')
      const csrf   = getDoc.querySelector<HTMLInputElement>(
        'input[name="__RequestVerificationToken"]'
      )?.value ?? ''

      // 2. POST the form data
      const formData = new URLSearchParams({
        FirstName:                   firstName,
        LastName:                    lastName,
        Email:                       email,
        Department:                  department,
        JobTitle:                    jobTitle,
        Role:                        role,
        Password:                    password,
        ConfirmPassword:             confirmPassword,
        __RequestVerificationToken:  csrf,
      })

      const res = await apiClient.post<string>('/Account/Register', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })

      // 3. If the response HTML contains validation errors, surface them
      const { model, fields } = parseServerErrors(res.data)
      if (model.length > 0 || Object.keys(fields).length > 0) {
        setModelErrors(model)
        setFieldErrors(fields)
        return
      }

      // 4. No errors — registration succeeded; go to the dashboard
      navigate('/visibility/dashboard')
    } catch (err: unknown) {
      // axios may reject on 4xx; try to parse errors from the response body
      const anyErr = err as { response?: { data?: string } }
      if (anyErr.response?.data) {
        const { model, fields } = parseServerErrors(anyErr.response.data)
        if (model.length > 0 || Object.keys(fields).length > 0) {
          setModelErrors(model)
          setFieldErrors(fields)
          return
        }
      }
      setModelErrors(['An unexpected error occurred. Please try again.'])
    } finally {
      setLoading(false)
    }
  }

  // ── Password suggestion helpers ──────────────────────────────────────────────

  function handleSuggestPassword() {
    const pw = generateStrongPassword()
    setGeneratedPassword(pw)
    setShowGenerated(true)
    setPassword(pw)
    setConfirmPassword(pw)
    setPwSuggested(true)
    setTimeout(() => setPwSuggested(false), 2000)
  }

  async function handleCopyPassword() {
    try {
      await navigator.clipboard.writeText(generatedPassword)
      setCopiedPw(true)
      setTimeout(() => setCopiedPw(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  // ── Per-field error renderer ─────────────────────────────────────────────────

  const fieldErr = (name: keyof FieldErrors) =>
    fieldErrors[name] ? (
      <span style={{ color: '#E74C3C', fontSize: 13, marginTop: 4, display: 'block' }}>
        {fieldErrors[name]}
      </span>
    ) : null

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="d-flex align-items-start justify-content-center"
      style={{
        minHeight:  '100vh',
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        padding:    '40px 16px',
      }}
    >
      <div
        style={{
          background:     'linear-gradient(135deg, rgba(15,23,42,.95) 0%, rgba(30,41,59,.95) 100%)',
          border:         '1px solid rgba(46, 134, 193, 0.3)',
          boxShadow:      '0 8px 25px rgba(0,0,0,.5)',
          borderRadius:   20,
          padding:        '40px 50px',
          backdropFilter: 'blur(20px)',
          maxWidth:       720,
          width:          '100%',
        }}
      >
        {/* ── Header ── */}
        <div
          className="text-center mb-4 pb-3"
          style={{ borderBottom: '2px solid rgba(46, 134, 193, 0.3)' }}
        >
          <img
            src="/images/BizibilityHubLogoNoBG.png"
            alt="Bizibility Hub"
            style={{ width: 280, height: 'auto', marginBottom: 20 }}
          />
          <h4 style={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}>
            <i className="fas fa-user-plus me-2" style={{ color: '#3b82f6' }} />
            Register New User
          </h4>
          <p style={{ color: '#BDC3C7', marginBottom: 0, fontSize: 14 }}>
            Create a new user account
          </p>
        </div>

        {/* ── Model-level validation summary ── */}
        {modelErrors.length > 0 && (
          <div
            className="mb-4"
            style={{
              background:   'rgba(231, 76, 60, 0.1)',
              border:       '1px solid rgba(231, 76, 60, 0.3)',
              borderRadius: 8,
              padding:      '14px 16px',
              color:        '#E74C3C',
              fontSize:     14,
            }}
          >
            <i className="fas fa-exclamation-circle me-2" />
            <strong>Please fix the following errors:</strong>
            <ul className="mb-0 mt-2 ps-3">
              {modelErrors.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* ── First Name + Last Name ── */}
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label" style={labelStyle}>First Name</label>
              <input
                type="text"
                className="form-control"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoFocus
                style={inputStyle}
              />
              {fieldErr('FirstName')}
            </div>
            <div className="col-md-6">
              <label className="form-label" style={labelStyle}>Last Name</label>
              <input
                type="text"
                className="form-control"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                style={inputStyle}
              />
              {fieldErr('LastName')}
            </div>
          </div>

          {/* ── Email ── */}
          <div className="mb-3">
            <label className="form-label" style={labelStyle}>Email</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              style={inputStyle}
            />
            {fieldErr('Email')}
          </div>

          {/* ── Department + Job Title ── */}
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label" style={labelStyle}>Department</label>
              <input
                type="text"
                className="form-control"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                style={inputStyle}
              />
              {fieldErr('Department')}
            </div>
            <div className="col-md-6">
              <label className="form-label" style={labelStyle}>Job Title</label>
              <input
                type="text"
                className="form-control"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                style={inputStyle}
              />
              {fieldErr('JobTitle')}
            </div>
          </div>

          {/* ── Role ── */}
          <div className="mb-3">
            <label className="form-label" style={labelStyle}>Role</label>
            <select
              className="form-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="User"   style={{ background: '#1E293B' }}>User</option>
              <option value="Viewer" style={{ background: '#1E293B' }}>Viewer</option>
              <option value="Admin"  style={{ background: '#1E293B' }}>Admin</option>
            </select>
            {fieldErr('Role')}
          </div>

          {/* ── Password section ── */}
          <div
            className="mb-4 p-3"
            style={{
              background:   'rgba(46, 134, 193, 0.08)',
              border:       '1px solid rgba(46, 134, 193, 0.3)',
              borderRadius: 10,
            }}
          >
            {/* Section header + suggest button */}
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span style={{ color: '#fff', fontWeight: 500 }}>
                <i className="fas fa-lock me-2" style={{ color: '#3b82f6' }} />
                Password
              </span>
              <button
                type="button"
                onClick={handleSuggestPassword}
                style={{
                  background:   'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  border:       'none',
                  borderRadius: 8,
                  color:        '#fff',
                  padding:      '6px 14px',
                  fontSize:     13,
                  fontWeight:   500,
                  cursor:       'pointer',
                }}
              >
                <i className={`fas ${pwSuggested ? 'fa-check' : 'fa-magic'} me-1`} />
                {pwSuggested ? 'Password Generated!' : 'Suggest Strong Password'}
              </button>
            </div>

            {/* Generated password display */}
            {showGenerated && (
              <div className="mb-3">
                <div className="d-flex">
                  <input
                    type="text"
                    readOnly
                    value={generatedPassword}
                    className="form-control font-monospace text-center"
                    style={{
                      background:   'rgba(46, 204, 113, 0.12)',
                      border:       '2px solid rgba(46, 204, 113, 0.5)',
                      borderRight:  'none',
                      borderRadius: '8px 0 0 8px',
                      color:        '#2ECC71',
                      fontSize:     17,
                      letterSpacing: 2,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    title="Copy to clipboard"
                    style={{
                      background:   'linear-gradient(135deg, #2ECC71, #27AE60)',
                      border:       'none',
                      borderRadius: '0 8px 8px 0',
                      color:        '#fff',
                      padding:      '0 16px',
                      cursor:       'pointer',
                      flexShrink:   0,
                    }}
                  >
                    <i className={`fas ${copiedPw ? 'fa-check' : 'fa-copy'}`} />
                  </button>
                </div>
                <small style={{ color: '#BDC3C7', display: 'block', marginTop: 6 }}>
                  <i className="fas fa-info-circle me-1" />
                  This password has been auto-filled below. Share it securely with the user.
                </small>
              </div>
            )}

            {/* Password + Confirm Password inputs */}
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label" style={{ ...labelStyle, fontSize: 14 }}>
                  Password
                </label>
                <input
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={inputStyle}
                />
                {fieldErr('Password')}
              </div>
              <div className="col-md-6">
                <label className="form-label" style={{ ...labelStyle, fontSize: 14 }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={inputStyle}
                />
                {fieldErr('ConfirmPassword')}
              </div>
            </div>
          </div>

          {/* ── Action buttons ── */}
          <div className="d-flex gap-3 flex-wrap">
            <button
              type="submit"
              className="btn"
              disabled={loading}
              style={{
                background:   loading
                  ? 'rgba(59,130,246,.5)'
                  : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                border:       '1px solid rgba(59,130,246,.5)',
                color:        '#fff',
                borderRadius: 10,
                padding:      '12px 28px',
                fontSize:     15,
                fontWeight:   600,
                transition:   'all 0.3s ease',
              }}
            >
              {loading
                ? <><i className="fas fa-spinner fa-spin me-2" />Creating User…</>
                : <><i className="fas fa-user-plus me-2" />Create User</>
              }
            </button>

            <Link
              to="/login"
              className="btn"
              style={{
                background:     'rgba(108, 117, 125, 0.25)',
                border:         '1px solid rgba(108, 117, 125, 0.4)',
                color:          '#AED6F1',
                borderRadius:   10,
                padding:        '12px 28px',
                fontSize:       15,
                fontWeight:     600,
                transition:     'all 0.3s ease',
                textDecoration: 'none',
              }}
            >
              <i className="fas fa-arrow-left me-2" />
              Back to Login
            </Link>
          </div>

        </form>
      </div>
    </div>
  )
}
