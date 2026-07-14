import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

interface ShareMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
}

interface ShareConversation {
  agentName: string
  agentAvatar: string
  expiresUtc: string
  messages: ShareMessage[]
}

export default function AgenticSharePage() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, isError } = useQuery<ShareConversation>({
    queryKey: ['share', token],
    queryFn: () => apiClient.get<ShareConversation>(`/AgenticShare/GetConversation?token=${token}`).then(r => r.data),
    retry: false,
  })

  if (isLoading) {
    return (
      <div style={styles.page}>
        <div style={{ textAlign: 'center', padding: '3rem', color: '#aed6f1' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 32, marginBottom: 16 }} />
          <p>Loading shared conversation…</p>
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div style={styles.page}>
        <div style={{ textAlign: 'center', padding: '3rem', color: '#e74c3c' }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: 48, marginBottom: 16 }} />
          <h3 style={{ color: '#fff' }}>Link not found or expired</h3>
          <p style={{ color: '#aed6f1' }}>This shared conversation link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  const expires = new Date(data.expiresUtc).toUTCString()

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        {data.agentAvatar
          ? <img src={data.agentAvatar} alt={data.agentName} style={styles.avatar} />
          : <div style={styles.avatarFallback}><i className="fas fa-robot" /></div>
        }
        <div>
          <h1 style={styles.headerTitle}>{data.agentName} — shared conversation</h1>
          <div style={styles.headerMeta}>Read-only · link expires {expires}</div>
        </div>
      </header>

      <main style={styles.container}>
        {data.messages.length === 0
          ? <p style={{ color: '#aed6f1' }}>No messages in this conversation yet.</p>
          : data.messages.map((m, i) => (
              <div key={i} style={m.role === 'user' ? styles.userRow : styles.agentRow}>
                {m.role === 'user' ? (
                  <>
                    <div style={styles.msgContent}>
                      <div style={styles.userBubble}>{m.content}</div>
                    </div>
                    <div style={styles.msgAvatarText}>You</div>
                  </>
                ) : (
                  <>
                    <div style={styles.msgAvatarImg}>
                      {data.agentAvatar
                        ? <img src={data.agentAvatar} alt={data.agentName} style={{ width: 32, height: 32, borderRadius: 8 }} />
                        : <i className="fas fa-robot" style={{ fontSize: 20, color: '#3b82f6' }} />
                      }
                    </div>
                    <div style={styles.msgContent}>
                      <div style={styles.msgMeta}>{data.agentName}</div>
                      <div style={styles.agentBubble}>{m.content}</div>
                    </div>
                  </>
                )}
              </div>
            ))
        }
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: '#0f172a',
    minHeight: '100vh',
    color: '#e2e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  header: {
    padding: '1rem 1.5rem',
    borderBottom: '1px solid rgba(46,134,193,.3)',
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    background: 'rgba(15,23,42,.9)',
  },
  avatar: { width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(46,134,193,.4)' },
  avatarFallback: {
    width: 40, height: 40, borderRadius: 10, background: 'rgba(46,134,193,.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: 20,
  },
  headerTitle: { fontFamily: 'inherit', fontSize: '1.1rem', margin: 0, color: '#fff', fontWeight: 600 },
  headerMeta: { color: '#aed6f1', fontSize: '0.8rem', marginTop: 2 },
  container: { maxWidth: 900, margin: '1.5rem auto', padding: '0 1rem' },
  userRow: { display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  agentRow: { display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  msgContent: { maxWidth: '70%' },
  userBubble: {
    background: 'rgba(46,134,193,.2)', border: '1px solid rgba(46,134,193,.3)',
    borderRadius: '12px 12px 2px 12px', padding: '10px 14px', fontSize: 14, lineHeight: 1.5,
  },
  agentBubble: {
    background: 'rgba(30,41,59,.8)', border: '1px solid rgba(46,134,193,.15)',
    borderRadius: '2px 12px 12px 12px', padding: '10px 14px', fontSize: 14, lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  msgAvatarText: {
    width: 36, height: 36, borderRadius: '50%', background: 'rgba(46,134,193,.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#aed6f1', flexShrink: 0,
  },
  msgAvatarImg: {
    width: 36, height: 36, borderRadius: 8, background: 'rgba(46,134,193,.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  msgMeta: { fontSize: 11, color: '#aed6f1', marginBottom: 4 },
}
