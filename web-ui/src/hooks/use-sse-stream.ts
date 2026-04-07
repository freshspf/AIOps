import { useState, useCallback } from 'react'
import type { SSEEvent } from '@/types'

export function useSSEStream() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const startStream = useCallback(async (
    requestGenerator: () => AsyncGenerator<SSEEvent>
  ) => {
    setIsStreaming(true)
    setContent('')
    setError(null)

    try {
      const generator = requestGenerator()

      for await (const event of generator) {
        if (event.type === 'content') {
          setContent((prev) => prev + (event.data || ''))
        } else if (event.type === 'error') {
          setError(event.data || 'Stream failed')
        } else if (event.type === 'done') {
          setIsStreaming(false)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stream failed')
    } finally {
      setIsStreaming(false)
    }
  },
  [])

  const reset = useCallback(() => {
    setContent('')
    setError(null)
    setIsStreaming(false)
  }, [])

  return {
    isStreaming,
    content,
    error,
    startStream,
    reset,
  }
}
