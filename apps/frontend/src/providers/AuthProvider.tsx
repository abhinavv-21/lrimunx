import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, setSessionExpiredHandler, tokens } from '@/lib/api'
import { clearCachedData } from '@/lib/offline'
import type { AuthUser, LoginResponse, Role } from '@/types/api'

interface AuthContextValue {
  user: AuthUser | null
  status: 'loading' | 'authenticated' | 'anonymous'
  /**
   * True when the session ended on its own rather than by signing out.
   *
   * Without it, an expired token dropped the operator onto a blank sign-in
   * screen mid-task with no explanation — indistinguishable from the hub having
   * logged them out for no reason, or from having navigated somewhere wrong.
   */
  sessionExpired: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Role check used to gate navigation and actions in the UI. */
  can: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')
  const [sessionExpired, setSessionExpired] = useState(false)

  // Restore the session on load. A stored token may be expired or revoked, so
  // this is verified against the server rather than trusted.
  useEffect(() => {
    let cancelled = false

    async function restore() {
      if (!tokens.access()) {
        if (!cancelled) setStatus('anonymous')
        return
      }
      try {
        const me = await apiFetch<AuthUser>('/auth/me')
        if (!cancelled) {
          setUser(me)
          setStatus('authenticated')
        }
      } catch {
        tokens.clear()
        if (!cancelled) {
          setUser(null)
          setStatus('anonymous')
          // There WAS a token and the server rejected it — the same fact as an
          // expiry mid-session, and worth the same one-line explanation rather
          // than a sign-in screen that looks like the hub forgot them.
          setSessionExpired(true)
        }
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  // When a refresh fails mid-session, drop straight back to the sign-in screen.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null)
      setStatus('anonymous')
      setSessionExpired(true)
    })
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const response = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      anonymous: true,
      body: { username, password },
    })
    tokens.set(response.accessToken, response.refreshToken)
    setUser(response.user)
    setStatus('authenticated')
    setSessionExpired(false)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      // Signing out must succeed locally even if the network call does not.
    }
    tokens.clear()

    /*
      Clearing the tokens is not the same as clearing the data.

      The service worker caches delegate, committee and attendance responses
      for six hours so the hub keeps working in a venue with no signal. Those
      responses carry names, emails, phone numbers, dietary and accessibility
      notes, and they outlive the session that fetched them — on the shared
      laptop at a registration desk, the next person to sign in could read the
      previous one's roster straight out of Cache Storage, offline.

      Best-effort on purpose: a failure here must not strand someone signed in.
    */
    await clearCachedData()

    setUser(null)
    setStatus('anonymous')
    // Signing out on purpose is not an expiry — no notice on the login screen.
    setSessionExpired(false)
  }, [])

  const can = useCallback((...roles: Role[]) => (user ? roles.includes(user.role) : false), [user])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, sessionExpired, login, logout, can }),
    [user, status, sessionExpired, login, logout, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
