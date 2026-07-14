import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

type StepStatus = 'complete' | 'attention' | 'pending' | 'active'

interface StepState { status: StepStatus; complete: boolean; metric?: string }
interface OnboardingStatus {
  success: boolean
  steps: { connect: StepState; environments: StepState; discover: StepState; map: StepState; monitor: StepState }
}
interface ConnectionResult { success: boolean; message: string }
interface ConnectionTestResult { success: boolean; allGreen: boolean; boomi: ConnectionResult; solace: ConnectionResult }
type DotState = 'idle' | 'testing' | 'green' | 'red'

function StepCircle({ num, status }: { num: number; status?: StepStatus }) {
  const bg = status === 'complete' ? 'linear-gradient(135deg,#10B981,#059669)'
    : status === 'attention' ? 'linear-gradient(135deg,#F59E0B,#D97706)'
    : status === 'active' ? 'linear-gradient(135deg,#3B82F6,#2563EB)' : 'transparent'
  const border = status === 'complete' ? '#10B981' : status === 'attention' ? '#F59E0B' : status === 'active' ? '#3B82F6' : '#475569'
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.85rem', border: `2px solid ${border}`, background: bg, color: status ? '#fff' : '#94A3B8', transition: 'all 0.3s ease' }}>
      {status === 'complete' ? '✓' : num}
    </div>
  )
}

function StatusBadge({ status }: { status: StepStatus }) {
  const configs = {
    complete:  { bg: 'rgba(16,185,129,0.15)', color: '#10B981', border: 'rgba(16,185,129,0.3)', label: '✓ Complete' },
    attention: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: 'rgba(245,158,11,0.3)', label: '⚠ Needs Attention' },
    pending:   { bg: 'rgba(148,163,184,0.15)', color: '#94A3B8', border: 'rgba(148,163,184,0.3)', label: '○ Pending' },
    active:    { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6', border: 'rgba(59,130,246,0.3)', label: '↻ Active' },
  }
  const c = configs[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, fontSize: '.75rem', fontWeight: 600, marginBottom: 12, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{c.label}</span>
  )
}

function ConnectionDot({ state }: { state: DotState }) {
  return (
    <span style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block', background: state === 'green' ? '#10B981' : state === 'red' ? '#EF4444' : state === 'testing' ? '#F59E0B' : '#475569', boxShadow: state === 'green' ? '0 0 8px rgba(16,185,129,0.4)' : state === 'red' ? '0 0 8px rgba(239,68,68,0.4)' : 'none', animation: state === 'testing' ? 'pulse 1s infinite' : 'none' }} />
  )
}

const ICON_COLORS: Record<number, string> = {
  1: 'linear-gradient(135deg,#3B82F6,#2563EB)', 2: 'linear-gradient(135deg,#8B5CF6,#7C3AED)',
  3: 'linear-gradient(135deg,#06B6D4,#0891B2)', 4: 'linear-gradient(135deg,#F59E0B,#D97706)',
  5: 'linear-gradient(135deg,#EF4444,#DC2626)',
}

function StepCard({ stepNum, iconClass, title, desc, status, metric, children }: {
  stepNum: number; iconClass: string; title: string; desc: string; status: StepStatus; metric?: string; children?: React.ReactNode
}) {
  return (
    <div style={{ background: '#1E293B', borderRadius: 12, padding: 25, boxShadow: '0 4px 16px rgba(0,0,0,0.5)', border: '1px solid rgba(46,134,193,0.2)', marginBottom: 20, transition: 'all 0.3s ease', position: 'relative', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = 'translateY(-3px)'; el.style.borderColor = 'rgba(46,134,193,0.5)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = ''; el.style.borderColor = 'rgba(46,134,193,0.2)' }}
    >
      <span style={{ position: 'absolute', top: 12, right: 15, fontSize: '2.5rem', fontWeight: 800, color: 'rgba(255,255,255,0.06)', lineHeight: 1 }}>{String(stepNum).padStart(2, '0')}</span>
      <div style={{ width: 50, height: 50, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', marginBottom: 15, background: ICON_COLORS[stepNum], color: '#fff' }}>
        <i className={iconClass} />
      </div>
      <StatusBadge status={status} />
      <h5 style={{ color: '#FFFFFF', fontWeight: 600, marginBottom: 8 }}>{title}</h5>
      <p style={{ color: '#94A3B8', fontSize: '.88rem', marginBottom: 15, flexGrow: 1 }}>{desc}</p>
      {metric && <div style={{ color: '#CBD5E1', fontSize: '.82rem', marginBottom: 15, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}><i className="fas fa-info-circle" style={{ marginRight: 6 }} />{metric}</div>}
      {children}
    </div>
  )
}

function OutlineBtn({ href, disabled, children }: { href?: string; disabled?: boolean; children: React.ReactNode }) {
  // external links (http/https) keep plain anchor; internal links use React Router Link
  const style: React.CSSProperties = { borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: '.85rem', transition: 'all 0.2s ease', border: '1px solid rgba(148,163,184,0.3)', color: disabled ? '#475569' : '#94A3B8', background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' as React.CSSProperties['pointerEvents'] }
  if (!href) return <button type="button" disabled={disabled} style={style}>{children}</button>
  return <Link to={href} style={style}>{children}</Link>
}

export default function BoomiOnboardingPage() {
  const [boomiDot, setBoomiDot] = useState<DotState>('idle')
  const [solaceDot, setSolaceDot] = useState<DotState>('idle')
  const [boomiMsg, setBoomiMsg] = useState('Not tested')
  const [solaceMsg, setSolaceMsg] = useState('Not tested')

  const { data, refetch } = useQuery<OnboardingStatus>({
    queryKey: ['boomi-onboarding-status'],
    queryFn: () => apiClient.get('/Admin/GetOnboardingStatus').then(r => r.data),
    refetchInterval: false,
  })

  const testMutation = useMutation({
    mutationFn: () => apiClient.post<ConnectionTestResult>('/Admin/TestBoomiConnections').then(r => r.data),
    onMutate: () => { setBoomiDot('testing'); setSolaceDot('testing'); setBoomiMsg('Testing…'); setSolaceMsg('Testing…') },
    onSuccess: result => {
      if (!result.success) { setBoomiDot('red'); setSolaceDot('red'); setBoomiMsg('Test failed'); setSolaceMsg('Test failed'); return }
      setBoomiDot(result.boomi.success ? 'green' : 'red'); setBoomiMsg(result.boomi.message)
      setSolaceDot(result.solace.success ? 'green' : 'red'); setSolaceMsg(result.solace.message)
      if (result.allGreen) refetch()
    },
    onError: () => { setBoomiDot('red'); setSolaceDot('red'); setBoomiMsg('Request failed'); setSolaceMsg('Request failed') },
  })

  const steps = data?.steps
  const connectStatus  = steps?.connect?.status      ?? 'pending'
  const envsStatus     = steps?.environments?.status ?? 'pending'
  const discoverStatus = steps?.discover?.status     ?? 'pending'
  const mapStatus      = steps?.map?.status          ?? 'pending'
  const monitorStatus  = steps?.monitor?.status      ?? 'pending'

  const stepperItems = [
    { num: 1, label: 'Connect', status: connectStatus },
    { num: 2, label: 'Atoms', status: envsStatus },
    { num: 3, label: 'Discover', status: discoverStatus },
    { num: 4, label: 'Map', status: mapStatus },
    { num: 5, label: 'Monitor', status: monitorStatus },
  ]

  return (
    <div style={{ background: 'linear-gradient(180deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)', minHeight: '100vh', padding: 20 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      <div className="container-fluid">
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <h2 style={{ color: '#FFFFFF', fontWeight: 700, marginBottom: 5 }}>🚀 Boomi Customer Onboarding</h2>
          <p style={{ color: '#94A3B8', fontSize: '1.05rem' }}>Guided workflow to connect, discover, map, and monitor your Boomi integrations</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0, marginBottom: 35, flexWrap: 'wrap' }}>
          {stepperItems.map((step, i) => (
            <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StepCircle num={step.num} status={step.status as StepStatus} />
                <span style={{ color: '#94A3B8', fontSize: '.8rem', fontWeight: 500 }}>{step.label}</span>
              </div>
              {i < stepperItems.length - 1 && <div style={{ width: 40, height: 2, margin: '0 6px', background: step.status === 'complete' ? '#10B981' : '#475569', transition: 'background 0.3s ease' }} />}
            </div>
          ))}
        </div>
        <div className="row g-4">
          <div className="col-lg-4 col-md-6">
            <StepCard stepNum={1} iconClass="fas fa-plug" title="Connect" status={connectStatus as StepStatus}
              desc="Configure Boomi API credentials and Solace message broker connection.">
              <div style={{ background: '#0F172A', borderRadius: 10, padding: 20, marginTop: 10 }}>
                {[{ label: 'Boomi API', dot: boomiDot, msg: boomiMsg, icon: 'fas fa-cloud' }, { label: 'Solace Broker', dot: solaceDot, msg: solaceMsg, icon: 'fas fa-exchange-alt' }].map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                    <span style={{ color: '#CBD5E1', fontWeight: 500 }}><i className={c.icon} style={{ marginRight: 8 }} />{c.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: '#94A3B8', fontSize: '.82rem' }}>{c.msg}</span><ConnectionDot state={c.dot} /></div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}
                  style={{ borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: '.85rem', background: 'linear-gradient(135deg,#3B82F6,#2563EB)', color: '#fff', border: 'none', cursor: testMutation.isPending ? 'not-allowed' : 'pointer' }}>
                  <i className="fas fa-vial" style={{ marginRight: 4 }} />{testMutation.isPending ? 'Testing…' : 'Test Connections'}
                </button>
                <OutlineBtn href="/orchestration/boomi/collector"><i className="fas fa-cog" style={{ marginRight: 4 }} />Configure</OutlineBtn>
              </div>
            </StepCard>
          </div>
          <div className="col-lg-4 col-md-6">
            <StepCard stepNum={2} iconClass="fas fa-server" title="Select Atoms" status={envsStatus as StepStatus}
              desc="Choose which Boomi environments to monitor (e.g., Production only, or all)."
              metric={steps?.environments?.metric ?? 'No environments synced yet'}>
              <OutlineBtn href="/orchestration/boomi/environments" disabled={!steps?.connect?.complete}><i className="fas fa-arrow-right" style={{ marginRight: 4 }} />Manage Atoms</OutlineBtn>
            </StepCard>
          </div>
          <div className="col-lg-4 col-md-6">
            <StepCard stepNum={3} iconClass="fas fa-search" title="Discover Integrations" status={discoverStatus as StepStatus}
              desc="Import deployed processes from Boomi API into the integration catalogue."
              metric={steps?.discover?.metric ?? 'No integrations discovered yet'}>
              <OutlineBtn href="/orchestration/boomi/discovery" disabled={!steps?.environments?.complete}><i className="fas fa-arrow-right" style={{ marginRight: 4 }} />Discover Processes</OutlineBtn>
            </StepCard>
          </div>
          <div className="col-lg-4 col-md-6">
            <StepCard stepNum={4} iconClass="fas fa-sitemap" title="Map Business Context" status={mapStatus as StepStatus}
              desc="Assign business segments, processes, systems, and other context to each integration."
              metric={steps?.map?.metric ?? 'No mappings configured yet'}>
              <OutlineBtn href="/orchestration/boomi/mappings"><i className="fas fa-arrow-right" style={{ marginRight: 4 }} />Configure Mappings</OutlineBtn>
            </StepCard>
          </div>
          <div className="col-lg-4 col-md-6">
            <StepCard stepNum={5} iconClass="fas fa-heartbeat" title="Monitor Health" status={monitorStatus as StepStatus}
              desc="Track mapping completeness, ingestion errors, and pipeline health. Fix issues iteratively."
              metric={steps?.monitor?.metric ?? 'Waiting for data'}>
              <OutlineBtn href="/orchestration/boomi/monitor"><i className="fas fa-arrow-right" style={{ marginRight: 4 }} />View Dashboard</OutlineBtn>
            </StepCard>
          </div>
        </div>
      </div>
    </div>
  )
}
