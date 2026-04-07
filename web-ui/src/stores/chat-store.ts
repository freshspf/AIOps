import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Message, Session, UploadProgress } from '@/types'
import { apiService } from '@/services/api'

interface ChatState {
  // Current session
  currentSessionId: string | null
  sessions: Session[]
  messages: Record<string, Message[]>

  // UI state
  isLoading: boolean
  isStreaming: boolean
  currentStreamingMessage: string

  // Upload state
  uploadProgress: UploadProgress[]

  // Milvus health
  milvusHealthy: boolean | null

  // Actions
  setCurrentSession: (sessionId: string | null) => void
  addMessage: (sessionId: string, message: Message) => void
  updateLastMessage: (sessionId: string, content: string) => void
  clearMessages: (sessionId: string) => void
  createSession: () => string
  loadSessions: () => Promise<void>
  loadSessionMessages: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>

  // Chat actions
  sendMessage: (question: string) => Promise<void>
  clearCurrentSession: () => Promise<void>

  // Upload actions
  uploadFile: (file: File) => Promise<void>
  clearUploadProgress: () => void

  // Health check
  checkMilvusHealth: () => Promise<void>
}

/** Convert backend SessionSummary to frontend Session. */
function toSession(s: { sessionId: string; createTime: number; updateTime: number; messageCount: number; firstMessage: string }): Session {
  return {
    sessionId: s.sessionId,
    title: s.firstMessage || '新对话',
    messagePairCount: s.messageCount,
    createTime: s.createTime,
    updateTime: s.updateTime,
  }
}

export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      (set, get) => ({
        currentSessionId: null,
        sessions: [],
        messages: {},
        isLoading: false,
        isStreaming: false,
        currentStreamingMessage: '',
        uploadProgress: [],
        milvusHealthy: null,

        // ─── Session actions ──────────────────────────────────

        setCurrentSession: (sessionId) => {
          set({ currentSessionId: sessionId })
        },

        addMessage: (sessionId, message) => {
          set((state) => ({
            messages: {
              ...state.messages,
              [sessionId]: [...(state.messages[sessionId] || []), message],
            },
          }))
        },

        updateLastMessage: (sessionId, content) => {
          set((state) => {
            const sessionMessages = state.messages[sessionId] || []
            if (sessionMessages.length === 0) return state

            const updatedMessages = [...sessionMessages]
            updatedMessages[updatedMessages.length - 1] = {
              ...updatedMessages[updatedMessages.length - 1],
              content,
            }

            return {
              messages: { ...state.messages, [sessionId]: updatedMessages },
              currentStreamingMessage: content,
            }
          })
        },

        clearMessages: (sessionId) => {
          set((state) => ({
            messages: { ...state.messages, [sessionId]: [] },
          }))
        },

        createSession: () => {
          const sessionId = crypto.randomUUID()
          const newSession: Session = {
            sessionId,
            title: '新对话',
            messagePairCount: 0,
            createTime: Date.now(),
          }

          set((state) => ({
            sessions: [newSession, ...state.sessions],
            currentSessionId: sessionId,
            messages: { ...state.messages, [sessionId]: [] },
          }))

          return sessionId
        },

        loadSessions: async () => {
          try {
            const result = await apiService.getSessions()
            const sessions = result.sessions.map(toSession)
            set({ sessions })
          } catch (error) {
            console.error('Failed to load sessions:', error)
          }
        },

        loadSessionMessages: async (sessionId) => {
          try {
            const msgs = await apiService.getSessionMessages(sessionId)
            set((state) => ({
              messages: { ...state.messages, [sessionId]: msgs },
            }))
          } catch (error) {
            console.error('Failed to load session messages:', error)
          }
        },

        deleteSession: async (sessionId) => {
          try {
            await apiService.deleteSession(sessionId)
            set((state) => {
              const nextMessages = { ...state.messages }
              delete nextMessages[sessionId]

              return {
                sessions: state.sessions.filter((s) => s.sessionId !== sessionId),
                messages: nextMessages,
                currentSessionId:
                  state.currentSessionId === sessionId ? null : state.currentSessionId,
              }
            })
          } catch (error) {
            console.error('Failed to delete session:', error)
          }
        },

        // ─── Chat actions ────────────────────────────────────

        sendMessage: async (question) => {
          const state = get()
          let sessionId = state.currentSessionId

          if (!sessionId) {
            sessionId = state.createSession()
          }

          set({ isLoading: true, isStreaming: true })

          const userMessage: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: question,
            timestamp: Date.now(),
          }
          get().addMessage(sessionId, userMessage)

          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          }
          get().addMessage(sessionId, assistantMessage)

          try {
            let fullContent = ''

            for await (const event of apiService.chatStream({ Question: question, Id: sessionId })) {
              if (event.type === 'content' && event.data) {
                fullContent += event.data
                get().updateLastMessage(sessionId, fullContent)
              } else if (event.type === 'error' && event.data) {
                console.error('Stream error:', event.data)
              }
            }

            // Update session title with first message
            const sessions = get().sessions
            const sessionIndex = sessions.findIndex((s) => s.sessionId === sessionId)
            if (sessionIndex !== -1 && sessions[sessionIndex].title === '新对话') {
              const title = question.slice(0, 50) + (question.length > 50 ? '...' : '')
              set((state) => ({
                sessions: state.sessions.map((s, i) =>
                  i === sessionIndex ? { ...s, title } : s
                ),
              }))
            }

            // Refresh session list from backend to keep metadata in sync
            get().loadSessions()
          } catch (error) {
            console.error('Send message error:', error)
            get().updateLastMessage(sessionId, '抱歉，出了点问题，请重试。')
          } finally {
            set({ isLoading: false, isStreaming: false, currentStreamingMessage: '' })
          }
        },

        clearCurrentSession: async () => {
          const state = get()
          const sessionId = state.currentSessionId

          if (sessionId) {
            await apiService.clearSession(sessionId)
            get().clearMessages(sessionId)
          }
        },

        // ─── Upload actions ──────────────────────────────────

        uploadFile: async (file) => {
          set((state) => ({
            uploadProgress: [
              ...state.uploadProgress,
              { file, progress: 0, status: 'uploading' },
            ],
          }))

          try {
            await apiService.uploadFile(file, (progress) => {
              set((state) => ({
                uploadProgress: state.uploadProgress.map((up) =>
                  up.file === file ? { ...up, progress } : up
                ),
              }))
            })

            set((state) => ({
              uploadProgress: state.uploadProgress.map((up) =>
                up.file === file ? { ...up, status: 'success', progress: 100 } : up
              ),
            }))
          } catch (error) {
            set((state) => ({
              uploadProgress: state.uploadProgress.map((up) =>
                up.file === file
                  ? { ...up, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
                  : up
              ),
            }))
          }
        },

        clearUploadProgress: () => {
          set({ uploadProgress: [] })
        },

        // ─── Health check ────────────────────────────────────

        checkMilvusHealth: async () => {
          try {
            const health = await apiService.checkMilvusHealth()
            set({ milvusHealthy: health.message === 'ok' })
          } catch {
            set({ milvusHealthy: false })
          }
        },
      }),
      {
        name: 'superbizagent-chat',
        partialize: (state) => ({
          sessions: state.sessions,
          messages: state.messages,
        }),
      }
    )
  )
)
