# Redis 对话历史持久化 - 当前上下文

> 更新时间：2026-04-07

这份文档只保留“现在代码里是什么样”的上下文，便于继续迭代，不再记录早期的大段实施过程。

## 1. 当前状态

- 对话历史已持久化到 Redis
- 会话支持恢复、分页列表、消息查询、清空和删除
- 恢复时会把旧消息压缩为摘要，最近窗口保留原始消息
- 检索侧可通过 `ConversationContext` 读取近期历史和摘要，用于 query rewrite / HyDE

## 2. 主要文件

### 核心链路

- `src/main/java/com/spf/controller/ChatController.java`
- `src/main/java/com/spf/service/ChatService.java`
- `src/main/java/com/spf/service/ChatSessionService.java`
- `src/main/java/com/spf/repository/ChatSessionRepository.java`

### 数据结构

- `src/main/java/com/spf/dto/ChatMessage.java`
- `src/main/java/com/spf/dto/ChatSession.java`
- `src/main/java/com/spf/dto/SessionListResponse.java`

### 上下文增强

- `src/main/java/com/spf/context/ConversationContext.java`
- `src/main/java/com/spf/config/QueryRewriteConfig.java`
- `src/main/java/com/spf/service/QueryRewriteService.java`

### 配置

- `src/main/java/com/spf/config/RedisConfig.java`
- `src/main/resources/application.yml`

## 3. 当前数据流

```text
用户请求
  -> ChatController.getOrCreateSession()
  -> 内存命中则直接取 SessionInfo
  -> 未命中则从 Redis 恢复
  -> 历史过长时生成 summary
  -> ChatService 构建 prompt
  -> ConversationContext 注入近期历史和 summary
  -> Agent 执行
  -> 结果同时写入内存和 Redis
```

## 4. 设计取舍

### 为什么还保留内存态

因为当前聊天链路仍然以单实例、低延迟交互为主。  
Redis 负责持久化和恢复，内存态负责运行期访问速度。

### 为什么不是全历史回放

全量回放历史对话会让 prompt 越来越长。  
当前策略是“最近窗口 + 早期摘要”，优先保证多轮对话的连续性和 token 成本平衡。

### 为什么 ConversationContext 仍然存在

因为 query rewrite 和 HyDE 在检索前需要知道：

- 最近几轮用户到底在问什么
- 会话摘要里已经确定了哪些背景

这部分上下文不适合每次都重新从控制器层手工透传，所以目前仍通过上下文对象注入。

## 5. 已知限制

- 会话 timeline 仍偏向创建时间索引，不是严格的“最近活跃排序”
- 摘要不是严格的滚动增量摘要
- ThreadLocal 风格上下文在异步扩展场景下需要更谨慎
- 还没有消息级搜索、归档和 TTL 策略

## 6. 后续演进方向

- 把摘要从恢复时生成，升级成写路径上的增量维护
- 增加结构化事实记忆，而不只是摘要文本
- 让会话 timeline 更接近“最近活跃会话”
- 补充 TTL 或归档策略，控制 Redis 长期存储成本
