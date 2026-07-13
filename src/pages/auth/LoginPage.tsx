function LoginPage() {
  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: '100vh', background: 'var(--gradient-dark)' }}
    >
      <div
        className="card p-4"
        style={{
          width: 400,
          background: 'rgba(30, 41, 59, 0.95)',
          border: '1px solid var(--gtek-glass-border)',
          borderRadius: 12,
          color: 'var(--gtek-text-white)',
        }}
      >
        <div className="text-center mb-4">
          <h4 style={{ color: 'var(--gtek-text-white)', fontWeight: 700 }}>BizibilityHub</h4>
          <p style={{ color: 'var(--gtek-text-gray)', fontSize: 14 }}>Inicia sesión para continuar</p>
        </div>

        <form>
          <div className="mb-3">
            <label className="form-label" style={{ color: 'var(--gtek-text-gray)', fontSize: 13 }}>
              Correo electrónico
            </label>
            <input
              type="email"
              className="form-control"
              style={{
                background: 'rgba(46,134,193,0.08)',
                border: '1px solid var(--gtek-glass-border)',
                color: 'var(--gtek-text-white)',
              }}
            />
          </div>
          <div className="mb-4">
            <label className="form-label" style={{ color: 'var(--gtek-text-gray)', fontSize: 13 }}>
              Contraseña
            </label>
            <input
              type="password"
              className="form-control"
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
            style={{
              background: 'var(--gradient-primary)',
              color: '#fff',
              fontWeight: 600,
              border: 'none',
              borderRadius: 8,
              padding: '10px',
            }}
          >
            Iniciar sesión
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
