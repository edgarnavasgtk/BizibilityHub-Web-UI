import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

interface ContactForm {
  name: string
  company: string
  phone: string
  email: string
  message: string
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(30,41,59,.5)',
  border: '1px solid rgba(46,134,193,.3)',
  color: '#FFFFFF',
}

const INFO_ITEMS = [
  { icon: 'fas fa-rocket',     color: 'text-primary', title: 'Ready to Start?', desc: 'Our AI-powered solutions can transform your business operations. Let\'s discuss your specific needs.' },
  { icon: 'fas fa-clock',      color: 'text-success',  title: 'Response Time',  desc: 'We typically respond within 24 hours during business days.' },
  { icon: 'fas fa-handshake',  color: 'text-warning',  title: 'Free Consultation', desc: 'Every inquiry includes a complimentary consultation to understand your requirements.' },
  { icon: 'fas fa-shield-alt', color: 'text-info',     title: 'Enterprise Security', desc: 'All discussions are covered under strict confidentiality agreements.' },
]

export default function ContactPage() {
  const [form, setForm] = useState<ContactForm>({ name: '', company: '', phone: '', email: '', message: '' })
  const [sent, setSent] = useState(false)

  const mutation = useMutation({
    mutationFn: (data: ContactForm) => apiClient.post('/Contact', data).then(r => r.data),
    onSuccess: () => setSent(true),
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate(form)
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>
      <div className="row justify-content-center">
        <div className="col-xl-8 col-lg-10">

          <div
            className="rounded overflow-hidden"
            style={{ background: 'linear-gradient(135deg,rgba(15,23,42,.95),rgba(30,41,59,.95))', border: '1px solid rgba(46,134,193,.3)', boxShadow: '0 8px 25px rgba(0,0,0,.5)' }}
          >
            {/* Header */}
            <div
              className="text-center py-4 px-4"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)', borderBottom: '1px solid rgba(46,134,193,.3)' }}
            >
              <h1 className="h3 mb-2"><i className="fas fa-envelope me-2" />Contact Guatemaltek Bizibility Hub</h1>
              <p className="mb-0">Ready to transform your business with AI-powered intelligence?</p>
            </div>

            <div className="card-body p-4">
              {mutation.isError && (
                <div className="alert alert-danger alert-dismissible fade show mb-3" role="alert">
                  <i className="fas fa-exclamation-triangle me-2" />Failed to send message. Please try again.
                  <button type="button" className="btn-close" onClick={() => mutation.reset()} />
                </div>
              )}

              {sent ? (
                <div className="text-center py-5">
                  <i className="fas fa-check-circle" style={{ fontSize: 64, color: '#10b981', marginBottom: 16 }} />
                  <h4 className="text-white mb-2">Message Sent!</h4>
                  <p className="text-muted mb-4">Thank you for reaching out. We'll respond within 24 hours.</p>
                  <button className="btn btn-outline-primary" onClick={() => { setSent(false); setForm({ name: '', company: '', phone: '', email: '', message: '' }) }}>
                    Send Another Message
                  </button>
                </div>
              ) : (
                <div className="row">
                  {/* Form */}
                  <div className="col-lg-8">
                    <form onSubmit={handleSubmit} noValidate>
                      <div className="mb-3">
                        <label className="form-label" style={{ color: '#AED6F1', fontWeight: 500 }}>Name</label>
                        <input
                          name="name" type="text" className="form-control" required
                          value={form.name} onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label" style={{ color: '#AED6F1', fontWeight: 500 }}>Company</label>
                        <input
                          name="company" type="text" className="form-control" required
                          value={form.company} onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label" style={{ color: '#AED6F1', fontWeight: 500 }}>Phone</label>
                        <input
                          name="phone" type="tel" className="form-control"
                          value={form.phone} onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label" style={{ color: '#AED6F1', fontWeight: 500 }}>Email</label>
                        <input
                          name="email" type="email" className="form-control" required
                          value={form.email} onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                      <div className="mb-4">
                        <label className="form-label" style={{ color: '#AED6F1', fontWeight: 500 }}>Message</label>
                        <textarea
                          name="message" className="form-control" rows={4} required
                          placeholder="Tell us about your business needs or questions..."
                          value={form.message} onChange={handleChange}
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                      </div>
                      <div className="d-grid gap-2 d-md-flex justify-content-md-end">
                        <Link to="/" className="btn btn-outline-secondary me-md-2">
                          <i className="fas fa-arrow-left me-2" />Back to Home
                        </Link>
                        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
                          {mutation.isPending
                            ? <><span className="spinner-border spinner-border-sm me-2" />Sending…</>
                            : <><i className="fas fa-paper-plane me-2" />Send Message</>
                          }
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Info sidebar */}
                  <div className="col-lg-4 mt-4 mt-lg-0">
                    <div
                      className="h-100 p-4 rounded"
                      style={{ background: 'linear-gradient(135deg,rgba(15,23,42,.95),rgba(30,41,59,.95))', border: '1px solid rgba(46,134,193,.3)', borderLeft: '4px solid #2E86C1' }}
                    >
                      <h4 style={{ color: '#3b82f6' }} className="mb-3">
                        <i className="fas fa-info-circle me-2" />Get in Touch
                      </h4>
                      {INFO_ITEMS.map((item) => (
                        <div key={item.title} style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(46,134,193,.15)' }}>
                          <h6 style={{ color: '#FFFFFF', fontWeight: 600, marginBottom: '0.5rem' }}>
                            <i className={`${item.icon} ${item.color} me-2`} />{item.title}
                          </h6>
                          <p style={{ color: 'rgba(174,214,241,.8)', fontSize: 13, marginBottom: 0 }}>{item.desc}</p>
                        </div>
                      ))}
                      <hr style={{ borderColor: 'rgba(46,134,193,.3)' }} />
                      <div className="text-center">
                        <h6 style={{ color: '#3b82f6' }}>Guatemaltek Bizibility Hub</h6>
                        <p style={{ color: 'rgba(174,214,241,.8)', fontSize: 12, marginBottom: 0 }}>AI-Powered Enterprise Intelligence</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
