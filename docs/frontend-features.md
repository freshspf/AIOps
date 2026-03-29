# SuperBizAgent 前端功能文档

> 更新时间：2026-03-29

## 📋 功能清单

### 核心功能

| 功能 | 状态 | 说明 |
|------|------|------|
| **智能对话** | ✅ | 基于 RAG 的问答系统 |
| ├── 流式输出 | ✅ | SSE 打字机效果，逐字显示 |
| ├── Markdown 渲染 | ✅ | 支持代码、列表、标题、引用等 |
| ├── 代码高亮 | ✅ | highlight.js 语法高亮（GitHub Dark Dimmed 主题） |
| └── 多轮对话 | ✅ | 会话历史管理 |
| **会话管理** | ✅ | |
| ├── 新建会话 | ✅ | 点击按钮创建新会话 |
| ├── 历史会话列表 | ✅ | 左侧边栏显示所有会话 |
| ├── 切换会话 | ✅ | 点击切换到指定会话 |
| └── 会话标题自动生成 | ✅ | 基于首条消息自动生成 |
| **文件上传** | ✅ | |
| ├── 拖拽上传 | ✅ | 支持拖拽文件到上传区域 |
| ├── 点击上传 | ✅ | 文件选择器 |
| ├── 格式验证 | ✅ | 仅支持 .txt, .md |
| ├── 上传进度 | ✅ | 实时进度条显示 |
| └── 上传历史 | ✅ | 显示已上传文件列表 |
| **AI 智能运维** | ✅ | |
| ├── 一键分析 | ✅ | 点击启动分析 |
| ├── 流式展示 | ✅ | 实时显示分析过程 |
| ├── 步骤状态 | ✅ | info/success/error/processing 状态 |
| └── Markdown 报告 | ✅ | 结构化报告展示 |
| **系统状态** | ✅ | |
| └── Milvus 健康检查 | ✅ | 实时状态指示灯（每 30 秒刷新） |

### UI/UX 功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 响应式布局 | ✅ | 适配桌面和移动端 |
| 移动端侧边栏 | ✅ | 滑动式侧边栏 |
| 深色模式支持 | ✅ | CSS 变量支持（切换按钮待实现） |
| 消息动画 | ✅ | 滑入动画效果 |
| 打字机光标 | ✅ | 流式输出时的闪烁光标 |
| 按钮悬停效果 | ✅ | 缩放动画 |
| 自定义滚动条 | ✅ | 细滚动条样式 |
| 玻璃态效果 | ✅ | 背景模糊效果 |

---

## 🛠️ 技术栈

### 核心框架
- **React 19** - UI 框架
- **TypeScript 5.9** - 类型系统
- **Vite 8** - 构建工具

### UI 组件库
- **shadcn/ui** - 组件库（Button, Input, Card, Dialog, ScrollArea 等）
- **Radix UI** - 无障碍组件基础
- **Tailwind CSS 3** - 样式框架
- **lucide-react** - 图标库

### 状态管理
- **zustand** - 轻量级状态管理

### 功能库
- **react-markdown** - Markdown 渲染
- **remark-gfm** - GitHub Flavored Markdown
- **highlight.js** - 代码语法高亮

---

## 📁 项目结构

```
web-ui/
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn/ui 基础组件
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── card.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   └── separator.tsx
│   │   ├── layout/                # 布局组件
│   │   │   └── Sidebar.tsx
│   │   └── chat/                  # 聊天组件
│   │       ├── ChatInput.tsx
│   │       ├── MessageList.tsx
│   │       ├── MessageBubble.tsx
│   │       ├── UploadDialog.tsx
│   │       ├── AiOpsDialog.tsx
│   │       └── CodeBlock.tsx
│   ├── hooks/
│   │   ├── use-chat.ts            # 聊天逻辑 Hook
│   │   └── use-sse-stream.ts      # SSE 流处理 Hook
│   ├── services/
│   │   └── api.ts                 # API 服务层
│   ├── stores/
│   │   └── chat-store.ts          # Zustand 状态管理
│   ├── types/
│   │   └── index.ts               # TypeScript 类型定义
│   ├── lib/
│   │   └── utils.ts               # 工具函数（cn）
│   ├── App.tsx                    # 主应用组件
│   ├── main.tsx                   # 应用入口
│   └── index.css                  # 全局样式
├── vite.config.ts                 # Vite 配置（含代理）
├── tailwind.config.js             # Tailwind 配置
├── tsconfig.json                  # TypeScript 配置
└── package.json
```

---

## 🔌 API 对接

### 基础配置
```typescript
const API_BASE_URL = '/api'
const MILVUS_BASE_URL = '/milvus'
```

### 代理配置（vite.config.ts）
```typescript
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:9900',
      changeOrigin: true,
    },
    '/milvus': {
      target: 'http://localhost:9900',
      changeOrigin: true,
    },
  },
}
```

### SSE 流式对接

后端发送格式：
```
event: message
data: {"type":"content","data":"你好"}

{"type":"content","data":"！请问"}  // 后端格式不统一
```

前端处理逻辑（兼容两种格式）：
```typescript
// 1. 跳过空行和 event: 行
// 2. 处理 data: 前缀的 JSON
if (line.startsWith('data:')) {
  const jsonStr = line.slice(5).trim()
  const data = JSON.parse(jsonStr)
  yield { type: data.type, data: data.data }
}
// 3. 处理无前缀的 JSON（后端 bug 兼容）
else if (line.trim().startsWith('{')) {
  const data = JSON.parse(line.trim())
  yield { type: data.type, data: data.data }
}
```

---

## 🎨 设计系统

### 颜色主题
```css
/* 主色调 - 温暖琥珀色（区别于通用紫色） */
--primary: 32 95% 52%;

/* 背景色 */
--background: 0 0% 100%;          /* 亮色 */
--card: 0 0% 100%;

/* 文字色 */
--foreground: 222 47% 11%;
--muted-foreground: 215 16% 47%;

/* 边框色 */
--border: 214 32% 91%;
```

### 字体
- **无衬线**: Geist, system-ui
- **等宽**: Geist Mono, ui-monospace
- **显示**: Instrument Serif

### 动画
- 消息滑入: `messageSlideIn 0.3s`
- 打字机光标: `blink 1s step-end infinite`
- 按钮缩放: `scale(1.02)` 悬停

---

## 🚀 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# ESLint 检查
npm run lint
```

---

## 📝 待实现功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 深色模式切换 | 中 | 添加切换按钮 |
| 导出对话 | 低 | 导出为 Markdown/PDF |
| 消息复制 | 低 | 添加复制按钮 |
| 设置页面 | 低 | API Key 配置 |
| 键盘快捷键 | 低 | 如 Ctrl+K 新建会话 |

---

## 🐛 已知问题

### 后端 SSE 格式不统一
**问题**: 后端发送的 SSE 格式不统一，部分数据缺少 `data:` 前缀

**解决方案**: 前端已兼容处理两种格式

### 示例
```
# 格式 1（正确）
data:{"type":"content","data":"你好"}

# 格式 2（不正确，但已兼容）
{"type":"content","data":"！请问"}
```

---

## 🔗 相关文档

- [SuperBizAgent API 文档](../api/SuperBizAgent-API.md)
- [Redis 持久化方案](../redis-persistence-plan.md)
- [主项目文档](../../CLAUDE.md)