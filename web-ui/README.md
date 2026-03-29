# SuperBizAgent Frontend

> 现代化的 AI 智能运维问答系统前端界面

基于 React 19 + TypeScript + Vite 5 构建，提供流畅的 SSE 流式对话体验。

![React](https://img.shields.io/badge/React-19.2.4-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue)
![Vite](https://img.shields.io/badge/Vite-8.0.3-646CFF)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4.19-38BDF8)

---

## 🚀 快速开始

### 前置要求

确保你的环境已安装：

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0

```bash
# 检查版本
node --version
npm --version
```

### 启动步骤

#### 1. 安装依赖

```bash
cd web-ui
npm install
```

如果安装速度慢，可以使用国内镜像：

```bash
npm install --registry=https://registry.npmmirror.com
```

#### 2. 确保后端服务运行

前端需要后端 API 支持，请确保后端服务运行在 `http://localhost:9900`

```bash
# 在项目根目录
cd /Users/joer/Gitroom/SuperBizAgent
mvn spring-boot:run
```

#### 3. 启动前端开发服务器

```bash
npm run dev
```

启动成功后，访问：**http://localhost:5173/**

你应该能看到：
- 左侧边栏（会话列表）
- 主聊天区域
- 底部输入框

---

## 📦 项目结构

```
web-ui/
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn/ui 基础组件
│   │   ├── layout/                # 布局组件
│   │   └── chat/                  # 聊天相关组件
│   ├── hooks/                     # React Hooks
│   ├── services/                  # API 服务层
│   ├── stores/                    # Zustand 状态管理
│   ├── types/                     # TypeScript 类型
│   ├── lib/                       # 工具函数
│   ├── App.tsx                    # 主应用
│   ├── main.tsx                   # 入口文件
│   └── index.css                  # 全局样式
├── public/                         # 静态资源
├── index.html                      # HTML 模板
├── vite.config.ts                  # Vite 配置
├── tailwind.config.js              # Tailwind 配置
└── package.json
```

---

## 🛠️ 可用脚本

```bash
# 启动开发服务器 (热更新)
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 运行 ESLint
npm run lint
```

---

## 🎨 核心功能

### 1. 智能对话
- ✅ SSE 流式输出（打字机效果）
- ✅ Markdown 渲染
- ✅ 代码语法高亮
- ✅ 多轮对话支持

### 2. 会话管理
- ✅ 新建会话
- ✅ 历史会话列表
- ✅ 会话切换
- ✅ 自动标题生成

### 3. 文件上传
- ✅ 拖拽上传
- ✅ 点击选择
- ✅ 上传进度显示
- ✅ 支持 .txt / .md 格式

### 4. AI 运维分析
- ✅ 一键启动分析
- ✅ 实时分析进度
- ✅ 结构化报告展示

### 5. 系统状态
- ✅ Milvus 健康检查
- ✅ 每 30 秒自动刷新

---

## 🔧 配置说明

### API 代理

Vite 开发服务器会自动代理请求到后端：

```typescript
// vite.config.ts
server: {
  port: 5173,
  proxy: {
    '/api': 'http://localhost:9900',
    '/milvus': 'http://localhost:9900',
  },
}
```

### 环境变量

前端通过代理访问后端，无需配置环境变量。

后端需要的环境变量：
```bash
export DASHSCOPE_API_KEY=your-key
```

---

## 📚 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| React | 19.2.4 | UI 框架 |
| TypeScript | 5.9.3 | 类型系统 |
| Vite | 8.0.3 | 构建工具 |
| Tailwind CSS | 3.4.19 | 样式框架 |
| zustand | 5.0.12 | 状态管理 |
| shadcn/ui | latest | 组件库 |
| lucide-react | latest | 图标库 |
| react-markdown | latest | Markdown 渲染 |
| highlight.js | latest | 代码高亮 |

---

## 🎯 开发指南

### 添加新组件

1. 在 `src/components/` 下创建组件文件
2. 使用 TypeScript 编写组件
3. 导出组件并在需要的地方引入

```tsx
// src/components/MyComponent.tsx
export function MyComponent() {
  return <div>Hello</div>
}
```

### 添加新 API

1. 在 `src/services/api.ts` 中添加方法
2. 定义 TypeScript 类型在 `src/types/index.ts`

```typescript
// types/index.ts
export interface MyResponse {
  data: string
}

// services/api.ts
async getMyData(): Promise<MyResponse> {
  const response = await fetch('/api/my-endpoint')
  return response.json()
}
```

### 添加新状态

使用 zustand 创建 store：

```typescript
// src/stores/my-store.ts
import { create } from 'zustand'

export const useMyStore = create((set) => ({
  data: [],
  setData: (data) => set({ data }),
}))
```

---

## 🐛 常见问题

### Q: 启动后页面空白？

**A**: 检查后端服务是否运行在 9900 端口

```bash
# 检查端口
lsof -ti:9900

# 如果没有输出，启动后端
mvn spring-boot:run
```

### Q: npm install 失败？

**A**: 使用国内镜像

```bash
npm install --registry=https://registry.npmmirror.com
```

### Q: 样式不生效？

**A**: 清除缓存并重启

```bash
rm -rf node_modules/.vite
npm run dev
```

### Q: 控制台有大量日志？

**A**: 这是正常的调试日志，生产环境会自动移除。

---

## 📖 相关文档

- [前端功能详细文档](../docs/frontend-features.md)
- [API 完整文档](../docs/api/SuperBizAgent-API.md)
- [主项目 README](../README.md)
- [项目规范](../CLAUDE.md)

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 License

MIT License