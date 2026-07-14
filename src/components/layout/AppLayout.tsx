import { useEffect } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { AllSections } from '../../constants/sectionKeys'
import type { SectionKey } from '../../constants/sectionKeys'
import apiClient from '../../services/apiClient'
import AppNavbar from './AppNavbar'
import AppFooter from './AppFooter'

export default function AppLayout() {
  const { isAuthenticated, isAdmin, user, setUser } = useAuthStore()

  // If user is authenticated but isAdmin hasn't been verified yet (stale localStorage),
  // re-probe the Admin endpoint once on mount.
  useEffect(() => {
    if (!isAuthenticated || isAdmin || !user) return
    apiClient
      .get('/Admin/GetUsersForGrid')
      .then(() => setUser({ ...user, role: 'Admin' }, AllSections as unknown as SectionKey[]))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

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
