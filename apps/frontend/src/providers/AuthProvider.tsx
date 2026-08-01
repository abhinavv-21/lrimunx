import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, setSessionExpiredHandler, tokens } from '@/lib/api'
import type { AuthUser, LoginResponse, Role } from '@/types/api'

interface AuthContextValue {
  user: AuthUser | null
  status: 'loading' | 'authenticated' | 'anonymous'
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Role check used to gate navigation and actions in the UI. */
  can: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')

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
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      // Signing out must succeed locally even if the network call does not.
    }
    tokens.clear()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const can = useCallback((...roles: Role[]) => (user ? roles.includes(user.role) : false), [user])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, can }),
    [user, status, login, logout, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
