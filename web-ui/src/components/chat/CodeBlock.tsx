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
    // Skip if code is not a valid string
    if (typeof code !== 'string' || !codeRef.current) {
      return
    }

    try {
      // Remove previous highlighting
      codeRef.current.removeAttribute('data-highlighted')

      // Ensure textContent is set (React may not have set it yet)
      if (codeRef.current.textContent !== code) {
        codeRef.current.textContent = code
      }

      // Set language class if specified and valid
      if (language && language !== 'auto' && hljs.getLanguage(language)) {
        codeRef.current.classList.add(`language-${language}`)
      }

      // Apply highlighting (auto-detects language if no class is set)
      hljs.highlightElement(codeRef.current)
    } catch (error) {
      // Fallback: just show plain code if highlighting fails
      console.warn('Code highlighting failed:', error)
    }
  }, [code, language])

  return (
    <code
      ref={codeRef}
      className={cn('hljs font-mono text-sm leading-relaxed', className)}
    >
      {code || ''}
    </code>
  )
}
