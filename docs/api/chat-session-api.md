# Chat Session API 补充说明

> 更新时间：2026-04-07

这份文档只保留**会话管理相关接口**的专项说明。  
完整接口列表、统一响应格式和聊天主流程，请以 `docs/api/SuperBizAgent-API.md` 为准。

## 1. 文档范围

这里重点说明：

- 会话是如何创建和恢复的
- 会话列表、消息历史、清空、删除这些接口的语义
- 会话相关的前端使用约定

不再重复展开：

- `POST /api/chat`
- `POST /api/chat_stream`
- 统一响应包装
- 非会话类接口

## 2. 会话创建与恢复

### 隐式创建

会话不需要单独的“创建接口”。

- 当 `POST /api/chat` 或 `POST /api/chat_stream` 请求里没有 `Id`
- 后端会自动创建会话并返回 `sessionId`

### 自动恢复

如果请求里带了已有 `Id`：

- 先尝试从内存中恢复
- 内存未命中时，再从 Redis 恢复
- 历史过长时，只保留最近窗口的消息，旧历史摘要注入 prompt

## 3. 会话相关接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/chat/clear` | 清空某个会话的消息历史，但会话本身仍保留 |
| `GET` | `/api/chat/session/{sessionId}` | 获取会话基本信息 |
| `GET` | `/api/chat/sessions` | 分页获取会话列表 |
| `GET` | `/api/chat/messages/{sessionId}` | 获取某个会话的消息历史 |
| `DELETE` | `/api/chat/session/{sessionId}` | 删除会话及其持久化数据 |

## 4. 关键语义

### `POST /api/chat/clear`

作用：

- 清空指定会话的历史消息
- 不删除会话本身
- 后续再次对话时仍可复用同一个 `sessionId`

适用场景：

- 用户想保留这个会话入口，但重新开始一轮对话

### `GET /api/chat/session/{sessionId}`

返回：

- `sessionId`
- 创建时间
- 消息对数等基础信息

这类接口更适合前端侧边栏或详情展示，不承担历史消息拉取。

### `GET /api/chat/sessions`

用途：

- 分页列出历史会话
- 支撑前端左侧会话列表

当前返回数据重点是：

- 会话基础信息
- 第一条消息预览
- 创建时间 / 更新时间
- 消息数量

### `GET /api/chat/messages/{sessionId}`

用途：

- 在切换会话时恢复消息历史
- 刷新页面后重建当前会话窗口

说明：

- 这是消息明细接口，不等于会话元数据接口
- 如需限制返回数量，可使用 `limit`

### `DELETE /api/chat/session/{sessionId}`

作用：

- 删除会话元数据
- 删除消息历史
- 从内存态和 Redis 中一起移除

适用场景：

- 用户明确不再保留该会话

## 5. 前端接入建议

典型流程：

1. 首次发送问题，不传 `Id`
2. 从响应里拿到 `sessionId`
3. 后续对话一直带上这个 `sessionId`
4. 初始化页面时先拉 `/api/chat/sessions`
5. 用户切换会话时再拉 `/api/chat/messages/{sessionId}`

## 6. 与总 API 文档的关系

如果接口字段、示例或错误码与本页不一致，优先以：

- `docs/api/SuperBizAgent-API.md`

为准。  
这份文档的职责是帮助快速理解“会话是怎么工作的”，而不是重复维护一整份接口手册。
