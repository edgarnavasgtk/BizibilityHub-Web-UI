import { Link } from 'react-router-dom'

const REPORTS = [
  {
    icon: 'fas fa-chart-column',
    iconColor: '#3b82f6',
    title: 'Volume Report',
    description:
      'Executions, successes, failures, payload bytes, and average processing time at the platform, environment, flow, or endpoint level over a configurable date range.',
    href: '/reports/volume',
  },
  {
    icon: 'fas fa-chart-line',
    iconColor: '#10b981',
    title: 'Usage Trend',
    description:
      'Hourly / daily / weekly / monthly trends for executions, success/failure split, and average processing time per integration flow or endpoint. Spans up to 12 months when zoomed out.',
    href: '/reports/usage-trend',
  },
]

const cardStyle: React.CSSProperties = {
  background: 'rgba(15,23,42,.85)',
  border: '1px solid rgba(46,134,193,.2)',
  borderRadius: 12,
  padding: '1.5rem',
}

const iconBoxStyle = (color: string): React.CSSProperties => ({
  width: 52,
  height: 52,
  borderRadius: 12,
  background: `${color}22`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
})

export default function ReportsHubPage() {
  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      <div className="mb-4">
        <h1 className="h3 text-white mb-1">Reports Hub</h1>
        <p className="text-muted mb-0">
          Parameterised, exportable reports. Each report runs over an explicit date window and exports to Excel or CSV.
        </p>
      </div>

      <div className="row g-4">
        {REPORTS.map((r) => (
          <div key={r.href} className="col-md-6">
            <div style={cardStyle} className="h-100 d-flex flex-column">
              <div className="d-flex align-items-start gap-3 mb-3">
                <div style={iconBoxStyle(r.iconColor)}>
                  <i className={r.icon} style={{ fontSize: 22, color: r.iconColor }} />
                </div>
                <h5 className="text-white mb-0 pt-1">{r.title}</h5>
              </div>
              <p className="text-muted mb-4" style={{ fontSize: 14, lineHeight: 1.6, flexGrow: 1 }}>
                {r.description}
              </p>
              <div>
                <Link
                  to={r.href}
                  className="btn btn-outline-primary btn-sm"
                >
                  Open report <i className="fas fa-arrow-right ms-1" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
