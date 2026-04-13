const rawApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()
const DEFAULT_PROD_API_BASE_URL = 'https://visitor-tools-api.onrender.com'

function resolveApiBaseUrl(): string {
  const normalizedEnvBaseUrl = rawApiBaseUrl.replace(/\/+$/, '')
  if (normalizedEnvBaseUrl) return normalizedEnvBaseUrl

  if (typeof window !== 'undefined') {
    const hostname = String(window.location.hostname || '').toLowerCase()
    if (hostname.endsWith('github.io')) {
      return DEFAULT_PROD_API_BASE_URL
    }
  }

  return ''
}

const normalizedApiBaseUrl = resolveApiBaseUrl()

export function apiUrl(path: string): string {
  const trimmedPath = String(path || '').trim()
  if (!trimmedPath) return normalizedApiBaseUrl || '/'

  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath

  const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`
  return normalizedApiBaseUrl ? `${normalizedApiBaseUrl}${normalizedPath}` : normalizedPath
}
