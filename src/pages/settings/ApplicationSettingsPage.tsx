import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../services/apiClient'

interface AppSettings {
  integrationMapWarningPct: number
  integrationMapCriticalPct: number
  businessProcessValuationLookbackDays: number
  transactionGroupingField: string
  updatedAt?: string
  updatedBy?: string
}

interface LgRow {
  id: number
  loggerSystem: string
  groupingField: string
}

const inputStyle: React.CSSProperties = {
  background: '#0F172A',
  border: '1px solid rgba(46,134,193,.5)',
  color: '#FFFFFF',
  fontSize: 16,
  fontWeight: 600,
  padding: '8px 12px',
  borderRadius: 6,
  width: '100%',
}

export default function ApplicationSettingsPage() {
  const queryClient = useQueryClient()

  const { data: settings } = useQuery<AppSettings>({
    queryKey: ['settings', 'application'],
    queryFn: () => apiClient.get('/Settings/Application/Get').then(r => r.data),
  })

  const { data: lgRows = [] } = useQuery<LgRow[]>({
    queryKey: ['settings', 'lgGroupings'],
    queryFn: () => apiClient.get('/Settings/Application/LoggerGroupings').then(r => r.data),
  })

  const { data: lgSystems = [] } = useQuery<string[]>({
    queryKey: ['settings', 'lgSystems'],
    queryFn: () => apiClient.get('/Settings/Application/LoggerSystems').then(r => r.data),
  })

  const [warningPct, setWarningPct] = useState(5)
  const [criticalPct, setCriticalPct] = useState(10)
  const [lookbackDays, setLookbackDays] = useState(30)
  const [groupingField, setGroupingField] = useState('CorrelationAndTransaction')
  const [saveStatus, setSaveStatus] = useState<{ msg: string; type: 'success' | 'error' | '' }>({ msg: '', type: '' })

  useEffect(() => {
    if (settings) {
      setWarningPct(settings.integrationMapWarningPct ?? 5)
      setCriticalPct(settings.integrationMapCriticalPct ?? 10)
      setLookbackDays(settings.businessProcessValuationLookbackDays ?? 30)
      setGroupingField(settings.transactionGroupingField ?? 'CorrelationAndTransaction')
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => apiClient.post('/Settings/Application/Save', {
      integrationMapWarningPct: warningPct,
      integrationMapCriticalPct: criticalPct,
      businessProcessValuationLookbackDays: lookbackDays,
      transactionGroupingField: groupingField,
    }).then(r => r.data),
    onSuccess: (r) => {
      if (r.success) {
        setSaveStatus({ msg: 'Saved.', type: 'success' })
        queryClient.invalidateQueries({ queryKey: ['settings', 'application'] })
      } else {
        setSaveStatus({ msg: r.message || 'Save failed.', type: 'error' })
      }
    },
    onError: () => setSaveStatus({ msg: 'Request failed.', type: 'error' }),
  })

  // Logger grouping modal state
  const [lgModal, setLgModal] = useState(false)
  const [lgEditId, setLgEditId] = useState<number | null>(null)
  const [lgLoggerSystem, setLgLoggerSystem] = useState('')
  const [lgGroupingField, setLgGroupingField] = useState('CorrelationAndTransaction')
  const [lgModalStatus, setLgModalStatus] = useState<{ msg: string; type: 'success' | 'error' | '' }>({ msg: '', type: '' })

  const lgSaveMutation = useMutation({
    mutationFn: () => apiClient.post('/Settings/Application/LoggerGroupings/Save', {
      id: lgEditId,
      loggerSystem: lgLoggerSystem,
      groupingField: lgGroupingField,
    }).then(r => r.data),
    onSuccess: (r) => {
      if (r.success) {
        setLgModalStatus({ msg: 'Guardado.', type: 'success' })
        queryClient.invalidateQueries({ queryKey: ['settings', 'lgGroupings'] })
        setTimeout(() => setLgModal(false), 800)
      } else {
        setLgModalStatus({ msg: r.message || 'Error al guardar.', type: 'error' })
      }
    },
    onError: () => setLgModalStatus({ msg: 'Error de conexión.', type: 'error' }),
  })

  const lgDeleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/Settings/Application/LoggerGroupings/${id}`).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'lgGroupings'] }),
  })

  function openLgModal(row?: LgRow) {
    if (row) {
      setLgEditId(row.id)
      setLgLoggerSystem(row.loggerSystem)
      setLgGroupingField(row.groupingField)
    } else {
      setLgEditId(null)
      setLgLoggerSystem(lgSystems[0] || '')
      setLgGroupingField('CorrelationAndTransaction')
    }
    setLgModalStatus({ msg: '', type: '' })
    setLgModal(true)
  }

  const sectionStyle: React.CSSProperties = {
    background: '#1E293B',
    border: '1px solid rgba(46,134,193,.2)',
    borderRadius: 12,
    padding: '24px 28px',
    marginBottom: 20,
    boxShadow: '0 4px 16px rgba(0,0,0,.5)',
  }

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Header */}
      <div className="mb-4">
        <h1 className="h3 text-white mb-1">
          <i className="fas fa-sliders-h me-2" />Application Settings
        </h1>
        <p className="text-muted mb-0" style={{ fontSize: 14 }}>
          Tunable thresholds and feature controls applied platform-wide. Changes take effect on the next page load.
        </p>
      </div>

      {/* Section 1: Integration Map */}
      <div style={sectionStyle}>
        <h4 style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Integration Map — Color Thresholds</h4>
        <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 18 }}>
          Connectors and their connections in the Integration Map are colored by error rate
          (errors ÷ total transactions). Set the percentage ceilings for each band.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 160px 1fr', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ color: '#E2E8F0', fontSize: 14, margin: 0 }}>Warning band (orange)</label>
          <input type="number" min={0} max={99} step={0.1} value={warningPct} onChange={e => setWarningPct(+e.target.value)} style={inputStyle} />
          <span style={{ color: '#64748B', fontSize: 12 }}>Error rate ≥ this percentage shows orange.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 160px 1fr', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ color: '#E2E8F0', fontSize: 14, margin: 0 }}>Critical band (red)</label>
          <input type="number" min={0} max={100} step={0.1} value={criticalPct} onChange={e => setCriticalPct(+e.target.value)} style={inputStyle} />
          <span style={{ color: '#64748B', fontSize: 12 }}>Error rate ≥ this percentage shows red. Must be greater than the warning band.</span>
        </div>
      </div>

      {/* Section 2: BPV Lookback */}
      <div style={sectionStyle}>
        <h4 style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Business Process Valuation — Lookback Window</h4>
        <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 18 }}>
          Number of days of journey history used by the BPV grid. Capped at 30 days.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 160px 1fr', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ color: '#E2E8F0', fontSize: 14, margin: 0 }}>Lookback window (days)</label>
          <input type="number" min={1} max={30} step={1} value={lookbackDays} onChange={e => setLookbackDays(+e.target.value)} style={inputStyle} />
          <span style={{ color: '#64748B', fontSize: 12 }}>Default 30. Use a shorter window after a topology change to ignore stale journey shapes.</span>
        </div>
      </div>

      {/* Section 3: Transaction Grouping */}
      <div style={sectionStyle}>
        <h4 style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Transaction Explorer — Child Row Grouping</h4>
        <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 18 }}>
          Controls which events are shown when you expand a row in the Transaction Monitor.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
          {[
            { value: 'CorrelationAndTransaction', label: 'Correlation + Transaction (default)', desc: 'Shows only the events that share the same CorrelationId and TransactionId as the parent row — one integration step at a time.' },
            { value: 'CorrelationOnly',            label: 'Correlation only',                   desc: 'Shows all events that share the same CorrelationId — every hop in the full end-to-end flow, regardless of TransactionId.' },
          ].map((opt) => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="radio"
                name="transactionGroupingField"
                value={opt.value}
                checked={groupingField === opt.value}
                onChange={() => setGroupingField(opt.value)}
                style={{ marginTop: 3, accentColor: '#60A5FA' }}
              />
              <div>
                <div style={{ color: '#E2E8F0', fontSize: 14, fontWeight: 500 }}>{opt.label}</div>
                <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <button
            style={{ background: 'linear-gradient(135deg,#2E86C1,#1A5276)', color: '#FFFFFF', border: 'none', padding: '10px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            <i className="fas fa-save me-2" />Save
          </button>
          {saveStatus.msg && (
            <span style={{ color: saveStatus.type === 'success' ? '#2ECC71' : '#E74C3C', fontSize: 13 }}>{saveStatus.msg}</span>
          )}
        </div>

        {settings?.updatedAt && (
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 16, paddingTop: 12, borderTop: '1px dashed rgba(46,134,193,.2)' }}>
            Last updated: <strong>{settings.updatedAt}</strong>
            {settings.updatedBy && <> by <strong>{settings.updatedBy}</strong></>}
          </div>
        )}
      </div>

      {/* Section 4: Logger System Grouping */}
      <div style={sectionStyle}>
        <h4 style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Transaction Explorer — Agrupación por Logger System</h4>
        <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 18 }}>
          Configura cómo se agrupan los eventos al expandir una fila en el Transaction Monitor,
          según el Logger System de la transacción. Si un Logger System no tiene configuración
          específica, se aplica el setting global como fallback.
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ color: '#94A3B8', fontSize: 12, fontWeight: 600, textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid rgba(46,134,193,.2)' }}>Logger System</th>
              <th style={{ color: '#94A3B8', fontSize: 12, fontWeight: 600, textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid rgba(46,134,193,.2)' }}>Agrupación</th>
              <th style={{ width: 100, color: '#94A3B8', fontSize: 12, fontWeight: 600, textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid rgba(46,134,193,.2)' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {lgRows.length === 0 ? (
              <tr><td colSpan={3} style={{ color: '#64748B', textAlign: 'center', padding: 16 }}>Sin configuraciones. Agrega una con el botón.</td></tr>
            ) : lgRows.map((row) => (
              <tr key={row.id}>
                <td style={{ color: '#E2E8F0', fontSize: 13, padding: '8px 10px', borderBottom: '1px solid rgba(46,134,193,.08)' }}>{row.loggerSystem}</td>
                <td style={{ fontSize: 13, padding: '8px 10px', borderBottom: '1px solid rgba(46,134,193,.08)' }}>
                  {row.groupingField === 'CorrelationOnly'
                    ? <span style={{ background: 'rgba(96,165,250,.15)', color: '#60A5FA', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>Correlation only</span>
                    : <span style={{ background: 'rgba(148,163,184,.12)', color: '#94A3B8', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>Correlation + Transaction</span>
                  }
                </td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(46,134,193,.08)' }}>
                  <button onClick={() => openLgModal(row)} style={{ background: 'none', border: 'none', color: '#60A5FA', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 13 }}>
                    <i className="fas fa-pencil-alt" />
                  </button>
                  <button
                    onClick={() => { if (confirm(`¿Eliminar configuración para "${row.loggerSystem}"?`)) lgDeleteMutation.mutate(row.id) }}
                    style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 13 }}
                  >
                    <i className="fas fa-trash-alt" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          style={{ background: 'rgba(46,134,193,.15)', border: '1px solid rgba(46,134,193,.4)', color: '#60A5FA', padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 14 }}
          onClick={() => openLgModal()}
        >
          <i className="fas fa-plus me-1" /> Agregar Logger System
        </button>
      </div>

      {/* Logger Grouping Modal */}
      {lgModal && (
        <>
          <div className="modal fade show d-block" style={{ zIndex: 1060 }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content" style={{ background: '#1E293B', border: '1px solid rgba(46,134,193,.3)', color: '#E2E8F0' }}>
                <div className="modal-header" style={{ borderBottom: '1px solid rgba(46,134,193,.2)' }}>
                  <h5 className="modal-title">{lgEditId ? 'Editar configuración' : 'Agregar configuración'}</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setLgModal(false)} />
                </div>
                <div className="modal-body">
                  <label style={{ color: '#94A3B8', fontSize: 13, marginBottom: 4, display: 'block' }}>Logger System</label>
                  <select
                    value={lgLoggerSystem}
                    onChange={e => setLgLoggerSystem(e.target.value)}
                    style={{ background: '#0F172A', border: '1px solid rgba(46,134,193,.5)', color: '#FFF', padding: '8px 10px', borderRadius: 6, width: '100%', marginBottom: 14 }}
                  >
                    {lgSystems.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <label style={{ color: '#94A3B8', fontSize: 13, marginBottom: 4, display: 'block' }}>Agrupación</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { value: 'CorrelationAndTransaction', label: 'Correlation + Transaction (default)', desc: 'Filtra por CorrelationId y TransactionId — un paso de integración a la vez.' },
                      { value: 'CorrelationOnly',            label: 'Correlation only',                   desc: 'Muestra todos los saltos del flujo completo (solo CorrelationId).' },
                    ].map((opt) => (
                      <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <input type="radio" name="lgGroupingField" value={opt.value} checked={lgGroupingField === opt.value} onChange={() => setLgGroupingField(opt.value)} style={{ marginTop: 3, accentColor: '#60A5FA' }} />
                        <div>
                          <div style={{ color: '#E2E8F0', fontSize: 14, fontWeight: 500 }}>{opt.label}</div>
                          <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="modal-footer" style={{ borderTop: '1px solid rgba(46,134,193,.2)' }}>
                  {lgModalStatus.msg && (
                    <span style={{ color: lgModalStatus.type === 'success' ? '#2ECC71' : '#E74C3C', fontSize: 13, marginRight: 'auto' }}>{lgModalStatus.msg}</span>
                  )}
                  <button className="btn btn-secondary" onClick={() => setLgModal(false)}>Cancelar</button>
                  <button
                    style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                    disabled={lgSaveMutation.isPending}
                    onClick={() => lgSaveMutation.mutate()}
                  >
                    <i className="fas fa-save me-1" /> Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" style={{ zIndex: 1055 }} onClick={() => setLgModal(false)} />
        </>
      )}

    </div>
  )
}
