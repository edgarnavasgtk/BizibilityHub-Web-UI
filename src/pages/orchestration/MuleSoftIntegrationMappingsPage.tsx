import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import DataGrid, { Column, SearchPanel, FilterRow, Paging, Pager, Editing } from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'

// ── interfaces ──────────────────────────────────────────────────────────────

interface MuleSoftFlow {
  integrationFlowId: number
  integrationName: string
  sourcePlatform: string
  hasMappingConfigured: boolean
}

interface NewIntegrationForm {
  integrationName: string
  platform: string
  status: string
}

interface FieldPair {
  sourceField: string
  targetField: string
}

interface BusinessContext {
  segment: string
  brand: string
  process: string
  subprocess: string
  country: string
  direction: string
  sourceSystem: string
  targetSystem: string
  stage: string
  documentType: string
}

interface FieldMapperData {
  sourceFields: string[]
  targetFields: string[]
  mappings: FieldPair[]
  businessContext?: Partial<BusinessContext>
  lookups?: MappingLookups
}

interface MappingLookups {
  segments: string[]
  brands: string[]
  processes: string[]
  subprocesses: string[]
  countries: string[]
  directions: string[]
  sourceSystems: string[]
  targetSystems: string[]
  stages: string[]
  documentTypes: string[]
}

// ── constants ──────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: 'rgba(15,23,42,.85)',
  border: '1px solid rgba(46,134,193,.2)',
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
}

const PLATFORM_COLORS: Record<string, string> = {
  MuleSoft: '#00A1DF',
  Boomi: '#1B75BB',
  SAP_IS: '#F0AB00',
  Solace: '#00C176',
  Custom: '#8B5CF6',
}

const PLATFORMS = ['MuleSoft', 'Boomi', 'SAP_IS', 'Solace', 'Custom']
const STATUSES = ['Pending', 'Configured']

const EMPTY_LOOKUPS: MappingLookups = {
  segments: [],
  brands: [],
  processes: [],
  subprocesses: [],
  countries: [],
  directions: [],
  sourceSystems: [],
  targetSystems: [],
  stages: [],
  documentTypes: [],
}

// ── PlatformBadge ──────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span
      className="badge"
      style={{ background: PLATFORM_COLORS[platform] ?? '#6b7280', fontSize: 11, fontWeight: 600 }}
    >
      {platform}
    </span>
  )
}

// ── BusinessContextSidebar ─────────────────────────────────────────────────

interface SidebarProps {
  ctx: Partial<BusinessContext>
  lookups: MappingLookups
  onChange: (ctx: Partial<BusinessContext>) => void
}

function BusinessContextSidebar({ ctx, lookups, onChange }: SidebarProps) {
  const sel =
    (key: keyof BusinessContext) =>
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      onChange({ ...ctx, [key]: e.target.value })

  const fieldStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,.07)',
    border: '1px solid rgba(46,134,193,.25)',
    color: '#E2E8F0',
    borderRadius: 6,
    fontSize: 12,
    padding: '5px 8px',
    width: '100%',
  }

  const labelStyle: React.CSSProperties = {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 4,
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  }

  const fields: Array<{ key: keyof BusinessContext; label: string; options: string[] }> = [
    { key: 'segment',      label: 'Segment',       options: lookups.segments },
    { key: 'brand',        label: 'Brand',          options: lookups.brands },
    { key: 'process',      label: 'Process',        options: lookups.processes },
    { key: 'subprocess',   label: 'Subprocess',     options: lookups.subprocesses },
    { key: 'country',      label: 'Country',        options: lookups.countries },
    { key: 'direction',    label: 'Direction',      options: lookups.directions },
    { key: 'sourceSystem', label: 'Source System',  options: lookups.sourceSystems },
    { key: 'targetSystem', label: 'Target System',  options: lookups.targetSystems },
    { key: 'stage',        label: 'Stage',          options: lookups.stages },
    { key: 'documentType', label: 'Document Type',  options: lookups.documentTypes },
  ]

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        padding: '16px 12px',
        background: 'rgba(0,0,0,.25)',
        borderLeft: '1px solid rgba(46,134,193,.15)',
        overflowY: 'auto',
      }}
    >
      <p
        style={{
          color: '#94A3B8',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: 12,
          fontWeight: 700,
        }}
      >
        Business Context
      </p>
      {fields.map(f => (
        <div key={f.key} style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{f.label}</label>
          <select style={fieldStyle} value={ctx[f.key] ?? ''} onChange={sel(f.key)}>
            <option value="">— Any —</option>
            {f.options.map(o => (
              <option key={o} value={o} style={{ background: '#1E293B' }}>
                {o}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

// ── FieldMapperCanvas ──────────────────────────────────────────────────────

interface SvgLine {
  x1: number
  y1: number
  x2: number
  y2: number
  key: string
}

interface CanvasProps {
  sourceFields: string[]
  targetFields: string[]
  mappings: FieldPair[]
  onChange: (mappings: FieldPair[]) => void
}

function FieldMapperCanvas({ sourceFields, targetFields, mappings, onChange }: CanvasProps) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgLines, setSvgLines] = useState<SvgLine[]>([])

  const recalcLines = useCallback(() => {
    if (!leftRef.current || !rightRef.current || !containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()

    const getCenter = (el: Element): { x: number; y: number } => {
      const r = el.getBoundingClientRect()
      return {
        x: r.left + r.width / 2 - containerRect.left,
        y: r.top + r.height / 2 - containerRect.top,
      }
    }

    const leftItems = leftRef.current.querySelectorAll('[data-field]')
    const rightItems = rightRef.current.querySelectorAll('[data-field]')
    const leftMap = new Map<string, Element>()
    const rightMap = new Map<string, Element>()
    leftItems.forEach(el => leftMap.set(el.getAttribute('data-field') ?? '', el))
    rightItems.forEach(el => rightMap.set(el.getAttribute('data-field') ?? '', el))

    const lines: SvgLine[] = []
    for (const m of mappings) {
      const l = leftMap.get(m.sourceField)
      const r = rightMap.get(m.targetField)
      if (l && r) {
        const lc = getCenter(l)
        const rc = getCenter(r)
        lines.push({ x1: lc.x, y1: lc.y, x2: rc.x, y2: rc.y, key: `${m.sourceField}::${m.targetField}` })
      }
    }
    setSvgLines(lines)
  }, [mappings])

  useEffect(() => {
    recalcLines()
  }, [mappings, sourceFields, targetFields, recalcLines])

  const handleSourceClick = (field: string) => {
    setSelectedSource(prev => (prev === field ? null : field))
  }

  const handleTargetClick = (field: string) => {
    if (!selectedSource) return
    const alreadyMapped = mappings.some(
      m => m.sourceField === selectedSource && m.targetField === field,
    )
    if (alreadyMapped) {
      onChange(
        mappings.filter(
          m => !(m.sourceField === selectedSource && m.targetField === field),
        ),
      )
    } else {
      onChange([...mappings, { sourceField: selectedSource, targetField: field }])
    }
    setSelectedSource(null)
  }

  const removeMapping = (pair: FieldPair) => {
    onChange(
      mappings.filter(
        p => !(p.sourceField === pair.sourceField && p.targetField === pair.targetField),
      ),
    )
  }

  const isMappedSrc = (f: string) => mappings.some(m => m.sourceField === f)
  const isMappedTgt = (f: string) => mappings.some(m => m.targetField === f)

  const fieldItem = (
    field: string,
    side: 'source' | 'target',
    isMapped: boolean,
    isSelected: boolean,
  ) => {
    const onClick = side === 'source' ? () => handleSourceClick(field) : () => handleTargetClick(field)
    return (
      <div
        key={field}
        data-field={field}
        onClick={onClick}
        style={{
          padding: '6px 10px',
          marginBottom: 4,
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'monospace',
          color: isSelected ? '#93C5FD' : isMapped ? '#86EFAC' : '#CBD5E1',
          background: isSelected
            ? 'rgba(59,130,246,.2)'
            : isMapped
            ? 'rgba(134,239,172,.08)'
            : 'rgba(255,255,255,.04)',
          border: `1px solid ${
            isSelected
              ? 'rgba(59,130,246,.5)'
              : isMapped
              ? 'rgba(134,239,172,.25)'
              : 'rgba(255,255,255,.08)'
          }`,
          transition: 'all .15s',
          userSelect: 'none',
        }}
      >
        {side === 'source' && (
          <i className="fas fa-code me-2" style={{ fontSize: 9, opacity: 0.6 }} />
        )}
        {field}
        {side === 'target' && (
          <i className="fas fa-code ms-2" style={{ fontSize: 9, opacity: 0.6 }} />
        )}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Canvas */}
      <div
        ref={containerRef}
        style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}
      >
        {/* SVG overlay */}
        <svg
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}
          width="100%"
          height="100%"
        >
          {svgLines.map(l => (
            <path
              key={l.key}
              d={`M ${l.x1} ${l.y1} C ${(l.x1 + l.x2) / 2} ${l.y1}, ${
                (l.x1 + l.x2) / 2
              } ${l.y2}, ${l.x2} ${l.y2}`}
              fill="none"
              stroke="rgba(46,134,193,.65)"
              strokeWidth={1.5}
              strokeDasharray="5,3"
            />
          ))}
        </svg>

        {/* Source panel */}
        <div
          style={{
            flex: 1,
            padding: '12px 16px',
            overflowY: 'auto',
            borderRight: '1px solid rgba(46,134,193,.15)',
          }}
        >
          <p
            style={{
              color: '#64748B',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 8,
            }}
          >
            Source Payload Fields
          </p>
          <div ref={leftRef}>
            {sourceFields.length === 0 ? (
              <p style={{ color: '#475569', fontSize: 12, fontStyle: 'italic' }}>
                No source fields available.
              </p>
            ) : (
              sourceFields.map(f =>
                fieldItem(f, 'source', isMappedSrc(f), selectedSource === f),
              )
            )}
          </div>
        </div>

        {/* Target panel */}
        <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto' }}>
          <p
            style={{
              color: '#64748B',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 8,
            }}
          >
            Target Payload Fields
          </p>
          <div ref={rightRef}>
            {targetFields.length === 0 ? (
              <p style={{ color: '#475569', fontSize: 12, fontStyle: 'italic' }}>
                No target fields available.
              </p>
            ) : (
              targetFields.map(f => fieldItem(f, 'target', isMappedTgt(f), false))
            )}
          </div>
        </div>
      </div>

      {/* Connections summary bar */}
      {mappings.length > 0 && (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(46,134,193,.15)',
            maxHeight: 110,
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          <p
            style={{
              color: '#64748B',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 6,
            }}
          >
            Mapped Fields ({mappings.length})
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {mappings.map(m => (
              <span
                key={`${m.sourceField}::${m.targetField}`}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'rgba(46,134,193,.15)',
                  border: '1px solid rgba(46,134,193,.3)',
                  color: '#93C5FD',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <code style={{ fontSize: 10 }}>{m.sourceField}</code>
                <i className="fas fa-arrow-right" style={{ fontSize: 8, opacity: 0.6 }} />
                <code style={{ fontSize: 10 }}>{m.targetField}</code>
                <button
                  onClick={() => removeMapping(m)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#F87171',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: 12,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Selection hint */}
      {selectedSource && (
        <div
          style={{
            padding: '6px 16px',
            background: 'rgba(59,130,246,.1)',
            borderTop: '1px solid rgba(59,130,246,.25)',
            fontSize: 12,
            color: '#93C5FD',
            flexShrink: 0,
          }}
        >
          <i className="fas fa-info-circle me-2" />
          Selected: <code>{selectedSource}</code> — click a target field to map it, or
          click the source field again to deselect.
        </div>
      )}
    </div>
  )
}

// ── GlobalFieldMapperModal ─────────────────────────────────────────────────

interface GlobalMapperProps {
  onClose: () => void
}

function GlobalFieldMapperModal({ onClose }: GlobalMapperProps) {
  const [ctx, setCtx] = useState<Partial<BusinessContext>>({})
  const [mappings, setMappings] = useState<FieldPair[]>([])
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const { data: mapperData, isFetching } = useQuery<FieldMapperData>({
    queryKey: ['platformFieldMapping', 'MuleSoft'],
    queryFn: () =>
      apiClient
        .get('/Admin/GetPlatformFieldMapping', { params: { platform: 'MuleSoft' } })
        .then(r => r.data),
  })

  useEffect(() => {
    if (mapperData) {
      setMappings(mapperData.mappings ?? [])
      setCtx(mapperData.businessContext ?? {})
    }
  }, [mapperData])

  const lookups: MappingLookups = mapperData?.lookups ?? EMPTY_LOOKUPS

  const save = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await apiClient.post('/Admin/SavePlatformFieldMapping', {
        platform: 'MuleSoft',
        mappings,
        businessContext: ctx,
      })
      setSaveMsg('Saved successfully.')
    } catch {
      setSaveMsg('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1060,
        background: 'rgba(0,0,0,.78)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          background: 'rgba(15,23,42,.98)',
          borderBottom: '1px solid rgba(46,134,193,.25)',
        }}
      >
        <div>
          <h5 style={{ color: '#fff', margin: 0, fontSize: 16 }}>
            <i className="fas fa-project-diagram me-2 text-primary" />
            Global Field Mapper — MuleSoft Platform
          </h5>
          <p style={{ color: '#64748B', fontSize: 12, margin: '2px 0 0' }}>
            Configure default source-to-target field mappings for all MuleSoft integrations.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          {saveMsg && (
            <span
              style={{
                fontSize: 12,
                color: saveMsg.includes('fail') ? '#F87171' : '#4ADE80',
              }}
            >
              {saveMsg}
            </span>
          )}
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? (
              <>
                <span className="spinner-border spinner-border-sm me-1" />
                Saving…
              </>
            ) : (
              <>
                <i className="fas fa-save me-1" />
                Save Mapping
              </>
            )}
          </button>
          <button className="btn-close btn-close-white" onClick={onClose} />
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          background: 'rgba(15,23,42,.95)',
        }}
      >
        {isFetching ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="spinner-border text-primary" />
          </div>
        ) : (
          <>
            <FieldMapperCanvas
              sourceFields={mapperData?.sourceFields ?? []}
              targetFields={mapperData?.targetFields ?? []}
              mappings={mappings}
              onChange={setMappings}
            />
            <BusinessContextSidebar ctx={ctx} lookups={lookups} onChange={setCtx} />
          </>
        )}
      </div>
    </div>
  )
}

// ── IntegrationFieldMapperModal ────────────────────────────────────────────

interface IntegrationMapperProps {
  flow: MuleSoftFlow
  onClose: () => void
  onClear: () => void
}

function IntegrationFieldMapperModal({ flow, onClose, onClear }: IntegrationMapperProps) {
  const qc = useQueryClient()
  const [ctx, setCtx] = useState<Partial<BusinessContext>>({})
  const [mappings, setMappings] = useState<FieldPair[]>([])
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const { data: lookups } = useQuery<MappingLookups>({
    queryKey: ['mappingLookups'],
    queryFn: () => apiClient.get('/Admin/GetMappingLookups').then(r => r.data),
  })

  const { data: mapperData, isFetching } = useQuery<FieldMapperData>({
    queryKey: ['integrationFieldMapping', flow.integrationFlowId],
    queryFn: () =>
      apiClient
        .get('/Admin/GetIntegrationFieldMapping', { params: { id: flow.integrationFlowId } })
        .then(r => r.data),
  })

  useEffect(() => {
    if (mapperData) {
      setMappings(mapperData.mappings ?? [])
      setCtx(mapperData.businessContext ?? {})
    }
  }, [mapperData])

  const save = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await apiClient.post('/Admin/SaveIntegrationFieldMapping', {
        integrationFlowId: flow.integrationFlowId,
        mappings,
        businessContext: ctx,
      })
      setSaveMsg('Saved successfully.')
      qc.invalidateQueries({ queryKey: ['mulesoft', 'integrationFlowMappings'] })
    } catch {
      setSaveMsg('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const clearMapping = async () => {
    setClearing(true)
    try {
      await apiClient.delete('/Admin/ClearIntegrationFlowMapping', {
        params: { id: flow.integrationFlowId },
      })
      setMappings([])
      setCtx({})
      setShowClearConfirm(false)
      onClear()
    } catch {
      setSaveMsg('Clear failed. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1060,
        background: 'rgba(0,0,0,.78)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          background: 'rgba(15,23,42,.98)',
          borderBottom: '1px solid rgba(46,134,193,.25)',
        }}
      >
        <div>
          <h5 style={{ color: '#fff', margin: 0, fontSize: 16 }}>
            <i className="fas fa-code-branch me-2 text-info" />
            Field Mapper — {flow.integrationName}
          </h5>
          <p style={{ color: '#64748B', fontSize: 12, margin: '2px 0 0' }}>
            Per-integration field mapping configuration.{' '}
            <PlatformBadge platform={flow.sourcePlatform} />
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          {saveMsg && (
            <span
              style={{
                fontSize: 12,
                color: saveMsg.includes('fail') || saveMsg.includes('Clear') ? '#F87171' : '#4ADE80',
              }}
            >
              {saveMsg}
            </span>
          )}
          {flow.hasMappingConfigured && (
            <button
              className="btn btn-outline-danger btn-sm"
              onClick={() => setShowClearConfirm(true)}
              disabled={clearing}
            >
              {clearing ? (
                <span className="spinner-border spinner-border-sm" />
              ) : (
                <>
                  <i className="fas fa-trash me-1" />
                  Clear Mapping
                </>
              )}
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? (
              <>
                <span className="spinner-border spinner-border-sm me-1" />
                Saving…
              </>
            ) : (
              <>
                <i className="fas fa-save me-1" />
                Save Mapping
              </>
            )}
          </button>
          <button className="btn-close btn-close-white" onClick={onClose} />
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          background: 'rgba(15,23,42,.95)',
        }}
      >
        {isFetching ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="spinner-border text-info" />
          </div>
        ) : (
          <>
            <FieldMapperCanvas
              sourceFields={mapperData?.sourceFields ?? []}
              targetFields={mapperData?.targetFields ?? []}
              mappings={mappings}
              onChange={setMappings}
            />
            <BusinessContextSidebar
              ctx={ctx}
              lookups={lookups ?? EMPTY_LOOKUPS}
              onChange={setCtx}
            />
          </>
        )}
      </div>

      {/* Clear confirm overlay */}
      {showClearConfirm && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            background: 'rgba(0,0,0,.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'rgba(15,23,42,.98)',
              border: '1px solid rgba(239,68,68,.4)',
              borderRadius: 10,
              padding: 24,
              maxWidth: 380,
              width: '90%',
            }}
          >
            <h6 style={{ color: '#fff', marginBottom: 8 }}>Clear Mapping?</h6>
            <p style={{ color: '#94A3B8', fontSize: 13 }}>
              This will permanently remove the field mapping for{' '}
              <strong style={{ color: '#fff' }}>{flow.integrationName}</strong>. This
              cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={clearMapping}
                disabled={clearing}
              >
                {clearing ? 'Clearing…' : 'Clear Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MuleSoftIntegrationMappingsPage ────────────────────────────────────────

export default function MuleSoftIntegrationMappingsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewIntegrationForm>({
    integrationName: '',
    platform: 'MuleSoft',
    status: 'Pending',
  })
  const [saving, setSaving] = useState(false)
  const [showGlobalMapper, setShowGlobalMapper] = useState(false)
  const [mapperTarget, setMapperTarget] = useState<MuleSoftFlow | null>(null)
  const [clearTarget, setClearTarget] = useState<MuleSoftFlow | null>(null)
  const [clearing, setClearing] = useState(false)

  const { data: flows, isFetching } = useQuery<MuleSoftFlow[]>({
    queryKey: ['mulesoft', 'integrationFlowMappings'],
    queryFn: () =>
      apiClient
        .get('/Admin/GetIntegrationFlowMappings', { params: { platform: 'MuleSoft' } })
        .then(r => r.data ?? []),
  })

  const total = flows?.length ?? 0
  const configured = flows?.filter(f => f.hasMappingConfigured).length ?? 0
  const pending = total - configured

  const createFlow = async () => {
    setSaving(true)
    try {
      await apiClient.post('/Admin/CreateIntegrationFlow', form)
      qc.invalidateQueries({ queryKey: ['mulesoft', 'integrationFlowMappings'] })
      setShowModal(false)
      setForm({ integrationName: '', platform: 'MuleSoft', status: 'Pending' })
    } catch {
      /* ignore */
    } finally {
      setSaving(false)
    }
  }

  const confirmClear = async () => {
    if (!clearTarget) return
    setClearing(true)
    try {
      await apiClient.delete('/Admin/ClearIntegrationFlowMapping', {
        params: { id: clearTarget.integrationFlowId },
      })
      qc.invalidateQueries({ queryKey: ['mulesoft', 'integrationFlowMappings'] })
      setClearTarget(null)
    } catch {
      /* ignore */
    } finally {
      setClearing(false)
    }
  }

  const handleRowUpdating = useCallback(
    (e: any) => {
      e.cancel = true
      const merged = { integrationFlowId: e.key, ...e.oldData, ...e.newData }
      apiClient
        .put('/Admin/SaveIntegrationFlowMapping', merged)
        .then(() =>
          qc.invalidateQueries({ queryKey: ['mulesoft', 'integrationFlowMappings'] }),
        )
        .catch(console.error)
    },
    [qc],
  )

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>
      {/* Back */}
      <div className="mb-3">
        <button
          className="btn btn-link p-0"
          style={{ color: '#94A3B8', fontSize: 14 }}
          onClick={() => navigate('/orchestration/mulesoft')}
        >
          <i className="fas fa-arrow-left me-1" />
          Back to MuleSoft Onboarding
        </button>
      </div>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h3 text-white mb-1">
            <i className="fas fa-sitemap me-2 text-primary" />
            MuleSoft Integration Mappings
          </h1>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>
            Configure business context mappings for MuleSoft flow integrations.
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button
            className="btn btn-outline-info btn-sm"
            onClick={() => setShowGlobalMapper(true)}
          >
            <i className="fas fa-project-diagram me-2" />
            Configure Field Mapping
          </button>
          <button className="btn btn-success btn-sm" onClick={() => setShowModal(true)}>
            <i className="fas fa-plus me-2" />
            New Integration
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Integrations', value: total, color: '#fff' },
          { label: 'Configured', value: configured, color: '#2ECC71' },
          { label: 'Pending', value: pending, color: '#F39C12' },
        ].map(s => (
          <div key={s.label} className="col-md-4">
            <div
              style={{
                background: 'linear-gradient(135deg,#1E293B 0%,#334155 100%)',
                border: '1px solid rgba(46,134,193,.3)',
                borderRadius: 12,
                padding: '20px 25px',
              }}
            >
              <div style={{ color: s.color, fontSize: 32, fontWeight: 700 }}>{s.value}</div>
              <div
                style={{
                  color: '#94A3B8',
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={CARD}>
        <DataGrid
          dataSource={flows ?? []}
          keyExpr="integrationFlowId"
          showBorders={false}
          showRowLines={true}
          rowAlternationEnabled={true}
          columnAutoWidth={true}
          allowColumnResizing={true}
          height={560}
          noDataText={
            isFetching
              ? 'Loading…'
              : 'No integration flows found — onboard a MuleSoft application to get started'
          }
          onRowUpdating={handleRowUpdating}
        >
          <SearchPanel visible={true} placeholder="Search flows..." width={240} />
          <FilterRow visible={true} />
          <Editing mode="row" allowUpdating={true} />
          <Paging pageSize={25} />
          <Pager showPageSizeSelector={true} allowedPageSizes={[25, 50, 100]} showInfo={true} />

          <Column dataField="integrationName" caption="Integration Name" minWidth={200} />
          <Column
            dataField="sourcePlatform"
            caption="Platform"
            width={140}
            allowEditing={false}
            cellRender={({ value }: { value: string }) => <PlatformBadge platform={value} />}
          />
          <Column
            dataField="hasMappingConfigured"
            caption="Status"
            width={120}
            allowEditing={false}
            cellRender={({ value }: { value: boolean }) => (
              <span
                className={`badge ${value ? 'bg-success' : 'bg-warning text-dark'}`}
                style={{ fontSize: 11 }}
              >
                {value ? 'Configured' : 'Pending'}
              </span>
            )}
          />
          <Column
            caption="Actions"
            width={130}
            allowSorting={false}
            allowFiltering={false}
            allowEditing={false}
            cellRender={(cellData: any) => {
              const row: MuleSoftFlow = cellData.data
              return (
                <div className="d-flex gap-1">
                  <button
                    className="btn btn-sm btn-outline-info"
                    title="Configure Field Mapping"
                    onClick={() => setMapperTarget(row)}
                    style={{ padding: '2px 7px' }}
                  >
                    <i className="fas fa-code-branch" />
                  </button>
                  {row.hasMappingConfigured && (
                    <button
                      className="btn btn-sm btn-outline-danger"
                      title="Clear Mapping"
                      onClick={() => setClearTarget(row)}
                      style={{ padding: '2px 7px' }}
                    >
                      <i className="fas fa-trash" />
                    </button>
                  )}
                </div>
              )
            }}
          />
        </DataGrid>
      </div>

      {/* ── New Integration Modal ── */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.6)' }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 480 }}>
            <div
              className="modal-content"
              style={{
                background: 'linear-gradient(135deg,#0F172A 0%,#1E293B 100%)',
                border: '1px solid rgba(46,134,193,.35)',
                borderRadius: 16,
              }}
            >
              <div
                className="modal-header"
                style={{ borderBottom: '1px solid rgba(46,134,193,.2)' }}
              >
                <h5 className="modal-title text-white">
                  <i className="fas fa-plus me-2" />
                  New Integration Flow
                </h5>
                <button className="btn-close btn-close-white" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body p-4">
                {/* Integration Name */}
                <div className="mb-3">
                  <label
                    style={{
                      color: '#BDC3C7',
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Integration Name *
                  </label>
                  <input
                    className="form-control form-control-sm"
                    value={form.integrationName}
                    onChange={e => setForm(p => ({ ...p, integrationName: e.target.value }))}
                    placeholder="e.g. Order Sync to ERP"
                    style={{
                      background: 'rgba(255,255,255,.08)',
                      border: '1px solid rgba(46,134,193,.3)',
                      color: '#fff',
                      borderRadius: 6,
                    }}
                  />
                </div>
                {/* Platform */}
                <div className="mb-3">
                  <label
                    style={{
                      color: '#BDC3C7',
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Platform
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={form.platform}
                    onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
                    style={{
                      background: 'rgba(255,255,255,.08)',
                      border: '1px solid rgba(46,134,193,.3)',
                      color: '#fff',
                      borderRadius: 6,
                    }}
                  >
                    {PLATFORMS.map(p => (
                      <option key={p} value={p} style={{ background: '#1E293B' }}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Status */}
                <div className="mb-3">
                  <label
                    style={{
                      color: '#BDC3C7',
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Status
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={form.status}
                    onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    style={{
                      background: 'rgba(255,255,255,.08)',
                      border: '1px solid rgba(46,134,193,.3)',
                      color: '#fff',
                      borderRadius: 6,
                    }}
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s} style={{ background: '#1E293B' }}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div
                className="modal-footer"
                style={{ borderTop: '1px solid rgba(46,134,193,.2)' }}
              >
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-success btn-sm"
                  onClick={createFlow}
                  disabled={saving || !form.integrationName.trim()}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" />
                      Saving…
                    </>
                  ) : (
                    'Create Integration'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear Mapping Confirm (grid row action) ── */}
      {clearTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1055,
            background: 'rgba(0,0,0,.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setClearTarget(null)}
        >
          <div
            style={{
              background: 'rgba(15,23,42,.98)',
              border: '1px solid rgba(239,68,68,.4)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 380,
              width: '90%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h6 style={{ color: '#fff', marginBottom: 8 }}>Clear Mapping?</h6>
            <p style={{ color: '#94A3B8', fontSize: 13 }}>
              This will permanently remove the field mapping for{' '}
              <strong style={{ color: '#fff' }}>{clearTarget.integrationName}</strong>. This
              cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setClearTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={confirmClear}
                disabled={clearing}
              >
                {clearing ? 'Clearing…' : 'Clear Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Global Field Mapper ── */}
      {showGlobalMapper && (
        <GlobalFieldMapperModal onClose={() => setShowGlobalMapper(false)} />
      )}

      {/* ── Per-Integration Field Mapper ── */}
      {mapperTarget && (
        <IntegrationFieldMapperModal
          flow={mapperTarget}
          onClose={() => setMapperTarget(null)}
          onClear={() => {
            qc.invalidateQueries({ queryKey: ['mulesoft', 'integrationFlowMappings'] })
            setMapperTarget(null)
          }}
        />
      )}
    </div>
  )
}
