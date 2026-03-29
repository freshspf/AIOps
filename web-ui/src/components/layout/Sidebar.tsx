import { useState, useEffect } from 'react'
import { Plus, Activity, FileText, Settings, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useChat } from '@/hooks/use-chat'

interface SidebarProps {
  onClose?: () => void
  onAiOpsClick?: () => void
}

export function Sidebar({ onClose, onAiOpsClick }: SidebarProps) {
  const {
    sessions,
    currentSessionId,
    selectSession,
    newSession,
    milvusHealthy,
    checkHealth,
  } = useChat()

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30000) // Check every 30s
    return () => clearInterval(interval)
  }, [checkHealth])

  const handleNewSession = () => {
    newSession()
    onClose?.()
  }

  const handleAiOps = () => {
    onAiOpsClick?.()
  }

  return (
    <div className="flex h-full flex-col bg-card border-r border-border">
      {/* Header */}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="font-display font-semibold text-lg">SuperBizAgent</h1>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <Button onClick={handleNewSession} className="w-full gap-2">
          <Plus className="w-4 h-4" />
          New conversation
        </Button>
      </div>

      <Separator />

      {/* Sessions List */}
      <ScrollArea className="flex-1 px-3 py-2 scrollbar-thin">
        <div className="space-y-1">
          {sessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No conversations yet.<br />Start a new one!
            </div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => selectSession(session.sessionId)}
                className={`
                  w-full text-left px-3 py-2 rounded-lg text-sm
                  transition-all duration-200 ease-out
                  transform scale-on-hover
                  ${
                    session.sessionId === currentSessionId
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'hover:bg-muted hover:text-foreground'
                  }
                `}
              >
                <div className="font-medium truncate">{session.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {session.messagePairCount} messages
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="p-4 space-y-3">
        {/* Milvus Health Indicator */}
        <div className="flex items-center gap-2 text-sm">
          <div
            className={`w-2 h-2 rounded-full ${
              milvusHealthy === true
                ? 'bg-green-500'
                : milvusHealthy === false
                  ? 'bg-red-500'
                  : 'bg-yellow-500'
            }`}
          />
          <span className="text-muted-foreground">
            Vector DB: {milvusHealthy === true ? 'Healthy' : milvusHealthy === false ? 'Offline' : 'Checking...'}
          </span>
        </div>

        <Separator />

        <Button
          variant="outline"
          className="w-full gap-2 justify-start"
          onClick={handleAiOps}
        >
          <FileText className="w-4 h-4" />
          AI Ops Analysis
        </Button>

        <Button variant="ghost" className="w-full gap-2 justify-start">
          <Settings className="w-4 h-4" />
          Settings
        </Button>
      </div>
    </div>
  )
}
