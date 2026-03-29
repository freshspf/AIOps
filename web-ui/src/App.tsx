import { useState } from 'react'
import { Menu, X, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/layout/Sidebar'
import { MessageList } from '@/components/chat/MessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import { AiOpsDialog } from '@/components/chat/AiOpsDialog'
import { useChat } from '@/hooks/use-chat'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiOpsOpen, setAiOpsOpen] = useState(false)
  const { currentMessages, isStreaming } = useChat()

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative z-50 h-full w-72 transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} onAiOpsClick={() => setAiOpsOpen(true)} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border/40 bg-background/80 backdrop-blur-xl flex items-center px-4 gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9 rounded-lg"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-sm">SuperBizAgent</h1>
              <p className="text-[10px] text-muted-foreground">AI 智能运维助手</p>
            </div>
          </div>
        </header>

        {/* Chat area */}
        <MessageList messages={currentMessages} isStreaming={isStreaming} />

        {/* Input area */}
        <ChatInput />
      </div>

      {/* AI Ops Dialog */}
      <AiOpsDialog open={aiOpsOpen} onOpenChange={setAiOpsOpen} />
    </div>
  )
}

export default App
