import { useChatStore } from '@/stores/chat-store'

export function useChat() {
  const store = useChatStore()

  const currentMessages = store.currentSessionId
    ? (store.messages[store.currentSessionId] || [])
    : []

  const handleSendMessage = async (question: string) => {
    if (!question.trim() || store.isLoading) return
    await store.sendMessage(question)
  }

  const handleSelectSession = async (sessionId: string) => {
    store.setCurrentSession(sessionId)
    // Load messages from backend if not already cached
    const cached = store.messages[sessionId]
    if (!cached || cached.length === 0) {
      await store.loadSessionMessages(sessionId)
    }
  }

  return {
    // Session state
    currentSessionId: store.currentSessionId,
    sessions: store.sessions,
    currentMessages,
    isLoading: store.isLoading,
    isStreaming: store.isStreaming,
    currentStreamingMessage: store.currentStreamingMessage,

    // Upload state
    uploadProgress: store.uploadProgress,

    // Milvus health
    milvusHealthy: store.milvusHealthy,

    // Actions
    sendMessage: handleSendMessage,
    newSession: () => store.createSession(),
    clearSession: () => store.clearCurrentSession(),
    selectSession: handleSelectSession,
    deleteSession: store.deleteSession,
    loadSessions: store.loadSessions,
    uploadFile: store.uploadFile,
    clearUploadProgress: store.clearUploadProgress,
    checkHealth: store.checkMilvusHealth,
  }
}
