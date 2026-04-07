import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useChat } from '@/hooks/use-chat'
import { UploadDialog } from './UploadDialog'
import { cn } from '@/lib/utils'

export function ChatInput() {
  const [input, setInput] = useState('')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { sendMessage, isLoading } = useChat()

  useEffect(() => {
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !isLoading) {
      sendMessage(input.trim())
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <>
      <div className="border-t border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto p-4">
          <form onSubmit={handleSubmit} className="flex gap-3 items-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setUploadDialogOpen(true)}
              className="flex-shrink-0 h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            >
              <Paperclip className="w-5 h-5" />
            </Button>

            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                className="min-h-[44px] max-h-[200px] resize-none pr-14 rounded-xl border-muted/50 bg-muted/30 focus:bg-background focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 transition-all duration-200"
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              size="icon"
              className={cn(
                'flex-shrink-0 h-11 w-11 rounded-xl transition-all duration-200',
                !input.trim() && 'opacity-40 bg-muted hover:bg-muted',
                input.trim() && 'bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-500/25'
              )}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground/60 text-center mt-2.5">
            AI 生成的内容可能不准确，请核实重要信息
          </p>
        </div>
      </div>

      <UploadDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} />
    </>
  )
}
