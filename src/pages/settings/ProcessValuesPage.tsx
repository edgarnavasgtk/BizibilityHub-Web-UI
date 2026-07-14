import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import DataGrid, { Column, MasterDetail, Paging, Pager, FilterRow, SearchPanel, Editing } from 'devextreme-react/data-grid'
import type { DataGridRef } from 'devextreme-react/data-grid'
import apiClient from '../../services/apiClient'

interface ProcessRow {
  businessProcessId: number
  processName: string
  averageProcessValue: number | null
  journeys30d: number
  avgSteps: number
}

interface JourneyStep {
  stepNumber: number
  integrationName: string
  sourceSystem: string | null
  targetSystem: string | null
  averageTransactionValue: number
  isManualValue: boolean
  proposedValue: number | null
}

interface ListResponse {
  rows: ProcessRow[]
  lookbackDays: number
}

function fmt$(n: number | null | undefined) {
  return '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function JourneyDetail({ data: wrapper, lookbackDays }: { data: { data: ProcessRow }; lookbackDays: number }) {
  const row = wrapper.data
  const { data: res, isFetching } = useQuery<{ steps: JourneyStep[]; occurrences: number }>({
    queryKey: ['process-journey', row.businessProcessId],
    queryFn: () => apiClient.get(`/Settings/ModalJourney/${row.businessProcessId}`).then(r => r.data),
    staleTime: 60_000,
  })

  if (isFetching) return <div className="text-center py-3"><span className="spinner-border spinner-border-sm text-primary" /></div>

  const steps = res?.steps ?? []
  if (!steps.length) {
    return (
      <div style={{ padding: '12px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          No journeys found in the last {lookbackDays} day{lookbackDays === 1 ? '' : 's'} for this process.
        </p>
      </div>
    )
  }

  const detailRows = steps.map(s => {
    const stored = Number(s.averageTransactionValue) || 0
    const preview = s.isManualValue ? stored : (s.proposedValue != null ? Number(s.proposedValue) : 0)
    return {
      stepNumber: s.stepNumber,
      integrationName: s.integrationName,
      path: (s.sourceSystem ?? '—') + ' → ' + (s.targetSystem ?? '—'),
      isManualValue: !!s.isManualValue,
      previewValue: preview,
      storedValue: stored,
    }
  })

  return (
    <div style={{ padding: '16px 20px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
      <div className="d-flex gap-4 mb-2 flex-wrap" style={{ fontSize: 13, color: '#475569' }}>
        <span><strong style={{ color: '#0F172A', fontSize: 15 }}>{Number(row.journeys30d).toLocaleString()}</strong> journeys ({lookbackDays}d)</span>
        <span><strong style={{ color: '#0F172A', fontSize: 15 }}>{Number(row.avgSteps).toFixed(2)}</strong> avg steps</span>
        <span><em style={{ fontStyle: 'normal', color: '#2E86C1', fontWeight: 600 }}>{Number(res?.occurrences ?? 0).toLocaleString()}</em> times this exact path was used</span>
        <span className="ms-auto" style={{ color: '#64748B' }}>Recompute preview = avg of (residual ÷ unlocked) across every journey this integration appears in</span>
      </div>
      <DataGrid dataSource={detailRows} keyExpr="stepNumber" showBorders showRowLines columnAutoWidth>
        <Column dataField="stepNumber" caption="#" width={60} alignment="center" />
        <Column dataField="integrationName" caption="Integration"
          cellRender={({ data: d }) => (
            <span>
              {d.integrationName || ''}
              {d.isManualValue && (
                <i className="fas fa-lock" title="Manually locked — Recompute will not change this value"
                  style={{ color: '#F59E0B', marginLeft: 6, fontSize: 11 }} />
              )}
            </span>
          )} />
        <Column dataField="path" caption="Source → Target" />
        <Column dataField="previewValue" caption="Recompute preview" dataType="number" format={{ type: 'currency', precision: 2 }} width={180}
          cellRender={({ data: d }) => (
            <span
              style={{ color: d.isManualValue ? '#94A3B8' : '#16A34A', fontWeight: 600 }}
              title={d.isManualValue
                ? 'Locked — preview matches stored value (Recompute skips this)'
                : 'What Recompute would write for this step'}
            >
              {fmt$(d.previewValue)}
            </span>
          )} />
        <Column dataField="storedValue" caption="Stored on Integration" dataType="number" format={{ type: 'currency', precision: 2 }} width={180} />
      </DataGrid>
    </div>
  )
}

export default function ProcessValuesPage() {
  const queryClient = useQueryClient()
  const gridRef = useRef<DataGridRef>(null)
  const [recomputeStatus, setRecomputeStatus] = useState<{ text: string; type: 'idle' | 'loading' | 'success' | 'error' }>({ text: '', type: 'idle' })
  const [lookbackDays, setLookbackDays] = useState(30)

  const { data, isFetching } = useQuery<ListResponse>({
    queryKey: ['process-values'],
    queryFn: () => apiClient.get<ListResponse>('/Settings/List').then(r => {
      if (r.data?.lookbackDays) setLookbackDays(r.data.lookbackDays)
      return r.data
    }),
  })

  const rows = data?.rows ?? []

  const saveMutation = useMutation({
    mutationFn: ({ businessProcessId, averageProcessValue }: { businessProcessId: number; averageProcessValue: number | null }) =>
      apiClient.post('/Settings/Save', { businessProcessId, averageProcessValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['process-values'] })
      queryClient.invalidateQueries({ queryKey: ['process-journey'] })
    },
  })

  const handleRecompute = useCallback(async () => {
    setRecomputeStatus({ text: 'Running…', type: 'loading' })
    try {
      const r = await apiClient.post('/Settings/Recompute')
      if (r.data?.success) {
        setRecomputeStatus({ text: `Updated ${r.data.integrationsUpdated} integrations.`, type: 'success' })
        gridRef.current?.instance().collapseAll(-1)
        queryClient.invalidateQueries({ queryKey: ['process-values'] })
        queryClient.invalidateQueries({ queryKey: ['process-journey'] })
      } else {
        setRecomputeStatus({ text: r.data?.message ?? 'Failed', type: 'error' })
      }
    } catch {
      setRecomputeStatus({ text: 'Request failed', type: 'error' })
    }
  }, [queryClient])

  const statusColor = recomputeStatus.type === 'success' ? '#2ECC71' : recomputeStatus.type === 'error' ? '#E74C3C' : '#BDC3C7'

  return (
    <div style={{
      background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
      minHeight: '100vh', padding: 20,
    }}>
      <div style={{ marginBottom: 25 }}>
        <h2 style={{ color: '#FFFFFF', fontWeight: 700, marginBottom: 8 }}>
          <i className="fas fa-coins me-2" />Business Process Valuation
        </h2>
        <p style={{ color: '#BDC3C7', fontSize: 14, marginBottom: 0 }}>
          Set the average value of a single journey through each business process. Values are distributed across the integrations participating in each end-to-end journey. Expand a row to see the modal journey steps.
        </p>
      </div>

      <div style={{ background: '#1E293B', borderRadius: 12, padding: 25, boxShadow: '0 4px 16px rgba(0,0,0,.5)', border: '1px solid rgba(46,134,193,.2)' }}>
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <span style={{ color: '#BDC3C7', fontSize: 13 }}>Click the chevron to expand a row and view its modal end-to-end journey.</span>
          <div className="d-flex align-items-center gap-2">
            {recomputeStatus.text && (
              <span style={{ color: statusColor, fontSize: 13 }}>{recomputeStatus.text}</span>
            )}
            <button
              onClick={handleRecompute}
              disabled={recomputeStatus.type === 'loading'}
              style={{
                background: 'linear-gradient(135deg,#2E86C1,#1A5276)', color: '#FFFFFF',
                border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600,
                cursor: recomputeStatus.type === 'loading' ? 'not-allowed' : 'pointer',
                opacity: recomputeStatus.type === 'loading' ? .6 : 1,
              }}
            >
              {recomputeStatus.type === 'loading'
                ? <><span className="spinner-border spinner-border-sm me-1" />Recomputing…</>
                : <><i className="fas fa-sync-alt me-1" />Recompute integration values</>
              }
            </button>
          </div>
        </div>

        {isFetching && <div className="text-center py-5"><span className="spinner-border text-primary" /></div>}

        {!isFetching && (
          <DataGrid
            ref={gridRef}
            dataSource={rows}
            keyExpr="businessProcessId"
            showBorders={true}
            showRowLines={true}
            rowAlternationEnabled={true}
            hoverStateEnabled={true}
            columnAutoWidth={true}
            height={540}
            onRowUpdated={({ data: row }) => {
              saveMutation.mutate({ businessProcessId: row.businessProcessId, averageProcessValue: row.averageProcessValue })
            }}
          >
            <FilterRow visible={true} />
            <SearchPanel visible={true} width={240} placeholder="Search..." />
            <Paging pageSize={25} />
            <Pager showPageSizeSelector={true} allowedPageSizes={[10, 25, 50]} showInfo={true} visible={true} />
            <Editing mode="cell" allowUpdating={true} useIcons={true} />

            <Column dataField="businessProcessId" caption="ID" width={70} allowEditing={false} visible={false} />
            <Column dataField="processName" caption="Process" allowEditing={false} />
            <Column
              dataField="averageProcessValue"
              caption="Avg Process Value"
              dataType="number"
              format={{ type: 'currency', precision: 2 }}
              width={170}
              allowEditing={true}
            />
            <Column
              dataField="journeys30d"
              caption={`Journeys (${lookbackDays}d)`}
              dataType="number"
              format={{ type: 'fixedPoint', precision: 0 }}
              width={140}
              allowEditing={false}
            />
            <Column
              dataField="avgSteps"
              caption="Avg Steps"
              dataType="number"
              format={{ type: 'fixedPoint', precision: 0 }}
              width={110}
              allowEditing={false}
            />

            <MasterDetail enabled={true} render={(d) => <JourneyDetail data={d} lookbackDays={lookbackDays} />} />
          </DataGrid>
        )}
      </div>
    </div>
  )
}
