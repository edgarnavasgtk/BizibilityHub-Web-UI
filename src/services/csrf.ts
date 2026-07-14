import apiClient from './apiClient'

export async function getAntiForgeryToken(pageUrl: string): Promise<string> {
  try {
    const res = await apiClient.get<string>(pageUrl, {
      responseType: 'text',
      headers: { Accept: 'text/html' },
    })
    const html = typeof res.data === 'string' ? res.data : ''
    const m =
      html.match(/name="__RequestVerificationToken"[^>]+value="([^"]+)"/) ??
      html.match(/value="([^"]+)"[^>]+name="__RequestVerificationToken"/)
    return m?.[1] ?? ''
  } catch {
    return ''
  }
}

export function wasRedirected(response: { request?: unknown }, postUrl: string): boolean {
  const xhr = response.request as XMLHttpRequest | undefined
  const finalUrl = xhr?.responseURL ?? ''
  if (!finalUrl) return true // assume success if we can't check
  const path = new URL(finalUrl).pathname
  return !path.toLowerCase().includes(new URL(postUrl, window.location.href).pathname.toLowerCase())
}
