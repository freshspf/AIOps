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

  // Chat actions
  sendMessage: (question: string) => Promise<void>
  clearCurrentSession: () => Promise<void>

  // Upload actions
  uploadFile: (file: File) => Promise<void>
  clearUploadProgress: () => void

  // Health check
  checkMilvusHealth: () => Promise<void>
}

export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        currentSessionId: null,
        sessions: [],
        messages: {},
        isLoading: false,
        isStreaming: false,
        currentStreamingMessage: '',
        uploadProgress: [],
        milvusHealthy: null,

        // Session actions
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
              messages: {
                ...state.messages,
                [sessionId]: updatedMessages,
              },
              currentStreamingMessage: content,
            }
          })
        },

        clearMessages: (sessionId) => {
          set((state) => ({
            messages: {
              ...state.messages,
              [sessionId]: [],
            },
          }))
        },

        createSession: () => {
          const sessionId = crypto.randomUUID()
          const newSession: Session = {
            sessionId,
            title: 'New conversation',
            messagePairCount: 0,
            createTime: Date.now(),
          }

          set((state) => ({
            sessions: [newSession, ...state.sessions],
            currentSessionId: sessionId,
            messages: {
              ...state.messages,
              [sessionId]: [],
            },
          }))

          return sessionId
        },

        loadSessions: async () => {
          // This would load sessions from backend
          // For now, we'll keep sessions in local storage
        },

        // Chat actions
        sendMessage: async (question) => {
          const state = get()
          let sessionId = state.currentSessionId

          // Create new session if none exists
          if (!sessionId) {
            sessionId = state.createSession()
          }

          set({ isLoading: true, isStreaming: true })

          // Add user message
          const userMessage: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: question,
            timestamp: Date.now(),
          }
          get().addMessage(sessionId, userMessage)

          // Add empty assistant message for streaming
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

            // Update session title with first message if it's a new session
            const sessions = get().sessions
            const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId)
            if (sessionIndex !== -1 && sessions[sessionIndex].title === 'New conversation') {
              const title = question.slice(0, 50) + (question.length > 50 ? '...' : '')
              set((state) => ({
                sessions: state.sessions.map((s, i) =>
                  i === sessionIndex ? { ...s, title } : s
                ),
              }))
            }
          } catch (error) {
            console.error('Send message error:', error)
            get().updateLastMessage(sessionId, 'Sorry, something went wrong. Please try again.')
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

        // Upload actions
        uploadFile: async (file) => {
          const uploadId = crypto.randomUUID()

          set((state) => ({
            uploadProgress: [
              ...state.uploadProgress,
              {
                file,
                progress: 0,
                status: 'uploading',
              },
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

        // Health check
        checkMilvusHealth: async () => {
          try {
            const health = await apiService.checkMilvusHealth()
            set({ milvusHealthy: health.message === 'ok' })
          } catch (error) {
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
