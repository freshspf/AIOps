import { useState, useEffect } from 'react'
import { Plus, Activity, FileText, Settings, X, MessageSquare } from 'lucide-react'
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
    <div className="flex h-full flex-col bg-background/95 backdrop-blur-xl border-r border-border/40">
      {/* Header */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-base">SuperBizAgent</h1>
              <p className="text-[10px] text-muted-foreground">AI 智能运维</p>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <Button
          onClick={handleNewSession}
          className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-0 shadow-lg shadow-amber-500/20 rounded-xl h-11"
        >
          <Plus className="w-4 h-4" />
          新建对话
        </Button>
      </div>

      <Separator className="bg-border/40" />

      {/* Sessions List */}
      <ScrollArea className="flex-1 px-3 py-2 scrollbar-thin">
        <div className="space-y-1">
          <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            历史对话
          </p>
          {sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>暂无对话</p>
              <p className="text-xs mt-1">点击上方按钮开始新对话</p>
            </div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => selectSession(session.sessionId)}
                className={`
                  w-full text-left px-3 py-2.5 rounded-xl text-sm
                  transition-all duration-200 ease-out
                  ${
                    session.sessionId === currentSessionId
                      ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 shadow-sm border border-amber-200/50 dark:border-amber-700/50'
                      : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent'
                  }
                `}
              >
                <div className="font-medium truncate text-xs">{session.title}</div>
                <div className="text-[10px] opacity-60 mt-0.5 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {session.messagePairCount} 条消息
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      <Separator className="bg-border/40" />

      {/* Footer */}
      <div className="p-4 space-y-2">
        {/* Milvus Health Indicator */}
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-muted/30">
          <div
            className={`w-2 h-2 rounded-full animate-pulse ${
              milvusHealthy === true
                ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
                : milvusHealthy === false
                  ? 'bg-red-500'
                  : 'bg-amber-500'
            }`}
          />
          <span className="text-xs text-muted-foreground">
            {milvusHealthy === true ? '向量数据库在线' : milvusHealthy === false ? '向量数据库离线' : '检测中...'}
          </span>
        </div>

        <Separator className="bg-border/40" />

        <Button
          variant="ghost"
          className="w-full gap-2 justify-start rounded-xl h-10 text-sm"
          onClick={handleAiOps}
        >
          <FileText className="w-4 h-4" />
          AI 智能运维分析
        </Button>

        <Button variant="ghost" className="w-full gap-2 justify-start rounded-xl h-10 text-sm">
          <Settings className="w-4 h-4" />
          设置
        </Button>
      </div>
    </div>
  )
}
