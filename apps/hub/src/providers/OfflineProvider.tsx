import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { drainQueue, enqueue, queueCount, type QueuedPayload } from '@/lib/offline'
import { useToast } from './ToastProvider'
import { pluralise } from '@/lib/utils'

type SyncState = 'online' | 'offline' | 'syncing'

interface OfflineContextValue {
  state: SyncState
  isOnline: boolean
  pending: number

  queue: (payload: QueuedPayload) => Promise<number>
  sync: () => Promise<void>
  refreshCount: () => Promise<void>
}

const OfflineContext = createContext<OfflineContextValue | null>(null)

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const toast = useToast()
  const queryClient = useQueryClient()

  const pendingRef = useRef(0)
  pendingRef.current = pending

  const refreshCount = useCallback(async () => {
    setPending(await queueCount())
  }, [])

  const sync = useCallback(async () => {
    if (!navigator.onLine || pendingRef.current === 0) return

    setSyncing(true)
    try {
      const result = await drainQueue()
      setPending(result.remaining)

      if (result.synced > 0) {
        toast.success(`${pluralise(result.synced, 'request')} synced`)

        await queryClient.invalidateQueries()
      }
      if (result.remaining > 0) {
        toast.error(
          `${pluralise(result.remaining, 'item')} still queued`,
          'They will be retried automatically when the connection is stable.',
        )
      }
    } finally {
      setSyncing(false)
    }
  }, [queryClient, toast])

  const queue = useCallback(
    async (payload: QueuedPayload) => {
      await enqueue(payload)
      const count = await queueCount()
      setPending(count)
      return count
    },
    [],
  )

  useEffect(() => {
    void refreshCount()

    const handleOnline = () => {
      setIsOnline(true)
      void sync()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (navigator.onLine) void sync()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refreshCount, sync])

  const state: SyncState = syncing ? 'syncing' : isOnline ? 'online' : 'offline'

  const value = useMemo<OfflineContextValue>(
    () => ({ state, isOnline, pending, queue, sync, refreshCount }),
    [state, isOnline, pending, queue, sync, refreshCount],
  )

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}

export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext)
  if (!context) throw new Error('useOffline must be used inside an OfflineProvider')
  return context
}
