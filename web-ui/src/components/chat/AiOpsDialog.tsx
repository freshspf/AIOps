import { useState, useEffect, useRef } from 'react'
import { Brain, Activity, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiService } from '@/services/api'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface AiOpsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface AnalysisStep {
  id: string
  type: 'info' | 'warning' | 'success' | 'error' | 'processing'
  content: string
  timestamp: number
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

    // 添加初始步骤
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
      <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI 智能运维分析
          </DialogTitle>
          <DialogDescription>
            基于 AI Agent 的自动化告警分析和运维建议
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 gap-4">
          {/* 控制按钮 */}
          <div className="flex gap-2">
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

          {/* 分析结果 */}
          <div className="flex-1 flex flex-col min-h-0 border rounded-lg overflow-hidden">
            {/* 步骤列表 */}
            {steps.length > 0 && (
              <div className="border-b bg-muted/30 p-3 space-y-2 max-h-40 overflow-y-auto">
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

            {/* 内容展示 */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {currentContent ? (
                <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: ({ node, inline, className, children, ...props }) => {
                        return !inline ? (
                          <div className="relative group/code rounded-lg overflow-hidden my-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            <code
                              className={cn(
                                'block p-4 text-sm font-mono overflow-x-auto text-foreground',
                                className
                              )}
                              {...props}
                            >
                              {children}
                            </code>
                          </div>
                        ) : (
                          <code
                            className={cn(
                              'inline-code font-mono text-sm',
                              className
                            )}
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
            </ScrollArea>
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-muted-foreground text-center">
          分析结果仅供参考，实际运维操作请谨慎执行
        </div>
      </DialogContent>
    </Dialog>
  )
}
