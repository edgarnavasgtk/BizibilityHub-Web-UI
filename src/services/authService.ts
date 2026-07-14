import apiClient from './apiClient'

export interface LoginCredentials {
  email:      string
  password:   string
  rememberMe: boolean
}

async function getCsrfToken(): Promise<string> {
  const res = await apiClient.get<string>('/Account/Login')
  const parser = new DOMParser()
  const doc = parser.parseFromString(res.data, 'text/html')
  return doc.querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]')?.value ?? ''
}

export async function login(credentials: LoginCredentials): Promise<void> {
  const csrf = await getCsrfToken()

  const formData = new URLSearchParams({
    Email:                         credentials.email,
    Password:                      credentials.password,
    RememberMe:                    String(credentials.rememberMe),
    __RequestVerificationToken:    csrf,
  })

  await apiClient.post('/Account/Login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

export async function logout(): Promise<void> {
  // GET the profile page to extract a fresh CSRF token then POST logout
  const res = await apiClient.get<string>('/Account/Profile')
  const parser = new DOMParser()
  const doc = parser.parseFromString(res.data, 'text/html')
  const csrf = doc.querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]')?.value ?? ''

  const formData = new URLSearchParams({ __RequestVerificationToken: csrf })
  await apiClient.post('/Account/Logout', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

export async function checkAuthStatus(): Promise<boolean> {
  try {
    const res = await apiClient.get('/Dashboard/GetFilterOptions')
    return res.status === 200
  } catch {
    return false
  }
}
