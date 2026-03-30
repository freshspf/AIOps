import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import React, { createContext, useContext } from 'react'
import { type Message } from '@/types'
import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

// Context to track whether code is inside <pre> (block) or not (inline)
const PreContext = createContext(false)

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex gap-3 group py-1',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Bot className="w-5 h-5 text-white" />
        </div>
      )}

      <div
        className={cn(
          'flex flex-col gap-1.5 max-w-[85%]',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 shadow-sm',
            isUser
              ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-tr-sm'
              : 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm text-foreground border border-slate-200/50 dark:border-slate-700/50 rounded-tl-sm'
          )}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Block code: <pre><code>...</code></pre>
                  pre: ({ children }) => {
                    // Extract language and content from the <code> child
                    const codeChild = React.Children.toArray(children)[0]
                    if (!React.isValidElement(codeChild)) {
                      return <pre>{children}</pre>
                    }
                    const codeProps = codeChild.props as Record<string, unknown>
                    const codeClassName = (codeProps?.className as string) || ''
                    const match = /language-(\w+)/.exec(codeClassName)
                    const language = match ? match[1] : ''
                    const codeContent = String(codeProps?.children || '').replace(/\n$/, '')

                    return (
                      <PreContext.Provider value={true}>
                        <div className="my-3 rounded-lg overflow-hidden border border-slate-800 bg-[#0d1117]">
                          {match && (
                            <div className="px-3 py-1.5 border-b border-slate-700/50 bg-[#161b22]">
                              <span className="text-xs text-slate-400 font-medium">{language}</span>
                            </div>
                          )}
                          <pre className="p-4 text-sm font-mono overflow-x-auto text-slate-300 m-0">
                            <code className={codeClassName}>{codeContent}</code>
                          </pre>
                        </div>
                      </PreContext.Provider>
                    )
                  },
                  // Both inline and block code land here
                  code: ({ className, children, ...props }) => {
                    const inPre = useContext(PreContext)
                    if (inPre) {
                      // Block code — already rendered by pre component, keep plain
                      return <code className={className} {...props}>{children}</code>
                    }
                    // Inline code — lightweight tag style
                    return (
                      <code
                        className="inline rounded px-1.5 py-px text-[0.85em] font-mono bg-black/[0.06] text-inherit leading-[1.6] dark:bg-white/[0.08]"
                        style={{ border: 'none' }}
                        {...props}
                      >
                        {children}
                      </code>
                    )
                  },
                  p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-slate-700 dark:text-slate-300">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-slate-700 dark:text-slate-300">{children}</ol>,
                  li: ({ children }) => <li className="text-slate-700 dark:text-slate-300">{children}</li>,
                  h1: ({ children }) => (
                    <h1 className="text-xl font-bold mb-3 mt-4 text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-200 dark:border-slate-700">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-lg font-bold mb-2 mt-4 text-slate-900 dark:text-slate-100">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-base font-semibold mb-2 mt-3 text-slate-900 dark:text-slate-100">
                      {children}
                    </h3>
                  ),
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      className="text-amber-600 dark:text-amber-400 font-medium underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-3 border-amber-500/50 pl-4 italic my-3 text-slate-600 dark:text-slate-400 bg-amber-50/50 dark:bg-amber-950/20 py-2 rounded-r">
                      {children}
                    </blockquote>
                  ),
                  table: ({ children }) => (
                    <div className="my-3 overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="px-4 py-2 bg-slate-100 dark:bg-slate-800 font-semibold text-sm text-slate-900 dark:text-slate-100 text-left">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700">
                      {children}
                    </td>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && <span className="typing-cursor" />}
            </div>
          )}
        </div>

        <span className="text-xs text-muted-foreground/70 px-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-lg">
          <User className="w-5 h-5 text-white" />
        </div>
      )}
    </div>
  )
}
