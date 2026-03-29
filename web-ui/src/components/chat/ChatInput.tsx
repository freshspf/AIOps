import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useChat } from '@/hooks/use-chat'
import { UploadDialog } from './UploadDialog'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onUpload?: () => void
}

export function ChatInput({ onUpload }: ChatInputProps) {
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
      <div className="border-t border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto p-4">
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setUploadDialogOpen(true)}
              className="flex-shrink-0 scale-on-hover"
            >
              <Paperclip className="w-4 h-4" />
            </Button>

            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Send a message... (Shift+Enter for new line)"
                className="min-h-[44px] max-h-[200px] resize-none pr-12 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              size="icon"
              className={cn(
                'flex-shrink-0 transition-all duration-200 scale-on-hover',
                !input.trim() && 'opacity-50',
                input.trim() && 'shadow-lg shadow-primary/20'
              )}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-2 fade-enter">
            AI-generated content may be inaccurate. Please verify important information.
          </p>
        </div>
      </div>

      <UploadDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} />
    </>
  )
}
