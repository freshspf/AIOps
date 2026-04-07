# Redis 对话历史持久化方案

> 更新时间：2026-04-07  
> 状态：已实施

## 1. 目标

这套持久化的目标很简单：

- 服务重启后，会话历史仍可恢复
- 前端可以查询会话列表和历史消息
- 长对话不会把全部历史原样塞回 prompt

## 2. 当前实现

当前项目已经从“仅内存会话”升级为“内存运行态 + Redis 持久化”的写透方案：

```text
用户请求
  -> ChatController
  -> SessionInfo 更新内存态
  -> ChatSessionService 写 Redis
  -> 下次访问时优先从内存取，没有则从 Redis 恢复
```

核心思路：

- 内存中的 `SessionInfo` 负责当前会话运行态
- Redis 负责消息、会话元数据和时间线索引
- 恢复时只保留最近窗口的原始消息
- 更早的消息用摘要压缩后注入系统提示词

## 3. 关键设计

### 3.1 写透持久化

每次对话完成后，同时更新：

- 内存会话历史
- Redis 消息列表
- Redis 会话元数据

这样做的原因是：

- 当前请求路径仍需要低延迟的内存态
- Redis 保证重启后的恢复能力

### 3.2 恢复时摘要压缩

恢复会话时，不把全部历史原样加载回 prompt，而是拆成两段：

- 最近窗口：保留原始消息
- 更早历史：汇总成摘要

这样可以兼顾：

- 多轮上下文连续性
- token 成本可控

### 3.3 会话列表和历史查询

除了聊天接口本身，还补了这些能力：

- `GET /api/chat/sessions`
- `GET /api/chat/messages/{id}`
- `DELETE /api/chat/session/{id}`
- `POST /api/chat/clear`

这些接口让前端能真正把“历史会话”做完整，而不是一次性聊天窗口。

## 4. Redis 数据结构

```text
chat:session:{sessionId}      -> Hash
chat:messages:{sessionId}     -> List
chat:sessions:timeline        -> ZSet
```

含义：

- `chat:session:{sessionId}`：会话元数据
- `chat:messages:{sessionId}`：有序消息列表
- `chat:sessions:timeline`：会话列表排序索引

## 5. 相关代码

主要文件：

- `src/main/java/com/spf/controller/ChatController.java`
- `src/main/java/com/spf/service/ChatService.java`
- `src/main/java/com/spf/service/ChatSessionService.java`
- `src/main/java/com/spf/repository/ChatSessionRepository.java`
- `src/main/java/com/spf/dto/ChatMessage.java`
- `src/main/java/com/spf/dto/ChatSession.java`
- `src/main/java/com/spf/dto/SessionListResponse.java`
- `src/main/java/com/spf/config/RedisConfig.java`

## 6. 已知限制

当前实现仍有这些边界：

- 没有会话 TTL，历史默认长期保留
- 摘要主要在恢复路径上使用，还不是完整的增量摘要体系
- 检索侧上下文通过 `ConversationContext` 注入，当前更适合同线程同步链路
- 还没有做消息级搜索、标签或收藏

## 7. 建议阅读顺序

如果是第一次看这块代码，建议按这个顺序：

1. `ChatController.getOrCreateSession()`
2. `ChatSessionService.recoverSession()`
3. `ChatSessionRepository`
4. `ChatService.summarizeConversation()`

## 8. 相关文档

- 总 API 文档：`docs/api/SuperBizAgent-API.md`
- 会话接口补充：`docs/api/chat-session-api.md`
- 当前会话上下文：`docs/redis-persistence-session-context.md`
