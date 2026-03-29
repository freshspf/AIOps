import { useEffect, useRef } from 'react'
import hljs from 'highlight.js'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  code: string
  language?: string
  className?: string
}

export function CodeBlock({ code, language = 'auto', className }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (codeRef.current) {
      // Remove previous highlighting
      codeRef.current.removeAttribute('data-highlighted')

      // Apply highlighting
      if (language && language !== 'auto') {
        hljs.highlightElement(codeRef.current)
      } else {
        hljs.highlightAuto(codeRef.current)
      }
    }
  }, [code, language])

  return (
    <code ref={codeRef} className={cn('hljs', className)}>
      {code}
    </code>
  )
}
