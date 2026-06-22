const rawApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()
const DEFAULT_PROD_API_BASE_URL = 'https://visitor-tools-api.onrender.com'

function isLocalApiUrl(url: string): boolean {
  const normalized = String(url || '').trim()
  if (!normalized) return false

  try {
    const hostname = new URL(normalized).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

function resolveApiBaseUrl(): string {
  const normalizedEnvBaseUrl = rawApiBaseUrl.replace(/\/+$/, '')

  if (typeof window !== 'undefined') {
    const hostname = String(window.location.hostname || '').toLowerCase()

    if (hostname.endsWith('github.io')) {
      if (normalizedEnvBaseUrl && !isLocalApiUrl(normalizedEnvBaseUrl)) {
        return normalizedEnvBaseUrl
      }

      return DEFAULT_PROD_API_BASE_URL
    }

    if (normalizedEnvBaseUrl) return normalizedEnvBaseUrl

    return ''
  }

  if (normalizedEnvBaseUrl) {
    return normalizedEnvBaseUrl
  }

  return DEFAULT_PROD_API_BASE_URL
}

const normalizedApiBaseUrl = resolveApiBaseUrl()

export function apiUrl(path: string): string {
  const trimmedPath = String(path || '').trim()
  if (!trimmedPath) return normalizedApiBaseUrl || '/'

  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath

  const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`
  return normalizedApiBaseUrl ? `${normalizedApiBaseUrl}${normalizedPath}` : normalizedPath
}
