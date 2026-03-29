# 前端开发提示词 - SuperBizAgent 项目

## 项目背景

我有一个后端项目 **SuperBizAgent**，需要开发一个配套的现代化前端界面。

### 后端技术栈
- Java 17 + Spring Boot 3.2.0
- Spring AI + Agent 框架
- 阿里云 DashScope AI 服务
- Milvus 向量数据库
- 端口: 9900

### 项目功能
这是一个 **AI 智能运维问答系统**，包含两大核心模块：

1. **RAG 智能问答** - 基于向量数据库的智能文档检索和问答
2. **AIOps 智能运维** - 基于 AI Agent 的自动化告警分析和运维

---

## 后端 API 概览

### Base URL
```
http://localhost:9900
```

### 核心 API 列表

| 接口 | 方法 | 功能 | 说明 |
|------|------|------|------|
| `/api/chat` | POST | 普通对话 | 一次性返回完整回答 |
| `/api/chat_stream` | POST | 流式对话 | SSE 流式输出，推荐使用 |
| `/api/ai_ops` | POST | AI 运维分析 | 自动执行告警分析 |
| `/api/chat/clear` | POST | 清空会话 | 清除当前会话历史 |
| `/api/chat/session/{id}` | GET | 获取会话信息 | 查询会话详情 |
| `/api/upload` | POST | 文件上传 | 上传文档并自动向量化 |
| `/milvus/health` | GET | 健康检查 | Milvus 连接状态 |

### API 响应格式
```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

### 重要：流式 API 处理
`/api/chat_stream` 和 `/api/ai_ops` 返回 **SSE (Server-Sent Events)** 流，需要特殊处理：

```javascript
// SSE 流处理示例
const response = await fetch('http://localhost:9900/api/chat_stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ Question: '用户问题', Id: sessionId })
});

const reader = response.body.getReader();
// 解析 SSE 格式: data: {"type":"content","content":"..."}
```

### 完整 API 文档
后端项目中已生成 `API_DOCUMENT.md`，包含详细接口说明和 TypeScript 类型定义。

---

## 前端功能需求

### 1. 聊天界面（核心功能）

#### 聊天消息展示
- 用户消息和 AI 消息的分区域展示
- AI 回复支持 **Markdown 渲染**（代码高亮、列表、标题等）
- 支持 **流式打字机效果**（逐字显示 AI 回复）
- 消息时间戳显示
- 支持消息复制功能

#### 输入区域
- 多行文本输入框（支持自动高度）
- 发送按钮（支持 Enter 快捷键，Shift+Enter 换行）
- 输入框字符计数/限制提示

#### 会话管理
- 侧边栏显示历史会话列表
- 新建会话按钮
- 切换会话功能
- 清空当前会话按钮
- 会话标题自动生成（基于首条消息）

### 2. AI Ops 智能运维模块

#### 快捷入口
- 顶部或侧边栏提供 **"AI 运维分析"** 按钮
- 点击后自动调用 `/api/ai_ops` 接口
- 展示分析过程的流式输出
- 生成结构化的运维报告展示

### 3. 文件上传模块

#### 上传功能
- 拖拽上传区域
- 点击上传文件选择器
- 支持格式：`.txt`, `.md`
- 文件大小限制提示
- 上传进度显示
- 上传成功/失败反馈

#### 文件管理
- 已上传文件列表
- 显示文件名、大小、上传时间
- 文件删除功能（可选）

### 4. 系统状态模块

#### 状态指示
- Milvus 连接状态（调用 `/milvus/health`）
- API 服务可用性
- 显示在页面顶部或底部状态栏

---

## 技术栈建议

### 方案一：React + Vite（推荐）
```
- React 18
- TypeScript
- Vite 5
- Tailwind CSS 3
- shadcn/ui（组件库）
- @tanstack/react-query（数据请求）
- react-markdown + remark-gfm（Markdown 渲染）
- highlight.js（代码高亮）
- zustand 或 jota（状态管理）
```

**优点**：
- 现代化开发体验，热更新快
- shadcn/ui 提供高质量组件
- TypeScript 类型安全
- 生态成熟

### 方案二：Vue 3 + Vite
```
- Vue 3.4+
- TypeScript
- Vite 5
- Element Plus 或 Naive UI
- VueUse
- Pinia（状态管理）
- markdown-it + highlight.js
```

**优点**：
- 学习曲线平缓
- 组件库丰富
- 性能优秀

### 方案三：Next.js（如需 SSR）
```
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- Server Actions
```

**优点**：
- 支持 SSR/SSG
- 内置路由和优化
- SEO 友好

---

## 设计要求

### 视觉风格
- **现代化、简洁、专业**
- 主色调建议：蓝色系（科技感）
- 支持暗色模式（可选）
- 响应式设计（支持桌面端为主，兼顾平板）

### 页面布局建议
```
┌─────────────────────────────────────────────────────┐
│  Header: Logo + AI Ops 按钮 + 状态指示              │
├──────────┬──────────────────────────────────────────┤
│          │                                           │
│  侧边栏   │           主聊天区域                      │
│          │                                           │
│ - 新建   │  ┌─────────────────────────────────────┐ │
│ - 历史   │  │  消息列表（可滚动）                   │ │
│          │  │                                     │ │
│ - 上传   │  └─────────────────────────────────────┘ │
│          │                                           │
│          │  ┌─────────────────────────────────────┐ │
│          │  │  输入框                              │ │
│          │  │  [发送]                             │ │
│          │  └─────────────────────────────────────┘ │
└──────────┴──────────────────────────────────────────┘
```

### 交互细节
- 流式回复的打字机效果要流畅
- 加载状态要有骨架屏或 Loading 动画
- 错误提示要友好（Toast 或 Alert）
- 操作反馈要及时（按钮点击态等）

---

## 开发建议

### 项目结构
```
frontend/
├── src/
│   ├── components/       # 通用组件
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInput.tsx
│   │   ├── Sidebar.tsx
│   │   └── FileUpload.tsx
│   ├── hooks/           # 自定义 Hooks
│   │   └── useChat.ts
│   ├── services/        # API 服务
│   │   └── api.ts
│   ├── types/           # TypeScript 类型
│   │   └── index.ts
│   ├── stores/          # 状态管理
│   │   └── chatStore.ts
│   ├── utils/           # 工具函数
│   │   └── sse.ts
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 关键实现点

1. **SSE 流式处理**：封装 `useStreamChat` Hook 处理 SSE 事件流
2. **会话持久化**：使用 localStorage 保存会话历史
3. **Markdown 渲染**：使用 react-markdown + highlight.js
4. **状态管理**：使用 zustand 管理会话和消息状态
5. **错误处理**：统一错误处理和用户提示

---

## 参考资源

### 后端项目
- 路径: `/Users/joer/Gitroom/SuperBizAgent`
- API 文档: `API_DOCUMENT.md`

### UI 参考风格
- ChatGPT 界面布局
- Claude 界面风格
- Vercel v0 设计风格

---

## 开始开发

请基于以上需求，帮我：
1. 确定最终的技术栈
2. 搭建项目脚手架
3. 实现核心功能组件
4. 完成基本交互和样式
5. 接入后端 API 进行联调

如果需要更多信息或澄清需求，请随时告诉我。