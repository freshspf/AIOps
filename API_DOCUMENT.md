# SuperBizAgent API 文档

## 基础信息

- **Base URL**: `http://localhost:9900`
- **Content-Type**: `application/json`（除文件上传外）
- **响应格式**: JSON

---

## 通用响应格式

### 成功响应
```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

### 错误响应
```json
{
  "code": 4xx/5xx,
  "message": "错误描述",
  "data": null
}
```

---

## API 接口列表

### 1. 智能对话模块

#### 1.1 普通对话
```http
POST /api/chat
Content-Type: application/json
```

**请求参数:**
```json
{
  "Id": "string (optional)",      // 会话ID，首次对话可留空
  "Question": "string (required)" // 用户问题
}
```

**响应示例:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "success": true,
    "answer": "AI的回答内容...",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "errorMessage": null
  }
}
```

#### 1.2 流式对话（推荐）
```http
POST /api/chat_stream
Content-Type: application/json
```

**请求参数:** 同普通对话

**响应格式:** `text/event-stream` (SSE)

**事件类型:**
| 事件类型 | 说明 |
|---------|------|
| `content` | 内容块，逐字输出 |
| `error` | 错误信息 |
| `done` | 完成标记 |

**SSE 响应示例:**
```
data: {"type":"content","content":"你"}
data: {"type":"content","content":"好"}
data: {"type":"done","content":""}
```

---

### 2. AI 运维模块

#### 2.1 智能运维分析
```http
POST /api/ai_ops
Content-Type: application/json
```

**请求参数:** 无需传入参数

**响应格式:** `text/event-stream` (SSE)

**功能说明:**
- 自动执行告警分析流程
- 多 Agent 协作完成分析
- 生成详细的运维报告

**SSE 事件类型:**
- `content` - 分析过程内容
- `error` - 错误信息
- `done` - 完成标记

---

### 3. 会话管理模块

#### 3.1 清空会话历史
```http
POST /api/chat/clear
Content-Type: application/json
```

**请求参数:**
```json
{
  "Id": "string (required)" // 会话ID
}
```

**响应示例:**
```json
{
  "code": 200,
  "message": "会话历史已清空"
}
```

#### 3.2 获取会话信息
```http
GET /api/chat/session/{sessionId}
```

**路径参数:**
| 参数 | 类型 | 说明 |
|-----|------|------|
| sessionId | string | 会话ID |

**响应示例:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "messagePairCount": 3,
    "createTime": 1640995200000
  }
}
```

---

### 4. 文件管理模块

#### 4.1 文件上传与向量化
```http
POST /api/upload
Content-Type: multipart/form-data
```

**请求参数:**
| 参数 | 类型 | 说明 |
|-----|------|------|
| file | File | 上传的文件 |

**支持格式:** `.txt`, `.md`

**响应示例:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "originalFilename": "document.txt",
    "filePath": "./uploads/document.txt",
    "fileSize": 1024
  }
}
```

**功能说明:**
- 自动文件去重（基于文件名）
- 上传后自动创建向量索引
- 支持覆盖更新

---

### 5. 系统检查模块

#### 5.1 Milvus 健康检查
```http
GET /milvus/health
```

**响应示例:**
```json
{
  "message": "ok",
  "collections": ["biz"]
}
```

---

## 数据模型

### ChatRequest
```typescript
interface ChatRequest {
  Id?: string;        // 会话ID（可选）
  Question: string;   // 用户问题（必填）
}
```

### ChatResponse
```typescript
interface ChatResponse {
  code: number;
  message: string;
  data: {
    success: boolean;
    answer: string;
    sessionId: string;
    errorMessage: string | null;
  };
}
```

### SessionInfo
```typescript
interface SessionInfo {
  sessionId: string;
  messagePairCount: number;  // 消息对数量
  createTime: number;        // 创建时间戳
}
```

### FileUploadResponse
```typescript
interface FileUploadResponse {
  code: number;
  message: string;
  data: {
    originalFilename: string;
    filePath: string;
    fileSize: number;
  };
}
```

---

## 环境变量配置

### 后端所需环境变量
```bash
DASHSCOPE_API_KEY=your-dashscope-api-key  # 阿里云DashScope API密钥
```

---

## WebSocket / SSE 使用说明

### 流式对话 SSE 连接示例

```javascript
const eventSource = new EventSource('http://localhost:9900/api/chat_stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    Question: '你好'
  })
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch(data.type) {
    case 'content':
      // 追加内容
      appendToChat(data.content);
      break;
    case 'error':
      // 处理错误
      showError(data.content);
      break;
    case 'done':
      // 完成流式输出
      eventSource.close();
      break;
  }
};
```

**注意:** SSE 默认只支持 GET 请求，实际实现可能需要使用 fetch + ReadableStream

### 推荐的流式请求实现
```javascript
async function streamChat(question, sessionId = null) {
  const response = await fetch('http://localhost:9900/api/chat_stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      Question: question,
      Id: sessionId
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        handleSSEData(data);
      }
    }
  }
}

function handleSSEData(data) {
  switch(data.type) {
    case 'content':
      // 处理内容块
      console.log(data.content);
      break;
    case 'error':
      // 处理错误
      console.error(data.content);
      break;
    case 'done':
      // 处理完成
      console.log('Stream completed');
      break;
  }
}
```

---

## 前端集成注意事项

### 1. CORS 配置
后端默认运行在 9900 端口，确保后端已配置 CORS 允许前端域名访问。

### 2. 会话管理
- 首次对话时 `Id` 可以为空或 undefined
- 后端会返回新的 `sessionId`
- 后续对话需要带上这个 `sessionId` 以保持上下文

### 3. 文件上传限制
- 支持格式: `.txt`, `.md`
- 文件大小限制由后端配置决定
- 相同文件名会覆盖已存在的文件

### 4. 流式响应处理
- 使用 `/api/chat_stream` 获取实时响应
- 需要处理 SSE 格式的事件流
- 注意连接断开和错误处理

### 5. 错误处理
建议统一处理以下错误码:
- `400` - 请求参数错误
- `500` - 服务器内部错误
- `503` - 服务不可用（如 Milvus 连接失败）

---

## 完整示例

### React 示例代码

```typescript
import { useState, useCallback } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UseChatOptions {
  baseUrl?: string;
}

export function useChat(options?: UseChatOptions) {
  const { baseUrl = 'http://localhost:9900' } = options || {};
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const sendMessage = useCallback(async (question: string) => {
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: question }]);

    // 添加临时助手消息
    const assistantIndex = messages.length + 1;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch(`${baseUrl}/api/chat_stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Question: question, Id: sessionId })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader available');

      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content') {
                fullContent += data.content;
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[assistantIndex] = {
                    role: 'assistant',
                    content: fullContent
                  };
                  return newMessages;
                });
              } else if (data.type === 'done') {
                // 更新 sessionId
                // 可从响应头或额外字段获取
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[assistantIndex] = {
          role: 'assistant',
          content: '抱歉，发生了错误，请稍后重试。'
        };
        return newMessages;
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId, messages.length, baseUrl]);

  const clearSession = useCallback(async () => {
    if (!sessionId) return;
    await fetch(`${baseUrl}/api/chat/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Id: sessionId })
    });
    setMessages([]);
    setSessionId(null);
  }, [sessionId, baseUrl]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      body: formData
    });

    return response.json();
  }, [baseUrl]);

  return {
    messages,
    loading,
    sessionId,
    sendMessage,
    clearSession,
    uploadFile
  };
}
```

---

## 更新日志

| 版本 | 日期 | 说明 |
|-----|------|------|
| 1.0.0 | 2025-03-27 | 初始版本 |

---

## 联系方式

- 项目地址: `/Users/joer/Gitroom/SuperBizAgent`
- 后端端口: `9900`
- 文档生成时间: 2025-03-27
