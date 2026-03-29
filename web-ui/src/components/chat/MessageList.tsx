import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './MessageBubble'
import type { Message } from '@/types'
import { useEffect, useRef } from 'react'

interface MessageListProps {
  messages: Message[]
  isStreaming?: boolean
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <h2 className="font-display text-xl font-semibold">How can I help you today?</h2>
          <p className="text-muted-foreground text-sm">
            Ask me anything about your operations, systems, or upload documents for analysis.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 scrollbar-thin">
      <div ref={scrollRef} className="max-w-4xl mx-auto py-6 px-4 space-y-6">
        {messages.map((message, index) => (
          <div
            key={message.id || index}
            className="message-enter"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <MessageBubble
              message={message}
              isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
            />
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  )
}
