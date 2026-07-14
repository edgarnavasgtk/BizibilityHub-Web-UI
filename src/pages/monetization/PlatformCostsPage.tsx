import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DataGrid, { Column, Paging, Pager, FilterRow, MasterDetail, Summary, TotalItem } from 'devextreme-react/data-grid'
import CustomStore from 'devextreme/data/custom_store'
import notify from 'devextreme/ui/notify'
import apiClient from '../../services/apiClient'

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR + 1 - i)

// ── Types ───────────────────────────────────────────────────────────────────
interface PlatformCost {
  platformCostId: number
  year: number
  categoryName: string
  description?: string
  annualCost: number
  allocationMethod: 'ByVolume' | 'Equal'
  isActive: boolean
}

interface CostSummary {
  totalPlatformCost: number
  totalIntegrations: number
  totalTransactions: number
  overallROI: number
}

interface AllocationRow {
  integrationFlowId: number
  integrationName: string
  transactionCount: number
  avgTransactionValue: number | null
  allocatedCost: number
  valueDelivered: number | null
  roi: number | null
  costBreakdown: { categoryName: string; allocationMethod: string; allocatedAmount: number }[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmt$(v: number | null | undefined) {
  if (v == null) return '$0.00'
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
  borderRadius: 12, padding: '20px 25px',
  border: '1px solid rgba(46,134,193,.3)',
  flex: 1, minWidth: 180,
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(15,23,42,.8)', border: '1px solid rgba(46,134,193,.3)',
  color: '#fff', borderRadius: 6, padding: '8px 12px', width: '100%',
}

// ── Detail template for distribution grid ───────────────────────────────────
function BreakdownDetail({ data }: { data: AllocationRow }) {
  const breakdown = data.costBreakdown ?? []
  if (!breakdown.length) return <div style={{ padding: 12, color: '#9CA3AF' }}>No cost breakdown available</div>
  return (
    <div style={{ padding: 8, background: 'rgba(255,255,255,.03)' }}>
      <DataGrid dataSource={breakdown} showBorders columnAutoWidth>
        <Column dataField="categoryName" caption="Cost Category" />
        <Column dataField="allocationMethod" caption="Method" width={110} />
        <Column dataField="allocatedAmount" caption="Amount" width={130} alignment="right"
          cellRender={({ data: d }) => <span style={{ color: '#F59E0B', fontWeight: 600 }}>{fmt$(d.allocatedAmount)}</span>} />
      </DataGrid>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PlatformCostsPage() {
  const qc = useQueryClient()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showDistribution, setShowDistribution] = useState(false)
  const [editingId, setEditingId] = useState<number>(0)
  const [deletingId, setDeletingId] = useState<number>(0)
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [distributing, setDistributing] = useState(false)
  const [showSaveDistributionModal, setShowSaveDistributionModal] = useState(false)
  const [form, setForm] = useState<Omit<PlatformCost, 'platformCostId'>>({
    year: CURRENT_YEAR, categoryName: '', description: '',
    annualCost: 0, allocationMethod: 'ByVolume', isActive: true,
  })

  const { data: summary } = useQuery<CostSummary>({
    queryKey: ['platformCosts', 'summary', year],
    queryFn: () => apiClient.get('/FinanceHub/GetCostAllocationSummary', { params: { year } }).then(r => r.data),
  })

  const costsStore = useMemo(() => new CustomStore({
    key: 'platformCostId',
    load: () => apiClient.get('/FinanceHub/GetPlatformCosts').then(r => r.data),
  }), [])

  const openAdd = useCallback(() => {
    setEditingId(0)
    setForm({ year: CURRENT_YEAR, categoryName: '', description: '', annualCost: 0, allocationMethod: 'ByVolume', isActive: true })
    setShowModal(true)
  }, [])

  const openEdit = useCallback((row: PlatformCost) => {
    setEditingId(row.platformCostId)
    setForm({ year: row.year, categoryName: row.categoryName, description: row.description ?? '', annualCost: row.annualCost, allocationMethod: row.allocationMethod, isActive: row.isActive })
    setShowModal(true)
  }, [])

  const openDelete = useCallback((id: number) => { setDeletingId(id); setShowDeleteModal(true) }, [])

  const saveCost = useCallback(async () => {
    if (!form.categoryName.trim()) { notify('Category name is required', 'warning', 3000); return }
    if (form.annualCost <= 0) { notify('Annual cost must be greater than 0', 'warning', 3000); return }
    const url = editingId === 0 ? '/FinanceHub/CreatePlatformCost' : '/FinanceHub/UpdatePlatformCost'
    const payload = { ...form, platformCostId: editingId }
    const r = await apiClient.post(url, payload)
    if (r.data?.success) {
      notify(r.data.message, 'success', 3000)
      setShowModal(false)
      qc.invalidateQueries({ queryKey: ['platformCosts'] })
    } else {
      notify(r.data?.message ?? 'Save failed', 'error', 3000)
    }
  }, [form, editingId, qc])

  const confirmDelete = useCallback(async () => {
    const r = await apiClient.post('/FinanceHub/DeletePlatformCost', { platformCostId: deletingId })
    if (r.data?.success) {
      notify(r.data.message, 'success', 3000)
      setShowDeleteModal(false)
      qc.invalidateQueries({ queryKey: ['platformCosts'] })
    } else {
      notify(r.data?.message ?? 'Delete failed', 'error', 3000)
    }
  }, [deletingId, qc])

  const distribute = useCallback(async () => {
    setDistributing(true)
    notify('Calculating distribution...', 'info', 1500)
    const r = await apiClient.get('/FinanceHub/GetCostAllocations', { params: { year } })
    if (!r.data?.length) { notify('No integrations found or no platform costs configured', 'warning', 3000); setDistributing(false); return }
    setAllocations(r.data)
    setShowDistribution(true)
    qc.invalidateQueries({ queryKey: ['platformCosts', 'summary', year] })
    notify('Cost distribution calculated successfully', 'success', 2000)
    setDistributing(false)
  }, [year, qc])

  const saveDistribution = useCallback(() => {
    if (!allocations.length) { notify('No distribution data to save', 'warning', 3000); return }
    setShowSaveDistributionModal(true)
  }, [allocations])

  const confirmSaveDistribution = useCallback(async () => {
    setShowSaveDistributionModal(false)
    const payload = { allocations: allocations.map(a => ({ integrationFlowId: a.integrationFlowId, allocatedCost: a.allocatedCost })) }
    const r = await apiClient.post('/FinanceHub/SaveCostAllocation', payload)
    if (r.data?.success) {
      notify(r.data.message, 'success', 3000)
      setShowDistribution(false)
    } else {
      notify(r.data?.message ?? 'Save failed', 'error', 3000)
    }
  }, [allocations])

  return (
    <div style={{
      background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
      minHeight: '100vh', padding: 20,
    }}>
      {/* ── Header ───────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: '#fff', fontWeight: 700, marginBottom: 0 }}>
            <i className="fas fa-coins me-2" />Platform Costs
          </h2>
          <p style={{ color: '#BDC3C7', fontSize: 13, marginBottom: 0, marginTop: 4 }}>
            Manage annual platform costs to distribute across integrations for ROI calculations
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ color: '#BDC3C7', fontSize: 13 }}>Year:</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ background: 'rgba(15,23,42,.8)', border: '1px solid rgba(46,134,193,.3)', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 13 }}>
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={openAdd} style={{ background: 'linear-gradient(135deg,#10B981,#059669)', border: 'none', color: 'white', padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            <i className="fas fa-plus me-1" />Add Cost
          </button>
          <button onClick={distribute} disabled={distributing} style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)', border: 'none', color: 'white', padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: distributing ? 'not-allowed' : 'pointer', opacity: distributing ? .6 : 1 }}>
            <i className={`fas ${distributing ? 'fa-spinner fa-spin' : 'fa-share-alt'} me-1`} />Distribute Costs
          </button>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={cardStyle}>
          <div style={{ color: '#BDC3C7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Total Platform Cost</div>
          <div style={{ color: '#3B82F6', fontSize: 24, fontWeight: 700 }}>{fmt$(summary?.totalPlatformCost)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#BDC3C7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Active Integrations</div>
          <div style={{ color: '#06B6D4', fontSize: 24, fontWeight: 700 }}>{(summary?.totalIntegrations ?? 0).toLocaleString()}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#BDC3C7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Total Transactions</div>
          <div style={{ color: '#F59E0B', fontSize: 24, fontWeight: 700 }}>{(summary?.totalTransactions ?? 0).toLocaleString()}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#BDC3C7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Overall ROI</div>
          <div style={{ color: '#10B981', fontSize: 24, fontWeight: 700 }}>{(summary?.overallROI ?? 0).toFixed(1)}%</div>
        </div>
      </div>

      {/* ── Costs Grid ────────────────────────────────────── */}
      <div style={{ background: '#1E293B', borderRadius: 12, padding: 20, border: '1px solid rgba(46,134,193,.2)', marginBottom: 20 }}>
        <div style={{ marginBottom: 15 }}>
          <h5 style={{ color: '#fff', fontWeight: 600, marginBottom: 2 }}><i className="fas fa-list me-2" />Cost Categories</h5>
          <span style={{ color: '#7f8c8d', fontSize: 12, fontStyle: 'italic' }}>Define platform cost categories and their allocation method</span>
        </div>
        <DataGrid dataSource={costsStore} showBorders showRowLines rowAlternationEnabled hoverStateEnabled columnAutoWidth>
          <FilterRow visible />
          <Paging pageSize={20} />
          <Column dataField="year" caption="Year" width={80} alignment="center" />
          <Column dataField="categoryName" caption="Category" width={200}
            cellRender={({ data }) => <div><i className="fas fa-tag me-2 text-primary" />{data.categoryName}</div>} />
          <Column dataField="description" caption="Description" width={250} />
          <Column dataField="annualCost" caption="Annual Cost" width={140} alignment="right"
            cellRender={({ data }) => <span style={{ fontFamily: 'Consolas,monospace', fontWeight: 600, color: '#10B981' }}>{fmt$(data.annualCost)}</span>} />
          <Column dataField="allocationMethod" caption="Allocation" width={120} alignment="center"
            cellRender={({ data }) => {
              const isVol = data.allocationMethod === 'ByVolume'
              return <span style={{ background: isVol ? 'linear-gradient(135deg,#3B82F6,#2563EB)' : 'linear-gradient(135deg,#8B5CF6,#7C3AED)', color: 'white', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500 }}>{isVol ? 'By Volume' : 'Equal'}</span>
            }} />
          <Column dataField="isActive" caption="Status" width={90} alignment="center"
            cellRender={({ data }) => (
              <span style={{ background: data.isActive ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#6B7280,#4B5563)', color: 'white', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
                {data.isActive ? 'Active' : 'Inactive'}
              </span>
            )} />
          <Column caption="Actions" width={140} alignment="center"
            cellRender={({ data }) => (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <button onClick={() => openEdit(data)} style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)', border: 'none', color: 'white', padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                  <i className="fas fa-edit" />
                </button>
                <button onClick={() => openDelete(data.platformCostId)} style={{ background: 'linear-gradient(135deg,#EF4444,#DC2626)', border: 'none', color: 'white', padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                  <i className="fas fa-trash" />
                </button>
              </div>
            )} />
        </DataGrid>
      </div>

      {/* ── Distribution Results ─────────────────────────── */}
      {showDistribution && (
        <div style={{ background: '#1E293B', borderRadius: 12, padding: 20, border: '1px solid rgba(46,134,193,.2)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <div>
              <h5 style={{ color: '#fff', fontWeight: 600, marginBottom: 2 }}><i className="fas fa-chart-pie me-2" />Cost Distribution Preview</h5>
              <span style={{ color: '#7f8c8d', fontSize: 12, fontStyle: 'italic' }}>Review allocated costs per integration before saving</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveDistribution} style={{ background: 'linear-gradient(135deg,#10B981,#059669)', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                <i className="fas fa-save me-1" />Save Distribution
              </button>
              <button onClick={() => setShowDistribution(false)} style={{ background: 'linear-gradient(135deg,#6B7280,#4B5563)', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                <i className="fas fa-times me-1" />Close
              </button>
            </div>
          </div>
          <DataGrid dataSource={allocations} showBorders showRowLines rowAlternationEnabled hoverStateEnabled columnAutoWidth>
            <Paging pageSize={15} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 15, 50]} showInfo />
            <Column dataField="integrationName" caption="Integration" width={250}
              cellRender={({ data }) => <div><i className="fas fa-plug me-2" style={{ color: '#3B82F6' }} />{data.integrationName}</div>} />
            <Column dataField="transactionCount" caption="Transactions" width={120} alignment="right" format={{ type: 'fixedPoint', precision: 0 }} />
            <Column dataField="avgTransactionValue" caption="Avg Value" width={120} alignment="right"
              cellRender={({ data }) => <span style={{ color: data.avgTransactionValue > 0 ? '#1E293B' : '#9CA3AF' }}>{data.avgTransactionValue > 0 ? fmt$(data.avgTransactionValue) : 'Not set'}</span>} />
            <Column dataField="allocatedCost" caption="Allocated Cost" width={140} alignment="right"
              cellRender={({ data }) => <span style={{ fontWeight: 600, color: '#F59E0B' }}>{fmt$(data.allocatedCost)}</span>} />
            <Column dataField="valueDelivered" caption="Value Delivered" width={140} alignment="right"
              cellRender={({ data }) => <span style={{ fontWeight: 600, color: data.valueDelivered > 0 ? '#10B981' : '#9CA3AF' }}>{data.valueDelivered > 0 ? fmt$(data.valueDelivered) : '—'}</span>} />
            <Column dataField="roi" caption="ROI" width={100} alignment="right"
              cellRender={({ data }) => {
                if (data.roi == null) return <span style={{ color: '#9CA3AF' }}>—</span>
                const color = data.roi >= 100 ? '#10B981' : data.roi >= 0 ? '#F59E0B' : '#EF4444'
                return <span style={{ fontWeight: 700, color }}>{data.roi.toFixed(0)}%</span>
              }} />
            <MasterDetail enabled render={({ data }: { data: AllocationRow }) => <BreakdownDetail data={data} />} />
            <Summary>
              <TotalItem column="transactionCount" summaryType="sum" displayFormat="Total: {0}" valueFormat={{ type: 'fixedPoint', precision: 0 }} />
              <TotalItem column="allocatedCost" summaryType="sum" displayFormat="Total: {0}" valueFormat={{ type: 'currency', precision: 2 }} />
              <TotalItem column="valueDelivered" summaryType="sum" displayFormat="Total: {0}" valueFormat={{ type: 'currency', precision: 2 }} />
            </Summary>
          </DataGrid>
        </div>
      )}

      {/* ── Add/Edit Modal ─────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'linear-gradient(135deg,#1E293B,#0F172A)', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, width: 460, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ borderBottom: '1px solid rgba(46,134,193,.2)', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h5 style={{ color: '#fff', fontWeight: 600, margin: 0 }}>
                <i className={`fas ${editingId === 0 ? 'fa-coins' : 'fa-edit'} me-2`} />
                {editingId === 0 ? 'Add Platform Cost' : 'Edit Platform Cost'}
              </h5>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: .7 }}>&times;</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ color: '#BDC3C7', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Year *</label>
                <select value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))} style={inputStyle}>
                  {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ color: '#BDC3C7', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Category Name *</label>
                <input value={form.categoryName} onChange={e => setForm(f => ({ ...f, categoryName: e.target.value }))} placeholder="e.g., iPaaS License, Event Streaming" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ color: '#BDC3C7', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Optional description" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ color: '#BDC3C7', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Annual Cost (USD) *</label>
                <input type="number" value={form.annualCost || ''} onChange={e => setForm(f => ({ ...f, annualCost: parseFloat(e.target.value) || 0 }))} placeholder="0.00" step="0.01" min={0} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ color: '#BDC3C7', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Allocation Method *</label>
                <select value={form.allocationMethod} onChange={e => setForm(f => ({ ...f, allocationMethod: e.target.value as 'ByVolume' | 'Equal' }))} style={inputStyle}>
                  <option value="ByVolume">By Volume (based on transaction count)</option>
                  <option value="Equal">Equal (split equally among integrations)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#BDC3C7', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                  Active
                </label>
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(46,134,193,.2)', padding: '15px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowModal(false)} style={{ background: 'linear-gradient(135deg,#6B7280,#4B5563)', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveCost} style={{ background: 'linear-gradient(135deg,#10B981,#059669)', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                <i className="fas fa-save me-1" />Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Distribution Confirm Modal ───────────────── */}
      {showSaveDistributionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'linear-gradient(135deg,#1E293B,#0F172A)', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, width: 400 }}>
            <div style={{ borderBottom: '1px solid rgba(46,134,193,.2)', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h5 style={{ color: '#fff', fontWeight: 600, margin: 0 }}><i className="fas fa-save me-2" />Save Distribution</h5>
              <button onClick={() => setShowSaveDistributionModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: .7 }}>&times;</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ color: '#e5e7eb', margin: 0 }}>This will update the monthly platform cost for all integrations. Continue?</p>
            </div>
            <div style={{ borderTop: '1px solid rgba(46,134,193,.2)', padding: '15px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowSaveDistributionModal(false)} style={{ background: 'linear-gradient(135deg,#6B7280,#4B5563)', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmSaveDistribution} style={{ background: 'linear-gradient(135deg,#10B981,#059669)', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                <i className="fas fa-save me-1" />Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ───────────────────────────────────── */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'linear-gradient(135deg,#1E293B,#0F172A)', border: '1px solid rgba(46,134,193,.3)', borderRadius: 12, width: 360 }}>
            <div style={{ borderBottom: '1px solid rgba(46,134,193,.2)', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h5 style={{ color: '#fff', fontWeight: 600, margin: 0 }}><i className="fas fa-trash me-2 text-danger" />Delete Cost</h5>
              <button onClick={() => setShowDeleteModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: .7 }}>&times;</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ color: '#e5e7eb', margin: 0 }}>Are you sure you want to delete this cost category?</p>
            </div>
            <div style={{ borderTop: '1px solid rgba(46,134,193,.2)', padding: '15px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowDeleteModal(false)} style={{ background: 'linear-gradient(135deg,#6B7280,#4B5563)', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmDelete} style={{ background: 'linear-gradient(135deg,#EF4444,#DC2626)', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                <i className="fas fa-trash me-1" />Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
