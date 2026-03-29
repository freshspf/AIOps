import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { type Message } from '@/types'
import { Bot, User } from 'lucide-react'
import { CodeBlock } from './CodeBlock'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex gap-4 group',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'flex flex-col gap-1 max-w-[80%]',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-4 py-3',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/50 text-foreground'
          )}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code: ({ node, inline, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '')
                    const language = match ? match[1] : 'auto'
                    const code = String(children).replace(/\n$/, '')

                    return !inline ? (
                      <div className="relative group rounded-lg overflow-hidden bg-slate-950 dark:bg-slate-900 border border-slate-800">
                        {/* Header with language tag */}
                        {match && (
                          <div className="absolute top-0 right-0 px-2 py-1 text-xs text-slate-400 bg-slate-800/50 rounded-bl">
                            {language}
                          </div>
                        )}
                        <CodeBlock
                          code={code}
                          language={language}
                          className="block p-3 text-sm overflow-x-auto"
                        />
                      </div>
                    ) : (
                      <code
                        className={cn(
                          'px-1.5 py-0.5 rounded text-sm',
                          'bg-slate-200 dark:bg-slate-800',
                          'font-mono',
                          className
                        )}
                        {...props}
                      >
                        {children}
                      </code>
                    )
                  },
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  h1: ({ children }) => (
                    <h1 className="text-lg font-semibold mb-2 mt-4">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-base font-semibold mb-2 mt-3">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold mb-2 mt-2">{children}</h3>
                  ),
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      className="text-primary underline underline-offset-2"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-primary/30 pl-4 italic my-2">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && <span className="typing-cursor" />}
            </div>
          )}
        </div>

        <span className="text-xs text-muted-foreground px-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <User className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
    </div>
  )
}
