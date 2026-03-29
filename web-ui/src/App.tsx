import { useState } from 'react'
import { Menu, X } from 'lucide-react'
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
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
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
        <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h1 className="font-display font-semibold">SuperBizAgent</h1>
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
