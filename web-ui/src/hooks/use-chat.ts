import { useChatStore } from '@/stores/chat-store'
import type { Message } from '@/types'

export function useChat() {
  const {
    currentSessionId,
    sessions,
    messages,
    isLoading,
    isStreaming,
    currentStreamingMessage,
    uploadProgress,
    milvusHealthy,
    setCurrentSession,
    createSession,
    sendMessage,
    clearCurrentSession,
    uploadFile,
    clearUploadProgress,
    checkMilvusHealth,
  } = useChatStore()

  const currentMessages = currentSessionId ? (messages[currentSessionId] || []) : []

  const handleSendMessage = async (question: string) => {
    if (!question.trim() || isLoading) return
    await sendMessage(question)
  }

  const handleNewSession = () => {
    const sessionId = createSession()
    return sessionId
  }

  const handleClearSession = async () => {
    if (currentSessionId) {
      await clearCurrentSession()
    }
  }

  const handleUploadFile = async (file: File) => {
    await uploadFile(file)
  }

  return {
    // Session state
    currentSessionId,
    sessions,
    currentMessages,
    isLoading,
    isStreaming,
    currentStreamingMessage,

    // Upload state
    uploadProgress,

    // Milvus health
    milvusHealthy,

    // Actions
    sendMessage: handleSendMessage,
    newSession: handleNewSession,
    clearSession: handleClearSession,
    selectSession: setCurrentSession,
    uploadFile: handleUploadFile,
    clearUploadProgress,
    checkHealth: checkMilvusHealth,
  }
}
