import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import AppNavbar from '../../components/layout/AppNavbar'

export default function HomePage() {
  const { isAuthenticated } = useAuthStore()

  return (
    <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', minHeight: '100vh' }}>
      {/* Show full app navbar when authenticated, public navbar when not */}
      {isAuthenticated ? (
        <AppNavbar />
      ) : (
        <nav className="navbar navbar-expand-xl navbar-dark navbar-guatemaltek">
          <div className="container-fluid">
            <Link className="navbar-brand" to="/">
              <img src="/img/logo-gtek.png" alt="GTek" style={{ height: 36 }} />
            </Link>
            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#publicNav"
            >
              <span className="navbar-toggler-icon" />
            </button>
            <div className="collapse navbar-collapse" id="publicNav">
              <ul className="navbar-nav me-auto">
                <li className="nav-item">
                  <Link className="nav-link d-flex align-items-center gap-1" to="/">
                    <i className="fas fa-home" /> Home
                  </Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link d-flex align-items-center gap-1" to="/contact">
                    <i className="fas fa-envelope" /> Contact
                  </Link>
                </li>
              </ul>
              <ul className="navbar-nav ms-auto">
                <li className="nav-item">
                  <Link className="nav-link" to="/login">
                    <i className="fas fa-sign-in-alt me-1" /> Login
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </nav>
      )}

      {/* Hero Section */}
      <div style={{ padding: '4rem 0' }}>
        <div className="container">
          <div className="row align-items-center" style={{ minHeight: '75vh' }}>
            <div className="col-lg-6">
              <div className="mb-3">
                <span className="badge bg-primary fs-6 mb-2" style={{ padding: '0.5rem 1rem' }}>
                  <i className="fas fa-user-shield me-2" />AI + Human Control
                </span>
              </div>
              <h1 style={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1.2, marginBottom: '1.5rem' }}>
                <span style={{ background: 'linear-gradient(90deg, #3b82f6 0%, #f97316 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  AI-Powered Enterprise Intelligence.
                </span>
                <br />
                <span style={{ color: '#FFFFFF' }}>Beyond Analytics.</span>
              </h1>
              <p style={{ fontSize: '1.25rem', color: 'rgba(174, 214, 241, 0.9)', marginBottom: '1.5rem' }}>
                GTek Bizibility Hub deploys intelligent AI agents that don't just monitor your business — they understand, predict,
                and proactively resolve issues before they impact operations.{' '}
                <strong style={{ color: '#AED6F1' }}>
                  Get the best of both worlds: autonomous AI intelligence working 24/7, while you maintain complete control with full dashboard access and override capabilities.
                </strong>
              </p>
              <div>
                <a
                  href="#solutions"
                  className="btn btn-lg"
                  style={{ borderColor: 'rgba(46,134,193,0.5)', color: '#AED6F1', background: 'transparent', border: '1px solid rgba(46,134,193,0.5)' }}
                >
                  <i className="fas fa-info-circle me-2" />Learn More
                </a>
              </div>
            </div>
            <div className="col-lg-6">
              <div style={{ maxWidth: 420, margin: '0 auto' }}>
                <div style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)', border: '1px solid rgba(46,134,193,0.3)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ background: 'rgba(46,134,193,0.2)', borderBottom: '1px solid rgba(46,134,193,0.3)', padding: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                    <small style={{ color: 'rgba(174,214,241,0.8)', marginLeft: 8 }}>Your Control Center - Always Accessible</small>
                  </div>
                  <div style={{ padding: '1.5rem' }}>
                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <div style={{ background: 'rgba(46,134,193,0.1)', border: '1px solid rgba(46,134,193,0.3)', borderRadius: 8, padding: '1rem', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF' }}>15.2K</div>
                          <div style={{ fontSize: '0.875rem', color: 'rgba(174,214,241,0.8)' }}>Total</div>
                        </div>
                      </div>
                      <div className="col-6">
                        <div style={{ background: 'rgba(46,134,193,0.1)', border: '1px solid rgba(46,134,193,0.3)', borderRadius: 8, padding: '1rem', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF' }}>14.9K</div>
                          <div style={{ fontSize: '0.875rem', color: 'rgba(174,214,241,0.8)' }}>Success</div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 100, marginTop: '1rem' }}>
                      {[60, 80, 45, 90, 70].map((h, i) => (
                        <div key={i} style={{ flex: 1, background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)', margin: '0 4px', borderRadius: '4px 4px 0 0', height: `${h}%`, minHeight: 20 }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Solutions Section */}
      <section id="solutions" style={{ padding: '4rem 0' }}>
        <div className="container">
          <div className="row mb-5">
            <div className="col-12 text-center">
              <h2 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '1.5rem' }}>
                Intelligent Autonomous Operations
              </h2>
              <div style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: 10 }}>
                <p style={{ fontSize: '1.5rem', fontWeight: 600, color: '#2E86C1', margin: 0 }}>
                  AI agents that monitor, analyze, predict, and autonomously resolve business challenges
                </p>
                <div style={{ width: 100, height: 4, background: 'linear-gradient(90deg, #2E86C1 0%, #f97316 100%)', margin: '1rem auto 0', borderRadius: 2 }} />
              </div>
            </div>
          </div>
          <div className="row">
            {[
              { icon: 'fa-brain', color: '#3b82f6', title: 'Intelligent Monitoring', desc: 'AI-powered real-time monitoring with full customer access to dashboards, analytics, and controls.', items: ['Interactive dashboards & real-time analytics', 'Pattern recognition & anomaly detection', 'Full monitoring access with AI assistance'] },
              { icon: 'fa-robot', color: '#f59e0b', title: 'Proactive AI Agents', desc: 'Intelligent agents that monitor specific business processes, automatically detect errors, and take corrective actions.', items: ['Autonomous error detection & classification', 'Smart notification with impact analysis', 'Self-healing system capabilities'] },
              { icon: 'fa-chart-line', color: '#06b6d4', title: 'Interactive Analytics', desc: 'Comprehensive dashboards and analytics tools that let you explore, analyze, and visualize all your monitoring data with powerful insights.', items: ['Interactive data exploration', 'Custom dashboard creation', 'Real-time visualization tools'] },
              { icon: 'fa-magic', color: '#10b981', title: 'Autonomous Resolution', desc: 'Next-generation AI that understands root causes and autonomously implements solutions to prevent business disruption.', items: ['Root cause analysis with AI reasoning', 'Automated remediation workflows', 'Continuous learning & optimization'] },
            ].map((card, i) => (
              <div key={i} className="col-lg-3 col-md-6 mb-4">
                <div style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)', border: '1px solid rgba(46,134,193,0.3)', borderRadius: 10, padding: '2rem', height: '100%', transition: 'all 0.3s ease' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(46,134,193,0.6)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-5px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(46,134,193,0.3)'; (e.currentTarget as HTMLDivElement).style.transform = 'none' }}
                >
                  <div className="mb-3">
                    <i className={`fas ${card.icon} fa-4x`} style={{ color: card.color }} />
                  </div>
                  <h4 style={{ color: '#FFFFFF', marginBottom: '0.75rem' }}>{card.title}</h4>
                  <p style={{ color: 'rgba(174,214,241,0.7)', marginBottom: '1rem' }}>{card.desc}</p>
                  <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
                    {card.items.map((item, j) => (
                      <li key={j} style={{ paddingLeft: '1.5rem', position: 'relative', marginBottom: '0.5rem', color: 'rgba(174,214,241,0.9)' }}>
                        <span style={{ position: 'absolute', left: 0, color: '#10b981', fontWeight: 'bold' }}>✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Agents Section */}
      <section style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(10px)', padding: '4rem 0' }}>
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6">
              <h2 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '1.5rem' }}>
                <i className="fas fa-robot text-primary me-3" />Intelligent AI Agents at Work
              </h2>
              <p style={{ color: 'rgba(174,214,241,0.9)', marginBottom: '1.5rem' }}>
                Our AI agents go beyond traditional monitoring. They understand your business context, learn from patterns,
                and take autonomous action when issues arise — all while you maintain complete visibility and control.{' '}
                <strong style={{ color: '#AED6F1' }}>You're always in command, with full access to monitoring dashboards and the ability to override any AI decision.</strong>
              </p>
              <div className="row">
                {[
                  { icon: 'fa-eye', color: '#3b82f6', title: 'Continuous Learning', desc: 'Agents adapt to your business patterns and improve decision-making over time' },
                  { icon: 'fa-bell', color: '#f59e0b', title: 'Smart Notifications', desc: 'Context-aware alerts with impact analysis and recommended actions' },
                  { icon: 'fa-wrench', color: '#10b981', title: 'Auto-Remediation', desc: 'Autonomous problem resolution with configurable intervention levels' },
                  { icon: 'fa-chart-line', color: '#06b6d4', title: 'Predictive Insights', desc: 'Forecast potential issues before they occur and prepare countermeasures' },
                  { icon: 'fa-user-shield', color: '#3b82f6', title: 'Full Control', desc: 'Complete access to dashboards, analytics, and override controls — you\'re always in charge' },
                  { icon: 'fa-tachometer-alt', color: '#10b981', title: 'Real-time Visibility', desc: 'Monitor everything in real-time with interactive dashboards and detailed analytics' },
                ].map((f, i) => (
                  <div key={i} className="col-md-6 mb-3">
                    <div className="d-flex">
                      <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(46,134,193,0.1)', borderRadius: '50%', flexShrink: 0, marginRight: '0.75rem' }}>
                        <i className={`fas ${f.icon}`} style={{ color: f.color }} />
                      </div>
                      <div>
                        <h5 style={{ color: '#FFFFFF', marginBottom: '0.25rem' }}>{f.title}</h5>
                        <small style={{ color: 'rgba(174,214,241,0.8)' }}>{f.desc}</small>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-lg-6">
              <div style={{ maxWidth: 400, margin: '0 auto' }}>
                <div style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)', border: '1px solid rgba(46,134,193,0.3)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', padding: '1rem', textAlign: 'center' }}>
                    <h5 style={{ color: '#FFFFFF', margin: 0 }}><i className="fas fa-cogs me-2" />AI Agent Workflow</h5>
                  </div>
                  <div style={{ padding: '1.5rem' }}>
                    {[
                      { num: '1', color: '#3b82f6', title: 'Monitor', desc: 'Continuously scan all business processes for anomalies' },
                      { num: '2', color: '#f59e0b', title: 'Analyze', desc: 'Apply AI reasoning to understand root causes and impact' },
                      { num: '3', color: '#06b6d4', title: 'Predict', desc: 'Forecast potential escalation and business impact' },
                      { num: '4', color: '#10b981', title: 'Act', desc: 'Execute autonomous resolution or notify with recommendations' },
                    ].map((step, i, arr) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', position: 'relative', marginBottom: i < arr.length - 1 ? '1rem' : 0 }}>
                        {i < arr.length - 1 && (
                          <div style={{ position: 'absolute', left: 19, top: 40, width: 2, height: 20, background: 'rgba(46,134,193,0.3)' }} />
                        )}
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: step.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#FFFFFF', marginRight: 15, flexShrink: 0 }}>
                          {step.num}
                        </div>
                        <div style={{ paddingTop: 8 }}>
                          <strong style={{ color: '#FFFFFF' }}>{step.title}</strong>
                          <p style={{ color: 'rgba(174,214,241,0.8)', margin: 0, fontSize: '0.875rem' }}>{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section style={{ padding: '3rem 0' }}>
        <div className="container">
          <div className="row text-center">
            {[
              { num: 'AI', label: 'Powered Intelligence', color: '#3b82f6' },
              { num: '24/7', label: 'Autonomous Monitoring', color: '#10b981' },
              { num: 'Proactive', label: 'Issue Resolution', color: '#f59e0b' },
              { num: 'Self', label: 'Healing Systems', color: '#06b6d4' },
            ].map((s, i) => (
              <div key={i} className="col-lg-3 col-md-6 mb-2">
                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: s.color }}>{s.num}</div>
                <div style={{ color: 'rgba(174,214,241,0.8)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{ background: 'rgba(46,134,193,0.1)', borderTop: '1px solid rgba(46,134,193,0.3)', borderBottom: '1px solid rgba(46,134,193,0.3)', padding: '3rem 0' }}>
        <div className="container">
          <div className="row justify-content-center text-center">
            <div className="col-lg-8">
              <h2 style={{ color: '#FFFFFF', marginBottom: '1rem' }}>Ready to Deploy Autonomous AI Operations?</h2>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(10px)', padding: '4rem 0' }}>
        <div className="container">
          <div className="row justify-content-center text-center">
            <div className="col-lg-8">
              <h2 style={{ color: '#FFFFFF', marginBottom: '1rem' }}>
                <i className="fas fa-handshake text-primary me-2" />Ready to Get Started?
              </h2>
              <p style={{ color: 'rgba(174,214,241,0.9)', marginBottom: '1.5rem' }}>
                Transform your business operations with AI-powered enterprise intelligence.
                Our team is ready to discuss how GTek Bizibility Hub can revolutionize your monitoring and analytics.
              </p>
              <div className="row mb-4">
                {[
                  { icon: 'fa-comments', color: '#3b82f6', title: 'Free Consultation', desc: 'Discuss your needs with our AI specialists' },
                  { icon: 'fa-clock', color: '#10b981', title: 'Quick Response', desc: 'We respond within 24 hours' },
                  { icon: 'fa-shield-alt', color: '#f59e0b', title: 'Confidential', desc: 'All discussions under strict NDA' },
                ].map((f, i) => (
                  <div key={i} className="col-md-4 mb-3">
                    <div style={{ padding: '2rem 1rem' }}>
                      <i className={`fas ${f.icon} fa-3x mb-3`} style={{ color: f.color, display: 'block' }} />
                      <h5 style={{ color: '#FFFFFF' }}>{f.title}</h5>
                      <p style={{ color: 'rgba(174,214,241,0.8)' }}>{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to="/contact"
                className="btn btn-lg"
                style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '1px solid rgba(59,130,246,0.5)', color: '#FFFFFF' }}
              >
                <i className="fas fa-envelope me-2" />Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: 'rgba(15,23,42,0.8)', borderTop: '1px solid rgba(46,134,193,0.2)', padding: '1.5rem 0', textAlign: 'center' }}>
        <p style={{ color: 'rgba(174,214,241,0.5)', margin: 0, fontSize: '0.875rem' }}>
          © {new Date().getFullYear()} GTek Bizibility Hub. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
