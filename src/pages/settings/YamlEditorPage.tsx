import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import apiClient from '../../services/apiClient'

interface BackupItem {
  fileName: string
  created: string
  size: number
}

interface BackupsResponse {
  success: boolean
  backups: BackupItem[]
}

interface SaveResponse {
  success: boolean
  message: string
  lastModified?: string
}

interface ValidateResponse {
  isValid: boolean
  errorMessage?: string
}

function formatBytes(b: number) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function YamlEditorPage() {
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [status, setStatus] = useState<'saved' | 'modified' | 'error'>('saved')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'danger' } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastModified, setLastModified] = useState<string>('')

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)

  // ── Initial content load ──────────────────────────────────────────────────
  const { data: initialData, isError: initialIsError, error: initialError } = useQuery<
    { content: string; lastModified: string }
  >({
    queryKey: ['yaml-editor', 'content'],
    queryFn: () =>
      apiClient.get<{ content: string; lastModified: string }>('/YamlEditor/GetContent').then(r => r.data),
  })

  const { data: backupsData, refetch: refetchBackups } = useQuery<BackupsResponse>({
    queryKey: ['yaml-editor', 'backups'],
    queryFn: () => apiClient.get<BackupsResponse>('/YamlEditor/GetBackups').then(r => r.data),
  })

  useEffect(() => {
    if (initialIsError) {
      const msg = initialError instanceof Error ? initialError.message : 'Unknown error'
      setLoadError('Could not load YAML configuration: ' + msg)
      return
    }
    if (initialData) {
      if (initialData.content == null) {
        setLoadError('The YAML configuration file could not be read from disk.')
        return
      }
      setLoadError(null)
      setContent(initialData.content)
      setOriginalContent(initialData.content)
      setLastModified(initialData.lastModified ?? '')
      // Push the value into Monaco if it has already mounted
      editorRef.current?.setValue(initialData.content)
    }
  }, [initialData, initialIsError, initialError])

  // ── beforeunload guard for unsaved changes ────────────────────────────────
  useEffect(() => {
    if (status !== 'modified') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'You have unsaved changes. Leave anyway?'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (yaml: string) =>
      apiClient.post<SaveResponse>('/YamlEditor/Save', { content: yaml }).then(r => r.data),
    onSuccess: (data) => {
      if (data.success) {
        setOriginalContent(content)
        setStatus('saved')
        setMessage({ text: data.message, type: 'success' })
        if (data.lastModified) setLastModified(data.lastModified)
        refetchBackups()
        setTimeout(() => setMessage(null), 5000)
      } else {
        setStatus('error')
        setMessage({ text: data.message, type: 'danger' })
      }
    },
    onError: (err: Error) => {
      setStatus('error')
      setMessage({ text: 'Failed to save: ' + err.message, type: 'danger' })
    },
  })

  const validateMutation = useMutation({
    mutationFn: (yaml: string) =>
      apiClient.post<ValidateResponse>('/YamlEditor/Validate', { content: yaml }).then(r => r.data),
    onSuccess: (data) => {
      if (data.isValid) {
        setMessage({ text: 'YAML syntax is valid!', type: 'success' })
        setTimeout(() => setMessage(null), 5000)
      } else {
        const errMsg = data.errorMessage ?? 'Unknown'
        setMessage({ text: 'Validation error: ' + errMsg, type: 'danger' })
        // Jump to the error line in Monaco
        if (editorRef.current && monacoRef.current) {
          const match = errMsg.match(/line\s+(\d+)/i)
          if (match) {
            const lineNumber = parseInt(match[1], 10)
            editorRef.current.revealLineInCenter(lineNumber)
            editorRef.current.setSelection(
              new monacoRef.current.Selection(lineNumber, 1, lineNumber, 1),
            )
            editorRef.current.focus()
          }
        }
      }
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (fileName: string) =>
      apiClient
        .post<SaveResponse & { content?: string }>('/YamlEditor/RestoreBackup', { fileName })
        .then(r => r.data),
    onSuccess: (data) => {
      if (data.success && data.content) {
        setContent(data.content)
        setOriginalContent(data.content)
        editorRef.current?.setValue(data.content)
        setStatus('saved')
        setMessage({ text: data.message, type: 'success' })
        refetchBackups()
        setTimeout(() => setMessage(null), 5000)
      } else {
        setMessage({ text: data.message, type: 'danger' })
      }
    },
  })

  // ── Monaco mount handler ──────────────────────────────────────────────────
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Push initial content if it arrived before mount
    if (content) editor.setValue(content)

    // Ctrl+S / Cmd+S  → save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveMutation.mutate(editor.getValue())
    })

    // Track modifications
    editor.onDidChangeModelContent(() => {
      const val = editor.getValue()
      setContent(val)
      setStatus(val !== originalContent ? 'modified' : 'saved')
    })
  }

  // ── Toolbar actions ───────────────────────────────────────────────────────
  const handleSave = () => saveMutation.mutate(content)
  const handleValidate = () => validateMutation.mutate(content)
  const handleFormat = () => {
    editorRef.current?.trigger('editor', 'editor.action.formatDocument', null)
  }
  const handleUndo = () => {
    editorRef.current?.trigger('editor', 'undo', null)
  }
  const handleRedo = () => {
    editorRef.current?.trigger('editor', 'redo', null)
  }

  const statusColors = { saved: '#2ecc71', modified: '#f39c12', error: '#e74c3c' }

  const card: React.CSSProperties = {
    background: 'rgba(15,23,42,.85)',
    border: '1px solid rgba(46,134,193,.2)',
    borderRadius: 8,
    marginBottom: 16,
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>
      <div className="mb-4">
        <h1 className="h3 text-white mb-1">
          <i className="fas fa-file-code me-2 text-primary" />AI Context Configuration Editor
        </h1>
        <p className="text-muted mb-0" style={{ fontSize: 14 }}>
          Edit the YAML configuration that controls AI query generation behavior.
          <span className="ms-3" style={{ fontSize: 12, color: '#808b96' }}>
            <kbd>Ctrl+S</kbd> Save &middot; <kbd>Ctrl+F</kbd> Find &middot; <kbd>F1</kbd> Command Palette
          </span>
        </p>
      </div>

      {/* Load-error banner */}
      {loadError && (
        <div className="alert alert-warning mb-3" style={{ fontSize: 13 }}>
          <i className="fas fa-exclamation-triangle me-2" />
          {loadError}
        </div>
      )}

      <div className="row g-3">
        <div className="col-lg-9">
          {/* Toolbar */}
          <div
            style={{
              background: 'rgba(30,41,59,.9)',
              border: '1px solid rgba(46,134,193,.3)',
              borderBottom: 'none',
              borderRadius: '8px 8px 0 0',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div className="d-flex gap-2">
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                <i className="fas fa-save me-1" />
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleValidate}
                disabled={validateMutation.isPending}
              >
                <i className="fas fa-check me-1" />Validate
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleFormat} title="Format document">
                <i className="fas fa-indent me-1" />Format
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleUndo} title="Undo">
                <i className="fas fa-undo" />
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleRedo} title="Redo">
                <i className="fas fa-redo" />
              </button>
            </div>
            <div className="d-flex align-items-center gap-2">
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: statusColors[status],
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: 12, color: '#aed6f1' }}>
                {status === 'saved' ? 'Saved' : status === 'modified' ? 'Modified' : 'Error'}
              </span>
              {lastModified && (
                <small className="text-muted" style={{ fontSize: 11 }}>
                  Last modified: {lastModified}
                </small>
              )}
            </div>
          </div>

          {/* Monaco Editor */}
          <div
            style={{
              border: '1px solid rgba(46,134,193,.3)',
              borderRadius: '0 0 8px 8px',
              overflow: 'hidden',
              height: 'calc(100vh - 340px)',
              minHeight: 500,
            }}
          >
            <Editor
              defaultLanguage="yaml"
              theme="vs-dark"
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: true },
                folding: true,
                wordWrap: 'on',
                quickSuggestions: false,
                automaticLayout: true,
                fontSize: 13,
                lineHeight: 21,
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                scrollBeyondLastLine: false,
                tabSize: 2,
                insertSpaces: true,
              }}
            />
          </div>

          {message && (
            <div className={`alert alert-${message.type} mt-2`} style={{ fontSize: 13 }}>
              {message.text}
            </div>
          )}
        </div>

        <div className="col-lg-3">
          {/* Quick Reference */}
          <div style={card}>
            <div
              style={{ padding: '12px 16px', borderBottom: '1px solid rgba(46,134,193,.2)' }}
            >
              <h6 className="text-white mb-0" style={{ fontSize: 13 }}>Quick Reference</h6>
            </div>
            <div style={{ padding: 16, fontSize: 12 }}>
              <div
                className="text-muted mb-2"
                style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 11 }}
              >
                Key Sections
              </div>
              <ul style={{ paddingLeft: 16, color: '#aed6f1', marginBottom: 12 }}>
                <li><code style={{ fontSize: 11, color: '#60a5fa' }}>core_rules</code> — SQL generation rules</li>
                <li><code style={{ fontSize: 11, color: '#60a5fa' }}>business_terms</code> — Term mappings</li>
                <li><code style={{ fontSize: 11, color: '#60a5fa' }}>simplification_rules</code> — Query patterns</li>
                <li><code style={{ fontSize: 11, color: '#60a5fa' }}>examples</code> — Query examples</li>
                <li><code style={{ fontSize: 11, color: '#60a5fa' }}>visualization_rules</code> — Chart rules</li>
              </ul>
              <div
                className="text-muted mb-2"
                style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 11 }}
              >
                Important Rules
              </div>
              <ul style={{ paddingLeft: 16, color: '#aed6f1', margin: 0 }}>
                <li>Use COUNT(DISTINCT) for orders/shipments</li>
                <li>Join BusinessSubprocess, not BusinessProcess</li>
                <li>Map source systems correctly (LOR, DPD, etc.)</li>
                <li>Keep indentation consistent</li>
              </ul>
            </div>
          </div>

          {/* Backups */}
          <div style={card}>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(46,134,193,.2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h6 className="text-white mb-0" style={{ fontSize: 13 }}>Backups</h6>
              <button
                className="btn btn-link btn-sm p-0"
                style={{ color: '#aed6f1' }}
                onClick={() => refetchBackups()}
              >
                <i className="fas fa-sync" />
              </button>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {!backupsData?.backups?.length ? (
                <div style={{ padding: 16, color: '#808b96', fontSize: 12, textAlign: 'center' }}>
                  No backups available
                </div>
              ) : (
                backupsData.backups.map(b => (
                  <div
                    key={b.fileName}
                    style={{
                      padding: '10px 16px',
                      borderBottom: '1px solid rgba(46,134,193,.1)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                    onClick={() => {
                      if (confirm('Restore this backup? Current changes will be lost.'))
                        restoreMutation.mutate(b.fileName)
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#aed6f1' }}>
                        {new Date(b.created).toLocaleString()}
                      </span>
                      <span style={{ color: '#808b96' }}>{formatBytes(b.size)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
