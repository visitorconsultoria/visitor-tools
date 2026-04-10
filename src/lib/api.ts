const rawApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '')

export function apiUrl(path: string): string {
  const trimmedPath = String(path || '').trim()
  if (!trimmedPath) return normalizedApiBaseUrl || '/'

  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath

  const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`
  return normalizedApiBaseUrl ? `${normalizedApiBaseUrl}${normalizedPath}` : normalizedPath
}
