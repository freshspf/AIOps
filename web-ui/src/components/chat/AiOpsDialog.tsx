import React, { useState, useEffect, useRef, createContext, useContext } from 'react'
import { Brain, Activity, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiService } from '@/services/api'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

interface AiOpsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Context to track whether code is inside <pre> (block) or not (inline)
const PreContext = createContext(false)

interface AnalysisStep {
  id: string
  type: 'info' | 'warning' | 'success' | 'error' | 'processing'
  content: string
  timestamp: number
}

function MarkdownCode({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const inPre = useContext(PreContext)

  if (inPre) {
    return <code className={className} {...props}>{children}</code>
  }

  return (
    <code
      className="inline rounded px-1.5 py-px text-[0.85em] font-mono bg-black/[0.06] text-inherit leading-[1.6] dark:bg-white/[0.08]"
      style={{ border: 'none' }}
      {...props}
    >
      {children}
    </code>
  )
}

function MarkdownPre({ children }: { children?: React.ReactNode }) {
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
          <CodeBlock code={codeContent} language={language || 'auto'} className={codeClassName} />
        </pre>
      </div>
    </PreContext.Provider>
  )
}

export function AiOpsDialog({ open, onOpenChange }: AiOpsDialogProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [steps, setSteps] = useState<AnalysisStep[]>([])
  const [currentContent, setCurrentContent] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [steps, currentContent])

  const startAnalysis = async () => {
    setIsRunning(true)
    setSteps([])
    setCurrentContent('')

    setSteps([
      {
        id: 'init',
        type: 'info',
        content: '🚀 初始化 AI 运维分析系统...',
        timestamp: Date.now(),
      },
    ])

    try {
      let fullContent = ''
      const startTime = Date.now()

      for await (const event of apiService.aiOps()) {
        if (event.type === 'content' && event.data) {
          fullContent += event.data
          setCurrentContent(fullContent)
        } else if (event.type === 'error' && event.data) {
          setSteps((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              type: 'error',
              content: `❌ 分析出错: ${event.data}`,
              timestamp: Date.now(),
            },
          ])
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2)

      setSteps((prev) => [
        ...prev,
        {
          id: 'complete',
          type: 'success',
          content: `✅ 分析完成！耗时 ${duration} 秒`,
          timestamp: Date.now(),
        },
      ])
    } catch (error) {
      setSteps((prev) => [
        ...prev,
        {
          id: 'error',
          type: 'error',
          content: `❌ 分析失败: ${error instanceof Error ? error.message : '未知错误'}`,
          timestamp: Date.now(),
        },
      ])
    } finally {
      setIsRunning(false)
    }
  }

  const resetAnalysis = () => {
    setSteps([])
    setCurrentContent('')
  }

  const handleClose = () => {
    if (!isRunning) {
      onOpenChange(false)
      resetAnalysis()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI 智能运维分析
          </DialogTitle>
          <DialogDescription>
            基于 AI Agent 的自动化告警分析和运维建议
          </DialogDescription>
        </DialogHeader>

        {/* 控制按钮 */}
        <div className="flex gap-2 flex-shrink-0">
          <Button
            onClick={startAnalysis}
            disabled={isRunning}
            className="flex-1"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 mr-2" />
                开始分析
              </>
            )}
          </Button>

          {!isRunning && (steps.length > 0 || currentContent) && (
            <Button onClick={resetAnalysis} variant="outline">
              重置
            </Button>
          )}
        </div>

        {/* 分析结果 - 使用原生滚动替代 ScrollArea，避免 Radix Viewport 高度计算问题 */}
        <div className="flex-1 min-h-0 flex flex-col border rounded-lg overflow-hidden">
          {/* 步骤列表 */}
          {steps.length > 0 && (
            <div className="border-b bg-muted/30 p-3 space-y-2 max-h-40 overflow-y-auto flex-shrink-0">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-start gap-2 text-sm animate-fade-in',
                    step.type === 'error' && 'text-red-600',
                    step.type === 'success' && 'text-green-600',
                    step.type === 'warning' && 'text-yellow-600',
                    step.type === 'processing' && 'text-blue-600'
                  )}
                >
                  {step.type === 'success' && <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  {step.type === 'error' && <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  {step.type === 'warning' && <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  {step.type === 'info' && <Activity className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  {step.type === 'processing' && <Loader2 className="w-4 h-4 flex-shrink-0 mt-0.5 animate-spin" />}
                  <span className="flex-1">{step.content}</span>
                </div>
              ))}
              {isRunning && (
                <div className="flex items-start gap-2 text-sm text-blue-600">
                  <Loader2 className="w-4 h-4 flex-shrink-0 mt-0.5 animate-spin" />
                  <span>正在分析系统状态...</span>
                </div>
              )}
            </div>
          )}

          {/* 内容展示 - 使用原生 div overflow-y-auto 替代 Radix ScrollArea */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto p-4"
          >
            {currentContent ? (
              <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre: ({ children }) => <MarkdownPre>{children}</MarkdownPre>,
                    code: ({ className, children, ...props }) => (
                      <MarkdownCode className={className} {...props}>
                        {children}
                      </MarkdownCode>
                    ),
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
                        className="text-amber-600 dark:text-amber-400 font-medium underline underline-offset-2"
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
                  {currentContent}
                </ReactMarkdown>
                {isRunning && (
                  <span className="inline-block w-2 h-4 bg-amber-500 animate-pulse ml-1" />
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                <div className="space-y-3 max-w-sm">
                  <Brain className="w-12 h-12 mx-auto text-amber-500/30" />
                  <p className="text-sm">点击"开始分析"按钮启动 AI 运维分析</p>
                  <p className="text-xs">系统将自动分析告警、日志、指标等数据</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-muted-foreground text-center flex-shrink-0 pt-1">
          分析结果仅供参考，实际运维操作请谨慎执行
        </div>
      </DialogContent>
    </Dialog>
  )
}
