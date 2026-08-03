import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Never retry a request the server rejected on its merits, and never
        // retry while offline — the connection listener drives recovery.
        if (error instanceof ApiError) {
          if (error.isOffline) return false
          if (error.code >= 400 && error.code < 500) return false
        }
        return failureCount < 2
      },
    },
    mutations: {
      retry: false,
      /*
        Send it and let it fail, rather than holding it until the network comes
        back.

        React Query's default network mode PAUSES a mutation while the browser
        reports itself offline: no request is made and the promise never
        settles. Every inline-saving control in the hub awaits that promise to
        decide what to show, so an edit made on a flaky venue wifi sat on
        "Saving" indefinitely with its inputs disabled — no error, no way to
        undo it, and no way to retype it. When the connection returned the
        held mutation fired, so a delegate could be moved minutes after the
        operator gave up and walked away.

        `apiFetch` already turns an unreachable API into an ApiError with code
        0, and the two writes that are genuinely meant to survive being offline
        — a logistics request and an attendance check-in — call it directly and
        queue on that error in Dexie. Everything else is an admin edit, which
        `lib/offline.ts` states must fail fast so that two people cannot both
        believe they hold the truth. This makes that true.
      */
      networkMode: 'always',
    },
  },
})
