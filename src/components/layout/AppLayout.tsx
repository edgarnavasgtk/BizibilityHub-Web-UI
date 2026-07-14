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
    <div className="dashboard-page">
      <AppNavbar />
      <div className="main-container">
        <Outlet />
      </div>
      <AppFooter />
    </div>
  )
}
