import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.isOffline) return false
          if (error.code >= 400 && error.code < 500) return false
        }
        return failureCount < 2
      },
    },
    mutations: {
      retry: false,
      networkMode: 'always',
    },
  },
})
