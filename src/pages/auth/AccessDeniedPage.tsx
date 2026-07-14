import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function AccessDeniedPage() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 480, padding: '2rem' }}>
        <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>
          <i className="fas fa-shield-alt" style={{ color: '#EF4444' }} />
        </div>
        <h1 style={{ color: '#FFFFFF', fontSize: '2rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Access Denied
        </h1>
        <p style={{ color: 'rgba(174,214,241,0.8)', fontSize: '1rem', marginBottom: '2rem' }}>
          You don't have permission to access this resource. Contact your administrator if you believe this is an error.
        </p>
        <div className="d-flex gap-3 justify-content-center flex-wrap">
          {isAuthenticated ? (
            <>
              <button
                className="btn btn-primary"
                onClick={() => navigate(-1)}
              >
                <i className="fas fa-arrow-left me-2" />Go Back
              </button>
              <Link to="/visibility/dashboard" className="btn btn-outline-light">
                <i className="fas fa-home me-2" />Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-primary">
                <i className="fas fa-sign-in-alt me-2" />Login
              </Link>
              <Link to="/" className="btn btn-outline-light">
                <i className="fas fa-home me-2" />Home
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
