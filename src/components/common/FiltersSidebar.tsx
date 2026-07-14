import { useState, type ReactNode } from 'react'

const LS_KEY = 'financeSidebarCollapsed'

interface Props {
  children: ReactNode
  onRefresh?: () => void
  loading?: boolean
}

export default function FiltersSidebar({ children, onRefresh, loading }: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === 'true' } catch { return false }
  })

  function toggle(next: boolean) {
    setCollapsed(next)
    try { localStorage.setItem(LS_KEY, String(next)) } catch { /* ignore */ }
  }

  return (
    <>
      {/* Collapsed toggle button */}
      {collapsed && (
        <button
          className="btn btn-primary"
          onClick={() => toggle(false)}
          style={{
            position: 'fixed', left: 10, top: 154, zIndex: 999,
            width: 48, height: 48, borderRadius: '0.375rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <i className="fas fa-filter" />
        </button>
      )}

      <aside
        className="filters-sidebar"
        style={{ transform: collapsed ? 'translateX(-320px)' : 'none' }}
      >
        <div className="sidebar-header">
          <h5 className="sidebar-title mb-0">
            <i className="fas fa-filter me-2" />Filters
          </h5>
          <button
            className="btn btn-sm btn-primary sidebar-toggle-btn"
            onClick={() => toggle(true)}
            title="Hide Filters"
          >
            <i className="fas fa-chevron-left" />
          </button>
        </div>

        {children}

        {onRefresh && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
            <button
              className="sidebar-refresh-btn"
              onClick={onRefresh}
              disabled={loading}
            >
              {loading
                ? <><i className="fas fa-spinner fa-spin" />Loading…</>
                : <><i className="fas fa-sync-alt" />Refresh</>
              }
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
