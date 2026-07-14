import { useState, useRef, useCallback } from 'react'

function getAgentUrl(): string {
  const host = window.location.hostname
  if (host === 'guatemaltek.bizibilityhub.com') {
    return 'https://agent.bizibilityhub.com/'
  }
  return 'http://localhost:8000/'
}

export default function AgentHubPage() {
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const agentUrl = getAgentUrl()

  const handleLoad = useCallback(() => {
    setStatus('connected')
  }, [])

  const handleError = useCallback(() => {
    setStatus('error')
  }, [])

  const handleRefresh = useCallback(() => {
    setStatus('loading')
    if (iframeRef.current) {
      iframeRef.current.src = agentUrl + '?t=' + String(Date.now())
    }
  }, [agentUrl])

  const containerStyle: React.CSSProperties = isFullscreen
    ? { position: 'fixed', inset: 0, zIndex: 9999, background: '#fff', display: 'flex', flexDirection: 'column', height: '100vh' }
    : { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', padding: '0 2rem 2rem' }

  return (
    <div style={containerStyle}>
      {/* Header bar */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#fff',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '3px solid rgba(255,255,255,.2)',
          borderRadius: isFullscreen ? 0 : '8px 8px 0 0',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 16 }}>
          <i className="fas fa-robot" />
          AI Agent Hub
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,.2)', padding: '4px 12px',
              borderRadius: 20, fontSize: 13,
            }}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: status === 'connected' ? '#4ade80' : status === 'error' ? '#f87171' : '#fbbf24',
                animation: 'pulse 2s infinite',
              }}
            />
            {status === 'connected' ? 'Connected' : status === 'error' ? 'Disconnected' : 'Connecting…'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleRefresh}
            style={{ background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            <i className="fas fa-sync-alt me-1" /> Refresh
          </button>
          <button
            onClick={() => setIsFullscreen(f => !f)}
            style={{ background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            <i className={`fas fa-${isFullscreen ? 'compress' : 'expand'} me-1`} />
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {/* iframe container */}
      <div style={{ flex: 1, position: 'relative', background: '#f8f9fa', borderRadius: isFullscreen ? 0 : '0 0 8px 8px', overflow: 'hidden' }}>
        {status === 'loading' && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: '#6c757d' }}>
            <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem', borderWidth: '0.3em' }} />
            <p className="mt-3 mb-0">Loading Solace Agent Mesh…</p>
          </div>
        )}

        {status === 'error' && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: '#6c757d' }}>
            <i className="fas fa-exclamation-triangle" style={{ fontSize: 48, color: '#ef4444', marginBottom: 12 }} />
            <p className="mb-1 fw-semibold">Unable to connect to Solace Agent Mesh</p>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>Make sure the agent is running at {agentUrl}</p>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={agentUrl}
          title="AI Agent Hub"
          onLoad={handleLoad}
          onError={handleError}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: status !== 'loading' ? 'block' : 'none',
          }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  )
}
