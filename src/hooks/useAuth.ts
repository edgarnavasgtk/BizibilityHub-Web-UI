import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { login as apiLogin, logout as apiLogout, checkAuthStatus } from '../services/authService'
import apiClient from '../services/apiClient'
import { getFilterOptions } from '../services/dashboardService'
import { AllSections } from '../constants/sectionKeys'
import type { SectionKey } from '../constants/sectionKeys'

export function useAuth() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const navigate              = useNavigate()
  const { setUser, logout: storeLogout, isAuthenticated, isAdmin, user } = useAuthStore()

  async function login(email: string, password: string, rememberMe = false) {
    setLoading(true)
    setError(null)
    try {
      await apiLogin({ email, password, rememberMe })

      // Verify auth by calling a protected endpoint
      const ok = await checkAuthStatus()
      if (!ok) {
        setError('Invalid email or password.')
        return
      }

      // Fetch filter options to confirm session + load basic metadata
      await getFilterOptions()

      // Probe an Admin-only endpoint to detect role
      let role: 'Admin' | 'User' = 'User'
      try {
        await apiClient.get('/Admin/GetUsersForGrid')
        role = 'Admin'
      } catch {
        // 403 = authenticated but not admin — that is expected for regular users
      }

      setUser(
        { id: email, displayName: email.split('@')[0], email, role },
        AllSections as unknown as SectionKey[]
      )

      navigate('/dashboard')
    } catch (err: unknown) {
      const isNetworkError = err instanceof Error && (
        err.message.includes('Network Error') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ERR_CONNECTION_REFUSED')
      )
      setError(isNetworkError
        ? 'No se pudo conectar al servidor. Verifica que el backend esté corriendo.'
        : 'Credenciales inválidas. Verifica email y contraseña.')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    try { await apiLogout() } catch { /* ignore */ }
    storeLogout()
    navigate('/login')
  }

  return { login, logout, loading, error, isAuthenticated, isAdmin, user }
}
