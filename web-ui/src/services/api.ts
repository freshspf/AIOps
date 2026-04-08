import type {
  ChatRequest,
  ChatResponse,
  Message,
  SessionInfo,
  SessionListResponse,
  FileUploadResponse,
  MilvusHealthResponse,
  SSEEvent,
} from '@/types'
import { generateId } from '@/lib/utils'

const API_BASE_URL = '/api'
const MILVUS_BASE_URL = '/milvus'

/** Parse a single SSE line into an event, or return null if not an event line. */
function parseSSELine(line: string): SSEEvent | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('event:')) return null

  const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
  if (!jsonStr || !jsonStr.startsWith('{')) return null

  try {
    const data = JSON.parse(jsonStr) as SSEEvent
    if (data.type === 'content' && data.data) return { type: 'content', data: data.data }
    if (data.type === 'error' && data.data) return { type: 'error', data: data.data }
    if (data.type === 'done') return { type: 'done' }
    return data
  } catch {
    return null
  }
}

/** Read SSE stream from a fetch Response and yield events. */
async function* readSSEStream(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body reader available')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const event = parseSSELine(line)
        if (event) yield event
      }
    }
  } finally {
    reader.releaseLock()
  }
}

class APIService {
  private baseUrl: string
  private milvusUrl: string

  constructor(baseUrl: string = API_BASE_URL, milvusUrl: string = MILVUS_BASE_URL) {
    this.baseUrl = baseUrl
    this.milvusUrl = milvusUrl
  }

  // ─── Chat ────────────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!response.ok) throw new Error(`Chat request failed: ${response.statusText}`)
    return response.json()
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<SSEEvent> {
    const response = await fetch(`${this.baseUrl}/chat_stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!response.ok) throw new Error(`Stream chat request failed: ${response.statusText}`)
    yield* readSSEStream(response)
  }

  // ─── AI Ops ─────────────────────────────────────────────────

  async *aiOps(): AsyncGenerator<SSEEvent> {
    const response = await fetch(`${this.baseUrl}/ai_ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok) throw new Error(`AI ops request failed: ${response.statusText}`)
    yield* readSSEStream(response)
  }

  // ─── Session Management ─────────────────────────────────────

  async getSession(sessionId: string): Promise<SessionInfo> {
    const response = await fetch(`${this.baseUrl}/chat/session/${sessionId}`)
    if (!response.ok) throw new Error(`Get session failed: ${response.statusText}`)
    const result = await response.json()
    return result.data
  }

  async getSessions(page = 1, pageSize = 20): Promise<SessionListResponse> {
    const response = await fetch(
      `${this.baseUrl}/chat/sessions?page=${page}&pageSize=${pageSize}`
    )
    if (!response.ok) throw new Error(`Get sessions failed: ${response.statusText}`)
    const result = await response.json()
    return result.data
  }

  async getSessionMessages(sessionId: string, limit = 100): Promise<Message[]> {
    const response = await fetch(
      `${this.baseUrl}/chat/messages/${sessionId}?limit=${limit}`
    )
    if (!response.ok) throw new Error(`Get messages failed: ${response.statusText}`)
    const result = await response.json()
    return (result.data || []).map((m: { role: string; content: string; timestamp: number }) => ({
      id: generateId(),
      role: m.role as Message['role'],
      content: m.content,
      timestamp: m.timestamp,
    }))
  }

  async clearSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/chat/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Id: sessionId }),
    })
    if (!response.ok) throw new Error(`Clear session failed: ${response.statusText}`)
  }

  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/chat/session/${sessionId}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error(`Delete session failed: ${response.statusText}`)
  }

  // ─── File Upload ────────────────────────────────────────────

  async uploadFile(file: File, onProgress?: (progress: number) => void): Promise<FileUploadResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const xhr = new XMLHttpRequest()

    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            resolve(JSON.parse(xhr.responseText) as FileUploadResponse)
          } catch {
            reject(new Error('Failed to parse upload response'))
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`))
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Upload request failed')))
      xhr.addEventListener('abort', () => reject(new Error('Upload was aborted')))

      xhr.open('POST', `${this.baseUrl}/upload`)
      xhr.send(formData)
    })
  }

  // ─── Health Check ───────────────────────────────────────────

  async checkMilvusHealth(): Promise<MilvusHealthResponse> {
    const response = await fetch(`${this.milvusUrl}/health`)
    if (!response.ok) throw new Error(`Milvus health check failed: ${response.statusText}`)
    return response.json()
  }
}

export const apiService = new APIService()
