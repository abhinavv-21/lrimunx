import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, setSessionExpiredHandler, tokens } from '@/lib/api'
import { clearCachedData } from '@/lib/offline'
import type { AuthUser, LoginResponse, Role } from '@/types/api'

interface AuthContextValue {
  user: AuthUser | null
  status: 'loading' | 'authenticated' | 'anonymous'

  sessionExpired: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>

  can: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')
  const [sessionExpired, setSessionExpired] = useState(false)

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

          setSessionExpired(true)
        }
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [])

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
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: { refreshToken: tokens.refresh() ?? '' },
      })
    } catch {}
    tokens.clear()

    await clearCachedData()

    setUser(null)
    setStatus('anonymous')

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

export function useIsAdmin(): boolean {
  return useAuth().user?.role === 'ADMIN'
}

export function useCanManageUsers(): boolean {
  const { user } = useAuth()
  return user?.role === 'ADMIN' && user.canManageUsers === true
}
