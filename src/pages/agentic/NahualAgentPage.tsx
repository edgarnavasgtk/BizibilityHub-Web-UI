import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'
import {
  Chart,
  Series,
  CommonSeriesSettings,
  Legend,
  Tooltip,
} from 'devextreme-react/chart'
import {
  PieChart,
  Series as PieSeries,
  Legend as PieLegend,
  Tooltip as PieTooltip,
} from 'devextreme-react/pie-chart'

const AGENT_KEY = 'nahual'
const AGENT_NAME = 'Nahual'
const AGENT_DESC_FALLBACK = 'AI Business Analyst'

// ── Interfaces ────────────────────────────────────────────────────────────────

interface AgentInfo {
  agentKey: string
  agentName: string
  avatarUrl: string
  description: string
}

interface Thread {
  threadId: string
  title: string
  isSaved: boolean
  createdAt: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  images?: string[]
  timestamp?: string
}

interface AgentResponse {
  content: string
  threadId: string
}

interface AttachedImage {
  file: File
  dataUrl: string
}

interface SlashTemplate {
  label: string
  text: string
}

// Minimal interface for the Web Speech API SpeechRecognition object,
// which is not in all TypeScript DOM lib builds.
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: ((event: Event) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
}

// ── Chart spec parsing ────────────────────────────────────────────────────────

type DxSeriesType =
  | 'bar'
  | 'line'
  | 'area'
  | 'scatter'
  | 'spline'
  | 'splinearea'
  | 'stackedbar'
  | 'stackedline'

function normalizeDxSeriesType(raw: string | undefined): DxSeriesType {
  const map: Record<string, DxSeriesType> = {
    bar: 'bar',
    column: 'bar',
    line: 'line',
    area: 'area',
    scatter: 'scatter',
    point: 'scatter',
    spline: 'spline',
    splinearea: 'splinearea',
    stackedbar: 'stackedbar',
    stackedcolumn: 'stackedbar',
    stackedline: 'stackedline',
  }
  return map[(raw ?? '').toLowerCase()] ?? 'bar'
}

interface ParsedChart {
  dataSource: Record<string, unknown>[]
  series: Array<{
    argumentField: string
    valueField: string
    type: DxSeriesType
    name?: string
  }>
  isPie: boolean
}

function parseChartSpec(spec: string): ParsedChart | null {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(spec) as Record<string, unknown>
  } catch {
    return null
  }

  // ── Chart.js format: { type, data: { labels, datasets } }
  if (typeof parsed.type === 'string' && parsed.data !== null && typeof parsed.data === 'object') {
    const d = parsed.data as {
      labels?: string[]
      datasets?: Array<{ label?: string; data?: number[] }>
    }
    const labels = d.labels ?? []
    const datasets = d.datasets ?? []
    const rawType = parsed.type as string
    const isPie = rawType === 'pie' || rawType === 'doughnut'
    const seriesType = normalizeDxSeriesType(isPie ? 'bar' : rawType)

    const dataSource = labels.map((label, i) => {
      const row: Record<string, unknown> = { _arg: label }
      datasets.forEach((ds, di) => {
        row[ds.label ?? `_v${di}`] = ds.data?.[i] ?? 0
      })
      return row
    })
    const series = datasets.map((ds, di) => ({
      argumentField: '_arg',
      valueField: ds.label ?? `_v${di}`,
      type: seriesType,
      name: ds.label ?? `Series ${di + 1}`,
    }))
    return { dataSource, series, isPie }
  }

  // ── DevExtreme native format: { dataSource, series }
  if (Array.isArray(parsed.dataSource) && Array.isArray(parsed.series)) {
    const dx = parsed as {
      dataSource: Record<string, unknown>[]
      series: Array<{ valueField?: string; argumentField?: string; type?: string; name?: string }>
    }
    const firstKey = Object.keys(dx.dataSource[0] ?? {})[0] ?? '_arg'
    const isPie = dx.series.some(s => s.type === 'pie' || s.type === 'doughnut')
    return {
      dataSource: dx.dataSource,
      series: dx.series.map(s => ({
        argumentField: s.argumentField ?? firstKey,
        valueField: s.valueField ?? 'value',
        type: normalizeDxSeriesType(isPie ? 'bar' : s.type),
        name: s.name,
      })),
      isPie,
    }
  }

  // ── Vega-lite format: { $schema, mark, data: { values }, encoding }
  if (parsed.$schema !== undefined || typeof parsed.mark !== 'undefined') {
    const vl = parsed as {
      $schema?: string
      mark?: string | { type?: string }
      data?: { values?: Record<string, unknown>[] }
      encoding?: {
        x?: { field?: string }
        y?: { field?: string }
        theta?: { field?: string }
        color?: { field?: string }
      }
    }
    const markType = typeof vl.mark === 'string' ? vl.mark : (vl.mark?.type ?? 'bar')
    const isPie = markType === 'arc'
    const dataSource = vl.data?.values ?? []
    const xField = vl.encoding?.x?.field ?? (isPie ? vl.encoding?.color?.field ?? '_arg' : '_arg')
    const yField = vl.encoding?.y?.field ?? (isPie ? vl.encoding?.theta?.field ?? 'value' : 'value')
    return {
      dataSource,
      series: [{
        argumentField: xField,
        valueField: yField,
        type: normalizeDxSeriesType(isPie ? 'bar' : markType),
        name: yField,
      }],
      isPie,
    }
  }

  // ── Plotly format: { data: [ { type, x, y, name } ], layout }
  if (Array.isArray(parsed.data)) {
    const traces = parsed.data as Array<{
      type?: string
      x?: string[]
      y?: number[]
      name?: string
      labels?: string[]
      values?: number[]
    }>
    if (traces.length === 0) return null
    const isPie = traces.some(t => t.type === 'pie')

    if (isPie) {
      const t = traces[0]
      const dataSource = (t.labels ?? []).map((label, i) => ({
        _arg: label,
        _val: t.values?.[i] ?? 0,
      }))
      return {
        dataSource,
        series: [{ argumentField: '_arg', valueField: '_val', type: 'bar', name: t.name ?? 'Series' }],
        isPie: true,
      }
    }

    const labels = traces[0]?.x ?? []
    const dataSource = labels.map((label, i) => {
      const row: Record<string, unknown> = { _arg: label }
      traces.forEach(t => {
        row[t.name ?? `_v${traces.indexOf(t)}`] = t.y?.[i] ?? 0
      })
      return row
    })
    return {
      dataSource,
      series: traces.map((t, ti) => ({
        argumentField: '_arg',
        valueField: t.name ?? `_v${ti}`,
        type: normalizeDxSeriesType(t.type),
        name: t.name ?? `Series ${ti + 1}`,
      })),
      isPie: false,
    }
  }

  return null
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Renders the agent avatar: real image when an URL is available, gradient
 * circle with the agent's initial as fallback.
 */
function AgentAvatar({
  size,
  avatarUrl,
  agentName,
}: {
  size: number
  avatarUrl?: string
  agentName?: string
}) {
  const letter = (agentName ?? AGENT_NAME)[0]?.toUpperCase() ?? 'N'
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={agentName ?? AGENT_NAME}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg,#2E86C1,#F97316)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        color: '#fff',
        flexShrink: 0,
        fontWeight: 700,
      }}
    >
      {letter}
    </div>
  )
}

/**
 * Parses an agent chart spec string and renders it with DevExtreme.
 * Falls back to a formatted code block when the spec cannot be parsed.
 */
function FullscreenChart({ spec }: { spec: string }) {
  const chart = parseChartSpec(spec)

  if (!chart) {
    return (
      <pre
        style={{
          background: 'rgba(15,23,42,.85)',
          border: '1px solid rgba(46,134,193,.2)',
          borderRadius: 10,
          padding: 20,
          color: '#a5f3fc',
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          margin: 0,
        }}
      >
        <code>{spec}</code>
      </pre>
    )
  }

  if (chart.isPie) {
    return (
      <PieChart
        dataSource={chart.dataSource}
        palette="Ocean"
        height={400}
      >
        {chart.series.map((s, i) => (
          <PieSeries
            key={i}
            argumentField={s.argumentField}
            valueField={s.valueField}
          />
        ))}
        <PieLegend visible={true} />
        <PieTooltip enabled={true} />
      </PieChart>
    )
  }

  const firstSeries = chart.series[0]

  return (
    <Chart
      dataSource={chart.dataSource}
      palette="Ocean"
      height={420}
    >
      <CommonSeriesSettings
        argumentField={firstSeries?.argumentField ?? '_arg'}
        type={firstSeries?.type ?? 'bar'}
      />
      {chart.series.map((s, i) => (
        <Series
          key={i}
          valueField={s.valueField}
          name={s.name ?? s.valueField}
        />
      ))}
      <Legend visible={true} />
      <Tooltip enabled={true} shared={true} />
    </Chart>
  )
}

// ── Templates ─────────────────────────────────────────────────────────────────

const SLASH_TEMPLATES: SlashTemplate[] = [
  { label: 'Revenue summary', text: 'Give me a revenue summary for the last 30 days.' },
  { label: 'Error report', text: 'Show me the top integration errors from the past week.' },
  { label: 'Order trends', text: 'What are the order trends for the past quarter?' },
  { label: 'Anomaly detection', text: 'Are there any anomalies in my data this week?' },
  { label: 'Channel breakdown', text: 'Break down sales performance by channel.' },
]

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownText({
  text,
  onExpandChart,
}: {
  text: string
  onExpandChart?: (code: string) => void
}) {
  const renderInline = (t: string, key: number) => {
    const html = t
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br />')
    return <span key={key} dangerouslySetInnerHTML={{ __html: html }} />
  }

  const codeBlockRe = /```([\w]*)\n?([\s\S]*?)```/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let k = 0

  while ((match = codeBlockRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(renderInline(text.slice(lastIndex, match.index), k++))
    }
    const lang = match[1]
    const code = match[2]
    const isChart = /^(chart|json|vega|plotly)/i.test(lang)
    parts.push(
      <div key={k++} style={{ position: 'relative', margin: '8px 0' }}>
        <pre
          style={{
            background: 'rgba(0,0,0,.4)',
            borderRadius: 8,
            padding: '10px 12px',
            overflowX: 'auto',
            fontSize: 12,
            color: '#a5f3fc',
            margin: 0,
          }}
        >
          <code>{code.trim()}</code>
        </pre>
        {isChart && onExpandChart && (
          <button
            onClick={() => onExpandChart(code.trim())}
            title="Expand chart"
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              background: 'rgba(46,134,193,.3)',
              border: '1px solid rgba(46,134,193,.5)',
              borderRadius: 4,
              color: '#93c5fd',
              cursor: 'pointer',
              fontSize: 10,
              padding: '2px 6px',
            }}
          >
            ⛶ Expand
          </button>
        )}
      </div>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(renderInline(text.slice(lastIndex), k++))
  }

  return <>{parts}</>
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NahualAgentPage() {
  const queryClient = useQueryClient()
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [isListening, setIsListening] = useState(false)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [fullscreenChart, setFullscreenChart] = useState<string | null>(null)
  const [savedToast, setSavedToast] = useState(false)

  const transcriptRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  // ── FIX 1 & 2: Agent metadata (avatar URL, name, description) ───────────────
  const { data: agentInfo } = useQuery<AgentInfo>({
    queryKey: ['nahual', 'info'],
    queryFn: () =>
      apiClient.get<AgentInfo>(`/api/agentic/${AGENT_KEY}/info`).then(r => r.data),
    staleTime: Infinity,
  })

  const agentName = agentInfo?.agentName ?? AGENT_NAME
  const agentDesc = agentInfo?.description ?? AGENT_DESC_FALLBACK
  const avatarUrl = agentInfo?.avatarUrl

  // ── Saved conversations + seed suggestions ────────────────────────────────────
  const { data: suggestions = [] } = useQuery<string[]>({
    queryKey: ['nahual', 'suggestions'],
    queryFn: () =>
      apiClient.get<string[]>(`/api/agentic/${AGENT_KEY}/seed-suggestions`).then(r => r.data),
    staleTime: Infinity,
  })

  const { data: threads = [] } = useQuery<Thread[]>({
    queryKey: ['nahual', 'threads'],
    queryFn: () =>
      apiClient.get<Thread[]>(`/api/agentic/${AGENT_KEY}/threads`).then(r => r.data),
    staleTime: 30_000,
  })

  // ── FIX 5: Current conversation title ────────────────────────────────────────
  const currentThread = threads.find(t => t.threadId === currentThreadId)
  const conversationTitle = currentThread?.title ?? 'New conversation'

  // ── Save thread ────────────────────────────────────────────────────────────────
  const saveThreadMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const res = await apiClient.post<{ ok: boolean }>(
        `/api/agentic/${AGENT_KEY}/threads/${threadId}/save`,
        {}
      )
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nahual', 'threads'] })
      setSavedToast(true)
      setTimeout(() => setSavedToast(false), 2500)
    },
  })

  // ── Image attachment ──────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        if (ev.target?.result) {
          setAttachedImages(prev => [
            ...prev,
            { file, dataUrl: ev.target!.result as string },
          ])
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }, [])

  const handleRemoveImage = useCallback((index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index))
  }, [])

  // ── Voice input ───────────────────────────────────────────────────────────────
  const handleToggleMic = useCallback(() => {
    const SRCtor =
      'SpeechRecognition' in window
        ? (window as unknown as { SpeechRecognition: new () => SpeechRecognitionLike })
            .SpeechRecognition
        : 'webkitSpeechRecognition' in window
          ? (
              window as unknown as {
                webkitSpeechRecognition: new () => SpeechRecognitionLike
              }
            ).webkitSpeechRecognition
          : null

    if (!SRCtor) {
      alert('Speech recognition is not supported in this browser.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      return
    }

    const recognition = new SRCtor()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      setInput(prev => (prev ? `${prev} ${transcript}` : transcript))
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening])

  // ── Slash command menu ────────────────────────────────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    setSlashMenuOpen(value.startsWith('/') && !value.includes(' '))
  }, [])

  const handleSlashSelect = useCallback((template: SlashTemplate) => {
    setInput(template.text)
    setSlashMenuOpen(false)
    textareaRef.current?.focus()
  }, [])

  // ── Fullscreen chart ──────────────────────────────────────────────────────────
  const handleExpandChart = useCallback((code: string) => {
    setFullscreenChart(code)
  }, [])

  // ── FIX 4: Streaming send via fetch + ReadableStream ─────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    setInput('')
    setSlashMenuOpen(false)
    const images = attachedImages.map(img => img.dataUrl)
    setAttachedImages([])

    // Optimistically add user message
    setMessages(prev => [...prev, { role: 'user', content: text, images }])
    setIsStreaming(true)
    setStreamingText('')

    let accumulated = ''
    let newThreadId: string | null = null

    try {
      const response = await fetch(`/api/agentic/${AGENT_KEY}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'text/event-stream, application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: text,
          threadId: currentThreadId ?? undefined,
          ...(images.length > 0 ? { images } : {}),
        }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const contentType = response.headers.get('content-type') ?? ''

      if (contentType.includes('text/event-stream') && response.body) {
        // SSE / chunked streaming path
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // Process complete SSE lines; keep the last incomplete line in buffer
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6).trim()
            if (payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload) as Record<string, unknown>
              if (typeof parsed.delta === 'string') {
                accumulated += parsed.delta
                setStreamingText(accumulated)
              } else if (typeof parsed.content === 'string') {
                accumulated = parsed.content
                setStreamingText(accumulated)
              }
              if (typeof parsed.threadId === 'string') {
                newThreadId = parsed.threadId
              }
            } catch {
              // Ignore partial / non-JSON lines
            }
          }
        }
      } else {
        // Non-streaming fallback: read the full JSON body at once
        const data = (await response.json()) as AgentResponse
        accumulated = data.content
        newThreadId = data.threadId
      }

      if (newThreadId) setCurrentThreadId(newThreadId)
      setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
      queryClient.invalidateQueries({ queryKey: ['nahual', 'threads'] })
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ])
    } finally {
      setIsStreaming(false)
      setStreamingText('')
    }
  }, [input, isStreaming, currentThreadId, attachedImages, queryClient])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        setSlashMenuOpen(false)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && !slashMenuOpen) {
        e.preventDefault()
        void handleSend()
      }
    },
    [handleSend, slashMenuOpen]
  )

  const handleNewThread = useCallback(() => {
    setCurrentThreadId(null)
    setMessages([])
    setStreamingText('')
    setAttachedImages([])
  }, [])

  const handleSelectThread = useCallback(async (thread: Thread) => {
    setCurrentThreadId(thread.threadId)
    const res = await apiClient.get<Message[]>(
      `/api/agentic/${AGENT_KEY}/threads/${thread.threadId}/messages`
    )
    setMessages(res.data)
  }, [])

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [messages, streamingText])

  const isEmpty = messages.length === 0 && !isStreaming

  const railStyle: React.CSSProperties = {
    width: 280,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    flexShrink: 0,
    overflow: 'hidden',
  }

  const mainStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(15,23,42,.95)',
    borderRadius: 12,
    border: '1px solid rgba(46,134,193,.2)',
    overflow: 'hidden',
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 20, height: 'calc(100vh - 140px)', padding: '0 2rem 2rem' }}>

        {/* Rail / sidebar */}
        <aside style={railStyle}>
          <div
            style={{
              background: 'rgba(15,23,42,.9)',
              border: '1px solid rgba(46,134,193,.2)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            {/* FIX 1 & 2: Use real avatar image + dynamic description */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <AgentAvatar size={48} avatarUrl={avatarUrl} agentName={agentName} />
              <div>
                <div className="text-white fw-bold">{agentName}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {agentDesc}
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary btn-sm w-100 mb-3"
              onClick={handleNewThread}
              style={{ fontSize: 13 }}
            >
              <span style={{ marginRight: '0.4rem' }}>＋</span> New conversation
            </button>

            <div
              className="text-muted mb-2"
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              Saved conversations
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {threads.length === 0 && (
                <div className="text-muted" style={{ fontSize: 12, padding: '4px 2px' }}>
                  No saved conversations yet
                </div>
              )}
              {threads.map(t => (
                <button
                  key={t.threadId}
                  onClick={() => handleSelectThread(t)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background:
                      currentThreadId === t.threadId ? 'rgba(46,134,193,.15)' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 10px',
                    color: currentThreadId === t.threadId ? '#e2e8f0' : '#94a3b8',
                    fontSize: 13,
                    cursor: 'pointer',
                    marginBottom: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <i className="fas fa-comment-alt me-2" style={{ opacity: 0.6 }} />
                  {t.title || 'Untitled'}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main chat area */}
        <main style={mainStyle}>
          {/* FIX 5: Transcript header — shows conversation title + save button */}
          {messages.length > 0 && currentThreadId && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 20px',
                borderBottom: '1px solid rgba(46,134,193,.1)',
                flexShrink: 0,
                gap: 8,
              }}
            >
              {/* Conversation title */}
              <span
                style={{
                  color: '#e2e8f0',
                  fontSize: 14,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '60%',
                }}
              >
                {conversationTitle}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {savedToast && (
                  <span style={{ fontSize: 12, color: '#4ade80' }}>Conversation saved!</span>
                )}
                <button
                  onClick={() => saveThreadMutation.mutate(currentThreadId)}
                  disabled={saveThreadMutation.isPending}
                  style={{
                    background: 'rgba(46,134,193,.1)',
                    border: '1px solid rgba(46,134,193,.3)',
                    borderRadius: 6,
                    color: '#93c5fd',
                    padding: '4px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    opacity: saveThreadMutation.isPending ? 0.6 : 1,
                  }}
                >
                  <i className="fas fa-bookmark" style={{ fontSize: 11 }} />
                  Save conversation
                </button>
              </div>
            </div>
          )}

          {/* Transcript */}
          <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {isEmpty ? (
              /* Empty state */
              <div style={{ textAlign: 'center', paddingTop: '10%' }}>
                {/* FIX 1: Real avatar in empty state */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <AgentAvatar size={72} avatarUrl={avatarUrl} agentName={agentName} />
                </div>
                <h2 className="text-white mb-2" style={{ fontSize: 22 }}>
                  Hi — I'm {agentName}.
                </h2>
                <p
                  className="text-muted mb-4"
                  style={{ fontSize: 14, maxWidth: 400, margin: '0 auto 24px' }}
                >
                  Ask me anything about your business data. I'll pull live numbers, surface
                  anomalies, and suggest follow-ups.
                </p>
                {suggestions.length > 0 && (
                  <>
                    <div
                      className="text-muted mb-3"
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontWeight: 600,
                      }}
                    >
                      Try asking
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        justifyContent: 'center',
                      }}
                    >
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setInput(s)
                            textareaRef.current?.focus()
                          }}
                          style={{
                            background: 'rgba(46,134,193,.1)',
                            border: '1px solid rgba(46,134,193,.3)',
                            borderRadius: 20,
                            color: '#93c5fd',
                            padding: '6px 14px',
                            fontSize: 13,
                            cursor: 'pointer',
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 12,
                      marginBottom: 16,
                      flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                    }}
                  >
                    {/* FIX 1: Real avatar in message list */}
                    {m.role === 'assistant' ? (
                      <AgentAvatar size={36} avatarUrl={avatarUrl} agentName={agentName} />
                    ) : (
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: '#2E86C1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        U
                      </div>
                    )}
                    <div
                      style={{
                        maxWidth: '75%',
                        background:
                          m.role === 'user' ? 'rgba(46,134,193,.15)' : 'rgba(30,41,59,.8)',
                        border: `1px solid rgba(46,134,193,${m.role === 'user' ? '.3' : '.15'})`,
                        borderRadius:
                          m.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                        padding: '10px 14px',
                        color: '#e2e8f0',
                        fontSize: 14,
                        lineHeight: 1.6,
                      }}
                    >
                      {/* Image thumbnails for user messages with attachments */}
                      {m.images && m.images.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            flexWrap: 'wrap',
                            marginBottom: 8,
                          }}
                        >
                          {m.images.map((src, idx) => (
                            <img
                              key={idx}
                              src={src}
                              alt="attachment"
                              style={{
                                width: 80,
                                height: 80,
                                objectFit: 'cover',
                                borderRadius: 6,
                                border: '1px solid rgba(46,134,193,.3)',
                              }}
                            />
                          ))}
                        </div>
                      )}
                      <MarkdownText text={m.content} onExpandChart={handleExpandChart} />
                    </div>
                  </div>
                ))}

                {/* FIX 4: Show streamed text progressively instead of only the bounce dots */}
                {isStreaming && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    {/* FIX 1: Real avatar in streaming indicator */}
                    <AgentAvatar size={36} avatarUrl={avatarUrl} agentName={agentName} />
                    <div
                      style={{
                        background: 'rgba(30,41,59,.8)',
                        border: '1px solid rgba(46,134,193,.15)',
                        borderRadius: '4px 16px 16px 16px',
                        padding: '10px 14px',
                        color: '#e2e8f0',
                        fontSize: 14,
                        maxWidth: '75%',
                        lineHeight: 1.6,
                      }}
                    >
                      {streamingText ? (
                        <MarkdownText text={streamingText} />
                      ) : (
                        <span style={{ display: 'flex', gap: 4 }}>
                          {[0, 1, 2].map(idx => (
                            <span
                              key={idx}
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#64748b',
                                display: 'inline-block',
                                animation: `bounce 1.2s ${idx * 0.2}s infinite`,
                              }}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Composer */}
          <div
            style={{
              padding: '12px 20px 16px',
              borderTop: '1px solid rgba(46,134,193,.15)',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {/* Hidden file input for image attachment */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            {/* Image thumbnail pills */}
            {attachedImages.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {attachedImages.map((img, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'rgba(46,134,193,.15)',
                      border: '1px solid rgba(46,134,193,.3)',
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={img.dataUrl}
                      alt={img.file.name}
                      style={{ width: 48, height: 48, objectFit: 'cover' }}
                    />
                    <button
                      onClick={() => handleRemoveImage(idx)}
                      title="Remove image"
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        background: 'rgba(0,0,0,.7)',
                        border: 'none',
                        borderRadius: '50%',
                        color: '#fff',
                        width: 16,
                        height: 16,
                        fontSize: 10,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Slash command floating menu */}
            {slashMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 20,
                  right: 20,
                  background: 'rgba(15,23,42,.95)',
                  border: '1px solid rgba(46,134,193,.3)',
                  borderRadius: 10,
                  padding: 6,
                  zIndex: 100,
                  boxShadow: '0 -4px 20px rgba(0,0,0,.4)',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '4px 8px 6px',
                  }}
                >
                  Templates
                </div>
                {SLASH_TEMPLATES.map((t, i) => (
                  <button
                    key={i}
                    onMouseDown={e => {
                      e.preventDefault()
                      handleSlashSelect(t)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      padding: '7px 10px',
                      color: '#e2e8f0',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background =
                        'rgba(46,134,193,.15)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    <span style={{ color: '#2E86C1', marginRight: 6 }}>/</span>
                    <strong>{t.label}</strong>
                    <span style={{ color: '#64748b', marginLeft: 8, fontSize: 12 }}>{t.text}</span>
                  </button>
                ))}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: 8,
                background: 'rgba(30,41,59,.8)',
                border: '1px solid rgba(46,134,193,.3)',
                borderRadius: 12,
                padding: '8px 12px',
                alignItems: 'flex-end',
              }}
            >
              {/* Attach image button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Attach image"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: 6,
                  fontSize: 16,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color .2s',
                }}
                onMouseEnter={e =>
                  ((e.currentTarget as HTMLButtonElement).style.color = '#93c5fd')
                }
                onMouseLeave={e =>
                  ((e.currentTarget as HTMLButtonElement).style.color = '#64748b')
                }
              >
                <i className="fas fa-paperclip" />
              </button>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="Ask about orders, errors, integration health…  Type / for templates"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#e2e8f0',
                  fontSize: 14,
                  resize: 'none',
                  lineHeight: 1.5,
                  fontFamily: 'inherit',
                }}
              />

              {/* Mic button */}
              <button
                onClick={handleToggleMic}
                title={isListening ? 'Stop listening' : 'Voice input'}
                style={{
                  background: isListening ? 'rgba(239,68,68,.2)' : 'transparent',
                  border: isListening ? '1px solid rgba(239,68,68,.4)' : 'none',
                  color: isListening ? '#f87171' : '#64748b',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: 6,
                  fontSize: 15,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color .2s, background .2s',
                  animation: isListening ? 'micPulse 1.2s infinite' : 'none',
                }}
              >
                <i className={isListening ? 'fas fa-microphone-slash' : 'fas fa-microphone'} />
              </button>

              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isStreaming}
                style={{
                  background: 'linear-gradient(135deg,#2E86C1,#1a6aa8)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  opacity: !input.trim() || isStreaming ? 0.5 : 1,
                  transition: 'opacity .2s',
                  flexShrink: 0,
                }}
              >
                {isStreaming ? <span className="spinner-border spinner-border-sm" /> : 'Send'}
              </button>
            </div>

            <div
              style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'center' }}
            >
              <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
            </div>
          </div>
        </main>

        <style>{`
          @keyframes bounce {
            0%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-4px); }
          }
          @keyframes micPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
          }
        `}</style>
      </div>

      {/* FIX 3: Fullscreen chart overlay renders a real DevExtreme chart */}
      {fullscreenChart !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1050,
            background: 'rgba(0,0,0,.85)',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={() => setFullscreenChart(null)}
        >
          {/* Title bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              background: 'rgba(15,23,42,.95)',
              borderBottom: '1px solid rgba(46,134,193,.2)',
              flexShrink: 0,
            }}
            onClick={e => e.stopPropagation()}
          >
            <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 15 }}>
              <i className="fas fa-chart-bar me-2" style={{ color: '#2E86C1' }} />
              Chart
            </span>
            <button
              onClick={() => setFullscreenChart(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: 20,
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Chart content rendered via FullscreenChart */}
          <div
            style={{ flex: 1, overflow: 'auto', padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <FullscreenChart spec={fullscreenChart} />
          </div>
        </div>
      )}
    </>
  )
}
