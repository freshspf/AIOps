import { useState, useCallback } from 'react'
import { Upload, FileText, X, Check, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useChat } from '@/hooks/use-chat'
import { cn } from '@/lib/utils'

interface UploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UploadDialog({ open, onOpenChange }: UploadDialogProps) {
  const { uploadFile, uploadProgress, clearUploadProgress } = useChat()
  const [isDragging, setIsDragging] = useState(false)

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files) return

      const file = files[0]
      const validExtensions = ['.txt', '.md']
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()

      if (!validExtensions.includes(fileExtension)) {
        alert('仅支持 .txt 和 .md 格式的文件')
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        alert('文件大小不能超过 10MB')
        return
      }

      await uploadFile(file)

      // 3秒后自动关闭对话框并清除进度
      setTimeout(() => {
        onOpenChange(false)
        clearUploadProgress()
      }, 3000)
    },
    [uploadFile, onOpenChange, clearUploadProgress]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      handleFileSelect(e.dataTransfer.files)
    },
    [handleFileSelect]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileSelect(e.target.files)
    },
    [handleFileSelect]
  )

  const latestUpload = uploadProgress[uploadProgress.length - 1]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>上传文档</DialogTitle>
          <DialogDescription>
            支持 .txt 和 .md 格式，最大 10MB
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 拖拽上传区域 */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'relative border-2 border-dashed rounded-lg p-8 transition-colors',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            )}
          >
            <input
              type="file"
              accept=".txt,.md"
              onChange={handleInputChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={latestUpload?.status === 'uploading'}
            />

            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
                  isDragging
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <Upload className="w-6 h-6" />
              </div>

              {latestUpload?.status === 'uploading' ? (
                <>
                  <p className="font-medium">上传中...</p>
                  <p className="text-sm text-muted-foreground">
                    {latestUpload.progress}%
                  </p>
                  {/* 进度条 */}
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${latestUpload.progress}%` }}
                    />
                  </div>
                </>
              ) : latestUpload?.status === 'success' ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-500 text-white flex items-center justify-center">
                    <Check className="w-6 h-6" />
                  </div>
                  <p className="font-medium text-green-600">上传成功！</p>
                  <p className="text-sm text-muted-foreground">
                    {latestUpload.file.name}
                  </p>
                </>
              ) : latestUpload?.status === 'error' ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <p className="font-medium text-red-600">上传失败</p>
                  <p className="text-sm text-muted-foreground">
                    {latestUpload.error || '未知错误'}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">
                    {isDragging ? '松开以上传' : '拖拽文件到此处'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    或点击选择文件
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 上传历史 */}
          {uploadProgress.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">最近上传</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {uploadProgress.slice(0, -1).reverse().map((up, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate">{up.file.name}</span>
                    {up.status === 'success' ? (
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : up.status === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                clearUploadProgress()
              }}
            >
              关闭
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
