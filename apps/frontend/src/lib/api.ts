import type { ApiErrorBody, LoginResponse } from '@/types/api'

const BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:4000/api/v1'

const ACCESS_KEY = 'munx.accessToken'
const REFRESH_KEY = 'munx.refreshToken'

export class ApiError extends Error {
  readonly code: number
  readonly details?: unknown

  constructor(body: ApiErrorBody) {
    super(body.error)
    this.name = 'ApiError'
    this.code = body.code
    this.details = body.details
  }

  /** True when the failure is a lost connection rather than a server response. */
  get isOffline(): boolean {
    return this.code === 0
  }
}

export const tokens = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  set(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

type SessionExpiredHandler = () => void
let onSessionExpired: SessionExpiredHandler = () => {}
export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler
}

/**
 * Single in-flight refresh. Without this, a page that fires six queries at once
 * on an expired token would trigger six refreshes and five of them would fail
 * against a rotated token.
 */
let refreshInFlight: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokens.refresh()
  if (!refreshToken) return false

  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!response.ok) return false

      const data = (await response.json()) as LoginResponse
      tokens.set(data.accessToken, data.refreshToken)
      return true
    } catch {
      return false
    } finally {
      // Cleared on the next tick so concurrent callers all observe this result.
      setTimeout(() => {
        refreshInFlight = null
      }, 0)
    }
  })()

  return refreshInFlight
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Skip the Authorization header — used by login and refresh. */
  anonymous?: boolean
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return new ApiError({
      error: body.error ?? response.statusText,
      code: body.code ?? response.status,
      details: body.details,
    })
  } catch {
    return new ApiError({ error: response.statusText || 'Request failed', code: response.status })
  }
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, anonymous, headers, ...rest } = options

  const send = async (): Promise<Response> => {
    const accessToken = tokens.access()
    return fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(!anonymous && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  }

  let response: Response
  try {
    response = await send()
  } catch {
    // Network unreachable — code 0 lets callers distinguish offline from a 5xx.
    throw new ApiError({ error: 'You appear to be offline. The request was not sent.', code: 0 })
  }

  if (response.status === 401 && !anonymous) {
    const refreshed = await refreshTokens()
    if (refreshed) {
      response = await send()
    } else {
      tokens.clear()
      onSessionExpired()
      throw await toApiError(response)
    }
  }

  if (!response.ok) throw await toApiError(response)

  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) return (await response.blob()) as T

  return (await response.json()) as T
}

/** Downloads a binary export and triggers a browser save. */
export async function downloadExport(query: string, fallbackName: string): Promise<void> {
  const accessToken = tokens.access()
  const response = await fetch(`${BASE_URL}/exports?${query}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  })

  if (!response.ok) throw await toApiError(response)

  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^"]+)"?/.exec(disposition)
  const blob = await response.blob()

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = match?.[1] ?? fallbackName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export { BASE_URL }
