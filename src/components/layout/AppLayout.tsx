import { Outlet } from 'react-router-dom'

function AppLayout() {
  return (
    <div className="d-flex" style={{ minHeight: '100vh', background: 'var(--gradient-dark)' }}>
      <main className="flex-grow-1">
        {/* Navbar and sidebar will be added in Parte 2 */}
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
