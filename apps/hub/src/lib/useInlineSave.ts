import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/lib/api'
import type { SaveState } from '@/components/ui/SaveIndicator'

const SAVED_FOR_MS = 1600

export interface InlineSave {
  state: SaveState
  error: string | null

  saving: boolean

  save: (work: () => Promise<unknown>) => Promise<void>

  refuse: (message: string) => void

  clearError: () => void
}

export function useInlineSave(fallbackMessage: string, revert: () => void): InlineSave {
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)

  const revertRef = useRef(revert)
  revertRef.current = revert

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const save = useCallback(
    async (work: () => Promise<unknown>) => {
      if (timer.current !== null) clearTimeout(timer.current)
      setState('saving')
      setError(null)
      try {
        await work()
        setState('saved')
        timer.current = setTimeout(() => {
          setState((current) => (current === 'saved' ? 'idle' : current))
        }, SAVED_FOR_MS)
      } catch (caught) {
        setState('error')
        setError(errorMessage(caught, fallbackMessage))
        revertRef.current()
      }
    },
    [fallbackMessage],
  )

  const refuse = useCallback((message: string) => {
    if (timer.current !== null) clearTimeout(timer.current)
    setState('error')
    setError(message)
  }, [])

  const clearError = useCallback(() => {
    setState((current) => (current === 'error' ? 'idle' : current))
    setError(null)
  }, [])

  return { state, error, saving: state === 'saving', save, refuse, clearError }
}
