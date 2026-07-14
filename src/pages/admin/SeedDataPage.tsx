import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

interface SeedResult {
  success: boolean
  message: string
}

export default function SeedDataPage() {
  const [result, setResult] = useState<SeedResult | null>(null)

  const seedMutation = useMutation({
    mutationFn: async (): Promise<SeedResult> => {
      // Returns a redirect → HTML page (no JSON API); timeout=0 because seeding takes several minutes
      const res = await apiClient.post('/BeverageData/SeedData', null, {
        responseType: 'text',
        timeout: 0,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const html = res.data as string
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const errorEl = doc.querySelector('.alert-danger')
      if (errorEl) return { success: false, message: errorEl.textContent?.trim() ?? 'Error seeding data.' }
      return { success: true, message: 'Beverage company data has been successfully seeded!' }
    },
    onSuccess: data => setResult(data),
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? 'An error occurred during data generation. Please check the logs.'
      setResult({ success: false, message: msg })
    },
  })

  const handleSeed = () => {
    if (window.confirm('This will generate a large coffee company dataset with 15-step business process flow. This process may take several minutes. Continue?')) {
      setResult(null)
      seedMutation.mutate()
    }
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: 800,
    margin: '0 auto',
    padding: 30,
  }

  const cardStyle: React.CSSProperties = {
    background: 'rgba(15,23,42,0.85)',
    border: '1px solid rgba(46,134,193,0.2)',
    borderRadius: 12,
    padding: 30,
    color: '#F1F5F9',
  }

  const featureListStyle: React.CSSProperties = {
    background: 'rgba(30,41,59,0.8)',
    borderRadius: 8,
    padding: 20,
    margin: '20px 0',
    border: '1px solid rgba(46,134,193,0.15)',
  }

  return (
    <div style={{ background: 'linear-gradient(180deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)', minHeight: '100vh', padding: '20px 0' }}>
      <div style={containerStyle}>
        <h1 style={{ color: '#fff', fontWeight: 700, marginBottom: 24, fontSize: 24 }}>
          Coffee Company Data Seeding
        </h1>

        {result && (
          <div style={{
            background: result.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${result.success ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
            color: result.success ? '#22C55E' : '#EF4444',
            borderRadius: 8, padding: 15, marginBottom: 20,
          }}>
            {result.message}
          </div>
        )}

        <div style={cardStyle}>
          <h2 style={{ color: '#fff', fontWeight: 700, marginBottom: 12, fontSize: 20 }}>
            Generate Coffee Company Dataset
          </h2>

          <p style={{ color: '#BDC3C7', lineHeight: 1.6, marginBottom: 0 }}>
            This will populate your database with a comprehensive coffee company dataset including business structure,
            coffee brands, and realistic order transaction data with complete 15-step business process flow.
            Data includes recent transactions (30% last 24 hours, 40% last week, 30% historical).
          </p>

          {/* What will be created */}
          <div style={featureListStyle}>
            <h5 style={{ color: '#fff', marginBottom: 12 }}>What will be created:</h5>
            <div className="row">
              <div className="col-md-6">
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  <li style={{ marginBottom: 8, color: '#BDC3C7' }}>
                    <strong style={{ color: '#F1F5F9' }}>4 Coffee Segments</strong><br />
                    <small style={{ color: '#94A3B8' }}>Coffee, Tea, Coffee Pods, Instant Coffee</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7' }}>
                    <strong style={{ color: '#F1F5F9' }}>38 Coffee Brands</strong><br />
                    <small style={{ color: '#94A3B8' }}>Peet's Coffee, Stumptown, Gevalia, Maxwell House, etc.</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7' }}>
                    <strong style={{ color: '#F1F5F9' }}>4 Business Processes</strong><br />
                    <small style={{ color: '#94A3B8' }}>Order, Inventory, Delivery, Invoice</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7' }}>
                    <strong style={{ color: '#F1F5F9' }}>7 Business Subprocesses</strong><br />
                    <small style={{ color: '#94A3B8' }}>Order Creation, Reservation, Shipment Request/Confirmation/Update/Status, Invoice Creation</small>
                  </li>
                </ul>
              </div>
              <div className="col-md-6">
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  <li style={{ marginBottom: 8, color: '#BDC3C7' }}>
                    <strong style={{ color: '#F1F5F9' }}>9 Document Types</strong><br />
                    <small style={{ color: '#94A3B8' }}>Sales Orders, Purchase Orders, Invoices, etc.</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7' }}>
                    <strong style={{ color: '#F1F5F9' }}>25,300 Orders</strong><br />
                    <small style={{ color: '#94A3B8' }}>25K Production, 200 UAT, 100 Test</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7' }}>
                    <strong style={{ color: '#F1F5F9' }}>~380K Transactions</strong><br />
                    <small style={{ color: '#94A3B8' }}>15 steps per complete order (including Invoice)</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7' }}>
                    <strong style={{ color: '#F1F5F9' }}>Realistic Integration Flow</strong><br />
                    <small style={{ color: '#94A3B8' }}>Boomi ↔ Magento ↔ OMS ↔ LSP, 10% failure rate</small>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* 15-Step Business Process Flow */}
          <div style={featureListStyle}>
            <h5 style={{ color: '#fff', marginBottom: 12 }}>15-Step Business Process Flow:</h5>
            <div className="row">
              <div className="col-md-6">
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  <li style={{ marginBottom: 8, color: '#BDC3C7', fontSize: 13 }}>
                    <strong style={{ color: '#F1F5F9' }}>Order Process (2 steps)</strong><br />
                    <small style={{ color: '#94A3B8' }}>Get Magento Order → Create OMS Order</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7', fontSize: 13 }}>
                    <strong style={{ color: '#F1F5F9' }}>Inventory Process (5 steps)</strong><br />
                    <small style={{ color: '#94A3B8' }}>Stock Reserved → Get Availability → Update Magento (LOR/TAS) → Update Channel Engine</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7', fontSize: 13 }}>
                    <strong style={{ color: '#F1F5F9' }}>Delivery Process - Request (2 steps)</strong><br />
                    <small style={{ color: '#94A3B8' }}>Fulfilment Order → Send to Partner</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7', fontSize: 13 }}>
                    <strong style={{ color: '#F1F5F9' }}>Delivery Process - Confirmation (1 step)</strong><br />
                    <small style={{ color: '#94A3B8' }}>Shipment Confirmation to OMS</small>
                  </li>
                </ul>
              </div>
              <div className="col-md-6">
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  <li style={{ marginBottom: 8, color: '#BDC3C7', fontSize: 13 }}>
                    <strong style={{ color: '#F1F5F9' }}>Delivery Process - Update (1 step)</strong><br />
                    <small style={{ color: '#94A3B8' }}>Shipment Update to Magento</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7', fontSize: 13 }}>
                    <strong style={{ color: '#F1F5F9' }}>Delivery Process - Status (3 steps)</strong><br />
                    <small style={{ color: '#94A3B8' }}>IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7', fontSize: 13 }}>
                    <strong style={{ color: '#F1F5F9' }}>Invoice Process (1 step)</strong><br />
                    <small style={{ color: '#94A3B8' }}>Invoice Generation</small>
                  </li>
                  <li style={{ marginBottom: 8, color: '#BDC3C7', fontSize: 13 }}>
                    <strong style={{ color: '#F1F5F9' }}>System Integration</strong><br />
                    <small style={{ color: '#94A3B8' }}>Boomi ↔ Magento ↔ OMS ↔ LSP ↔ Channel Engine</small>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Warning box */}
          <div style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 8, padding: 15, margin: '20px 0',
          }}>
            <h6 style={{ color: '#F59E0B', marginBottom: 8 }}>Important Notes:</h6>
            <ul style={{ paddingLeft: 20, margin: 0, color: '#FCD34D', fontSize: 14 }}>
              <li style={{ marginBottom: 4 }}>This process will create a large amount of data (~380,000+ transactions)</li>
              <li style={{ marginBottom: 4 }}>Generation may take several minutes to complete</li>
              <li style={{ marginBottom: 4 }}>Existing data in related tables will be preserved (skipped if data exists)</li>
              <li>This operation is safe to run multiple times</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              type="button"
              onClick={handleSeed}
              disabled={seedMutation.isPending}
              style={{
                background: seedMutation.isPending
                  ? 'rgba(46,134,193,0.4)'
                  : 'linear-gradient(135deg,#2E86C1,#3498DB)',
                border: 'none', padding: '12px 30px', fontSize: 16,
                fontWeight: 600, borderRadius: 8, color: '#fff',
                cursor: seedMutation.isPending ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              {seedMutation.isPending ? 'Generating Data…' : 'Start Data Generation'}
            </button>
          </div>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link to="/visibility/dashboard" style={{ color: '#94A3B8', fontSize: 14, textDecoration: 'none' }}>
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
