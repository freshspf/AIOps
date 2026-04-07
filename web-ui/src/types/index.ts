// Message types
export type MessageRole = 'user' | 'assistant' | 'system'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: number
}

// Session types
export interface Session {
  sessionId: string
  title: string
  messagePairCount: number
  createTime: number
  updateTime?: number
}

// API Request/Response types
export interface ChatRequest {
  Id?: string
  Question: string
}

export interface ChatResponse {
  code: number
  message: string
  data: {
    success: boolean
    answer: string
    sessionId: string
    errorMessage: string | null
  }
}

export interface SessionInfo {
  sessionId: string
  messagePairCount: number
  createTime: number
}

export interface SessionSummary {
  sessionId: string
  createTime: number
  updateTime: number
  messageCount: number
  firstMessage: string
}

export interface SessionListResponse {
  sessions: SessionSummary[]
  total: number
  page: number
  pageSize: number
}

export interface FileUploadResponse {
  code: number
  message: string
  data: {
    fileName: string
    filePath: string
    fileSize: number
  }
}

export interface MilvusHealthResponse {
  message: string
  collections: string[]
}

// SSE Event types
export interface SSEEvent {
  type: 'content' | 'error' | 'done'
  data?: string
}

// Upload types
export interface UploadProgress {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}
