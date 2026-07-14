import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import AppNavbar from './AppNavbar'
import AppFooter from './AppFooter'

export default function AppLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      <AppNavbar />
      <div className="main-container">
        <div className="container-fluid">
          <main role="main" className="pb-3">
            <Outlet />
          </main>
        </div>
      </div>
      <AppFooter />
    </>
  )
}
