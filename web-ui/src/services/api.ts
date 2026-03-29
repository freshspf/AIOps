import type {
  ChatRequest,
  ChatResponse,
  SessionInfo,
  FileUploadResponse,
  MilvusHealthResponse,
  SSEEvent,
} from '@/types'

const API_BASE_URL = '/api'
const MILVUS_BASE_URL = '/milvus'

class APIService {
  private baseUrl: string
  private milvusUrl: string

  constructor(baseUrl: string = API_BASE_URL, milvusUrl: string = MILVUS_BASE_URL) {
    this.baseUrl = baseUrl
    this.milvusUrl = milvusUrl
  }

  /**
   * Send a regular chat request (non-streaming)
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Send a streaming chat request
   * Returns an async generator that yields SSE events
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<SSEEvent> {
    console.log('🚀 Starting chat stream request:', request)

    const response = await fetch(`${this.baseUrl}/chat_stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    console.log('📡 Response status:', response.status)
    console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      throw new Error(`Stream chat request failed: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body reader available')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('✅ Stream completed')
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk
        console.log('📦 Raw chunk:', chunk)
        console.log('📦 Current buffer:', buffer)

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        console.log('📝 Lines to process:', lines)

        for (const line of lines) {
          console.log('🔍 Processing line:', repr(line))

          // 跳过空行和事件类型行
          if (!line.trim()) {
            console.log('⏭️  Skipping empty line')
            continue
          }

          if (line.startsWith('event:')) {
            console.log('⏭️  Skipping event line')
            continue
          }

          // 解析 data: 开头的行
          if (line.startsWith('data:')) {
            try {
              const jsonStr = line.slice(5).trim()  // Remove "data:" prefix
              console.log('📄 JSON string (with data:):', repr(jsonStr))

              if (!jsonStr || jsonStr === '') {
                console.log('⏭️  Skipping empty data line')
                continue
              }

              const data = JSON.parse(jsonStr) as SSEEvent
              console.log('✅ Parsed SSE event:', data)

              // 转换后端格式到前端期望的格式
              if (data.type === 'content' && data.data) {
                console.log('💬 Yielding content:', repr(data.data))
                yield { type: 'content', data: data.data }
              } else if (data.type === 'error' && data.data) {
                console.log('❌ Yielding error:', data.data)
                yield { type: 'error', data: data.data }
              } else if (data.type === 'done') {
                console.log('🏁 Yielding done')
                yield { type: 'done' }
              } else {
                console.log('⚠️  Unknown event type, yielding as-is:', data)
                yield data
              }
            } catch (error) {
              console.error('❌ Failed to parse SSE data:', repr(line), error)
            }
          } else if (line.trim().startsWith('{')) {
            // 处理没有 data: 前缀的 JSON 行（后端格式不一致）
            try {
              console.log('📄 Found JSON without data: prefix, trying to parse:', repr(line.trim()))
              const data = JSON.parse(line.trim()) as SSEEvent
              console.log('✅ Parsed SSE event (without prefix):', data)

              if (data.type === 'content' && data.data) {
                console.log('💬 Yielding content:', repr(data.data))
                yield { type: 'content', data: data.data }
              } else if (data.type === 'error' && data.data) {
                console.log('❌ Yielding error:', data.data)
                yield { type: 'error', data: data.data }
              } else if (data.type === 'done') {
                console.log('🏁 Yielding done')
                yield { type: 'done' }
              } else {
                console.log('⚠️  Unknown event type, yielding as-is:', data)
                yield data
              }
            } catch (error) {
              console.error('❌ Failed to parse SSE data (without prefix):', repr(line), error)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Send an AI ops analysis request (streaming)
   */
  async *aiOps(): AsyncGenerator<SSEEvent> {
    console.log('🔧 Starting AI Ops analysis request')

    const response = await fetch(`${this.baseUrl}/ai_ops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    console.log('📡 AI Ops Response status:', response.status)

    if (!response.ok) {
      throw new Error(`AI ops request failed: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body reader available')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('✅ AI Ops Stream completed')
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          // 跳过空行和事件类型行
          if (!line.trim() || line.startsWith('event:')) {
            continue
          }

          // 解析 data: 开头的行
          if (line.startsWith('data:')) {
            try {
              const jsonStr = line.slice(5).trim()  // Remove "data:" prefix

              if (!jsonStr || jsonStr === '') {
                continue
              }

              const data = JSON.parse(jsonStr) as SSEEvent

              // 转换后端格式到前端期望的格式
              if (data.type === 'content' && data.data) {
                yield { type: 'content', data: data.data }
              } else if (data.type === 'error' && data.data) {
                yield { type: 'error', data: data.data }
              } else if (data.type === 'done') {
                yield { type: 'done' }
              } else {
                yield data
              }
            } catch (error) {
              console.error('Failed to parse SSE data:', line, error)
            }
          } else if (line.trim().startsWith('{')) {
            // 处理没有 data: 前缀的 JSON 行（后端格式不一致）
            try {
              const data = JSON.parse(line.trim()) as SSEEvent

              if (data.type === 'content' && data.data) {
                yield { type: 'content', data: data.data }
              } else if (data.type === 'error' && data.data) {
                yield { type: 'error', data: data.data }
              } else if (data.type === 'done') {
                yield { type: 'done' }
              } else {
                yield data
              }
            } catch (error) {
              console.error('Failed to parse SSE data (without prefix):', line, error)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Get session information
   */
  async getSession(sessionId: string): Promise<SessionInfo> {
    const response = await fetch(`${this.baseUrl}/chat/session/${sessionId}`)

    if (!response.ok) {
      throw new Error(`Get session failed: ${response.statusText}`)
    }

    const result = await response.json()
    return result.data
  }

  /**
   * Clear session history
   */
  async clearSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/chat/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Id: sessionId }),
    })

    if (!response.ok) {
      throw new Error(`Clear session failed: ${response.statusText}`)
    }
  }

  /**
   * Upload a file for vectorization
   */
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
            const response = JSON.parse(xhr.responseText) as FileUploadResponse
            resolve(response)
          } catch (error) {
            reject(new Error('Failed to parse upload response'))
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Upload request failed'))
      })

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload was aborted'))
      })

      xhr.open('POST', `${this.baseUrl}/upload`)
      xhr.send(formData)
    })
  }

  /**
   * Check Milvus health status
   */
  async checkMilvusHealth(): Promise<MilvusHealthResponse> {
    const response = await fetch(`${this.milvusUrl}/health`)

    if (!response.ok) {
      throw new Error(`Milvus health check failed: ${response.statusText}`)
    }

    return response.json()
  }
}

// Helper function to safely represent strings for logging
function repr(str: string): string {
  return JSON.stringify(str)
}

// Export singleton instance
export const apiService = new APIService()
