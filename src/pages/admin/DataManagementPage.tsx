import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DataGrid, {
  Column, Editing, Paging, Pager, FilterRow, SearchPanel, Lookup,
} from 'devextreme-react/data-grid'
import CustomStore from 'devextreme/data/custom_store'
import apiClient from '../../services/apiClient'

const TABS = [
  { id: 0, label: 'Business Segments', icon: 'fas fa-layer-group' },
  { id: 1, label: 'Brands',            icon: 'fas fa-tag' },
  { id: 2, label: 'Business Processes', icon: 'fas fa-cogs' },
  { id: 3, label: 'Subprocesses',      icon: 'fas fa-sitemap' },
  { id: 4, label: 'Document Types',    icon: 'fas fa-file-alt' },
  { id: 5, label: 'Environments',      icon: 'fas fa-server' },
]

const CATEGORY_OPTIONS = ['Invoice', 'Order', 'Shipment', 'Payment', 'Other']
const DIRECTION_OPTIONS = ['Inbound', 'Outbound', 'Both']

function StatusBadge({ value }: { value: boolean }) {
  return (
    <span style={{
      background: value ? 'linear-gradient(135deg,#2ECC71,#27AE60)' : 'linear-gradient(135deg,#E74C3C,#C0392B)',
      color: 'white', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
    }}>
      {value ? 'Active' : 'Inactive'}
    </span>
  )
}

function ColorSwatch({ value }: { value: string }) {
  if (!value) return null
  return (
    <span style={{ width: 24, height: 24, borderRadius: 4, background: value, display: 'inline-block', border: '1px solid rgba(0,0,0,.15)', verticalAlign: 'middle' }} />
  )
}

function makeStore(
  keyField: string,
  loadUrl: string,
  createUrl: string,
  updateUrl: string,
  deleteUrl: string,
) {
  return new CustomStore({
    key: keyField,
    load: () => apiClient.get(loadUrl).then(r => r.data),
    insert: (values) => apiClient.post(createUrl, values).then(r => {
      if (r.data && r.data.success === false) throw new Error(r.data.message || 'Create failed')
      return r.data
    }),
    update: (key, values) => apiClient.put(updateUrl, { ...values, [keyField]: key }).then(r => {
      if (r.data && r.data.success === false) throw new Error(r.data.message || 'Update failed')
    }),
    remove: (key) => apiClient.delete(`${deleteUrl}?id=${key}`).then(r => {
      if (r.data && r.data.success === false) throw new Error(r.data.message || 'Delete failed')
    }),
  })
}

const gridProps = {
  showBorders: true,
  showRowLines: true,
  rowAlternationEnabled: true,
  hoverStateEnabled: true,
  columnAutoWidth: true,
  allowColumnResizing: true,
}

export default function DataManagementPage() {
  const [activeTab, setActiveTab] = useState(0)
  const queryClient = useQueryClient()

  const invalidateSegments = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'businessSegments'] })
  }, [queryClient])

  const invalidateProcesses = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'businessProcesses'] })
  }, [queryClient])

  const { data: segments = [] } = useQuery({
    queryKey: ['admin', 'businessSegments'],
    queryFn: () => apiClient.get('/Admin/GetBusinessSegments').then(r => r.data),
  })

  const { data: processes = [] } = useQuery({
    queryKey: ['admin', 'businessProcesses'],
    queryFn: () => apiClient.get('/Admin/GetBusinessProcesses').then(r => r.data),
  })

  const segmentsStore = useMemo(() => makeStore(
    'businessSegmentId', '/Admin/GetBusinessSegments',
    '/Admin/CreateBusinessSegment', '/Admin/UpdateBusinessSegment', '/Admin/DeleteBusinessSegment',
  ), [])

  const brandsStore = useMemo(() => makeStore(
    'brandId', '/Admin/GetBrands',
    '/Admin/CreateBrand', '/Admin/UpdateBrand', '/Admin/DeleteBrand',
  ), [])

  const processesStore = useMemo(() => makeStore(
    'businessProcessId', '/Admin/GetBusinessProcesses',
    '/Admin/CreateBusinessProcess', '/Admin/UpdateBusinessProcess', '/Admin/DeleteBusinessProcess',
  ), [])

  const subprocessesStore = useMemo(() => makeStore(
    'businessSubprocessId', '/Admin/GetBusinessSubprocesses',
    '/Admin/CreateBusinessSubprocess', '/Admin/UpdateBusinessSubprocess', '/Admin/DeleteBusinessSubprocess',
  ), [])

  const docTypesStore = useMemo(() => makeStore(
    'documentTypeId', '/Admin/GetDocumentTypes',
    '/Admin/CreateDocumentType', '/Admin/UpdateDocumentType', '/Admin/DeleteDocumentType',
  ), [])

  const environmentsStore = useMemo(() => makeStore(
    'environmentId', '/Admin/GetEnvironments',
    '/Admin/CreateEnvironment', '/Admin/UpdateEnvironment', '/Admin/DeleteEnvironment',
  ), [])

  return (
    <div style={{ padding: '2rem', minHeight: 'calc(100vh - 160px)' }}>

      {/* Header */}
      <div className="mb-4">
        <h1 className="h3 text-white mb-1">
          <i className="fas fa-database me-2" />Data Management Hub
        </h1>
        <p className="text-muted mb-0" style={{ fontSize: 14 }}>
          Manage master data including business segments, brands, processes, subprocesses, document types, and environments.
        </p>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3" style={{ borderBottom: '2px solid rgba(46,134,193,.3)' }}>
        {TABS.map((t) => (
          <li key={t.id} className="nav-item">
            <button
              className={`nav-link ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              style={{
                color: activeTab === t.id ? '#2E86C1' : '#94A3B8',
                background: activeTab === t.id ? 'rgba(46,134,193,.15)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === t.id ? '3px solid #2E86C1' : '3px solid transparent',
                fontWeight: activeTab === t.id ? 600 : 400,
                fontSize: 13,
                padding: '8px 16px',
              }}
            >
              <i className={`${t.icon} me-2`} />{t.label}
            </button>
          </li>
        ))}
      </ul>

      {/* Grid card */}
      <div
        className="rounded p-3"
        style={{ background: '#1E293B', border: '1px solid rgba(46,134,193,.2)', boxShadow: '0 4px 16px rgba(0,0,0,.5)' }}
      >

        {activeTab === 0 && (
          <DataGrid
            key="segments"
            dataSource={segmentsStore}
            {...gridProps}
            onRowInserted={invalidateSegments}
            onRowUpdated={invalidateSegments}
            onRowRemoved={invalidateSegments}
          >
            <Editing mode="row" allowAdding allowUpdating allowDeleting useIcons />
            <FilterRow visible />
            <SearchPanel visible width={240} placeholder="Search..." />
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50]} showInfo />
            <Column dataField="businessSegmentId" caption="ID" width={60} allowEditing={false} />
            <Column dataField="segmentName" caption="Name" validationRules={[{ type: 'required' }]} />
            <Column dataField="segmentDescription" caption="Description" />
            <Column
              dataField="segmentColor"
              caption="Color"
              width={100}
              cellRender={({ value }) => <ColorSwatch value={value} />}
              editCellRender={({ value, setValue }) => (
                <input
                  type="color"
                  value={value || '#3498DB'}
                  onChange={(e) => setValue(e.target.value)}
                  style={{ width: '100%', height: 32, border: 'none', padding: 0, cursor: 'pointer' }}
                />
              )}
            />
            <Column
              dataField="isActive"
              caption="Status"
              width={100}
              allowEditing={false}
              cellRender={({ value }) => <StatusBadge value={value} />}
            />
          </DataGrid>
        )}

        {activeTab === 1 && (
          <DataGrid key="brands" dataSource={brandsStore} {...gridProps}>
            <Editing mode="row" allowAdding allowUpdating allowDeleting useIcons />
            <FilterRow visible />
            <SearchPanel visible width={240} placeholder="Search..." />
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50]} showInfo />
            <Column dataField="brandId" caption="ID" width={60} allowEditing={false} />
            <Column dataField="brandName" caption="Name" validationRules={[{ type: 'required' }]} />
            <Column dataField="brandCode" caption="Code" width={100} validationRules={[{ type: 'required' }]} />
            <Column dataField="brandDescription" caption="Description" />
            <Column
              dataField="brandColor"
              caption="Color"
              width={100}
              cellRender={({ value }) => <ColorSwatch value={value} />}
              editCellRender={({ value, setValue }) => (
                <input
                  type="color"
                  value={value || '#3498DB'}
                  onChange={(e) => setValue(e.target.value)}
                  style={{ width: '100%', height: 32, border: 'none', padding: 0, cursor: 'pointer' }}
                />
              )}
            />
            <Column dataField="businessSegmentId" caption="Business Segment" validationRules={[{ type: 'required' }]}>
              <Lookup dataSource={segments} valueExpr="businessSegmentId" displayExpr="segmentName" />
            </Column>
            <Column
              dataField="isActive"
              caption="Status"
              width={100}
              allowEditing={false}
              cellRender={({ value }) => <StatusBadge value={value} />}
            />
          </DataGrid>
        )}

        {activeTab === 2 && (
          <DataGrid
            key="processes"
            dataSource={processesStore}
            {...gridProps}
            onRowInserted={invalidateProcesses}
            onRowUpdated={invalidateProcesses}
            onRowRemoved={invalidateProcesses}
          >
            <Editing mode="row" allowAdding allowUpdating allowDeleting useIcons />
            <FilterRow visible />
            <SearchPanel visible width={240} placeholder="Search..." />
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50]} showInfo />
            <Column dataField="businessProcessId" caption="ID" width={60} allowEditing={false} />
            <Column dataField="processName" caption="Name" validationRules={[{ type: 'required' }]} />
            <Column dataField="processDescription" caption="Description" />
            <Column
              dataField="isActive"
              caption="Status"
              width={100}
              allowEditing={false}
              cellRender={({ value }) => <StatusBadge value={value} />}
            />
          </DataGrid>
        )}

        {activeTab === 3 && (
          <DataGrid key="subprocesses" dataSource={subprocessesStore} {...gridProps}>
            <Editing mode="row" allowAdding allowUpdating allowDeleting useIcons />
            <FilterRow visible />
            <SearchPanel visible width={240} placeholder="Search..." />
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50]} showInfo />
            <Column dataField="businessSubprocessId" caption="ID" width={60} allowEditing={false} />
            <Column dataField="subprocessName" caption="Name" validationRules={[{ type: 'required' }]} />
            <Column dataField="subprocessDescription" caption="Description" />
            <Column dataField="businessProcessId" caption="Business Process" validationRules={[{ type: 'required' }]}>
              <Lookup dataSource={processes} valueExpr="businessProcessId" displayExpr="processName" />
            </Column>
            <Column
              dataField="isActive"
              caption="Status"
              width={100}
              allowEditing={false}
              cellRender={({ value }) => <StatusBadge value={value} />}
            />
          </DataGrid>
        )}

        {activeTab === 4 && (
          <DataGrid key="doctypes" dataSource={docTypesStore} {...gridProps}>
            <Editing mode="row" allowAdding allowUpdating allowDeleting useIcons />
            <FilterRow visible />
            <SearchPanel visible width={240} placeholder="Search..." />
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50]} showInfo />
            <Column dataField="documentTypeId" caption="ID" width={60} allowEditing={false} />
            <Column dataField="typeName" caption="Type Name" validationRules={[{ type: 'required' }]} />
            <Column dataField="description" caption="Description" />
            <Column dataField="category" caption="Category" width={130} validationRules={[{ type: 'required' }]}>
              <Lookup dataSource={CATEGORY_OPTIONS} />
            </Column>
            <Column dataField="direction" caption="Direction" width={120} validationRules={[{ type: 'required' }]}>
              <Lookup dataSource={DIRECTION_OPTIONS} />
            </Column>
            <Column
              dataField="isActive"
              caption="Status"
              width={100}
              allowEditing={false}
              cellRender={({ value }) => <StatusBadge value={value} />}
            />
          </DataGrid>
        )}

        {activeTab === 5 && (
          <DataGrid key="environments" dataSource={environmentsStore} {...gridProps}>
            <Editing mode="row" allowAdding allowUpdating allowDeleting useIcons />
            <FilterRow visible />
            <SearchPanel visible width={240} placeholder="Search..." />
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector allowedPageSizes={[10, 25, 50]} showInfo />
            <Column dataField="environmentId" caption="ID" width={60} allowEditing={false} />
            <Column dataField="environmentName" caption="Name" validationRules={[{ type: 'required' }]} />
            <Column dataField="environmentDescription" caption="Description" />
          </DataGrid>
        )}

      </div>
    </div>
  )
}
