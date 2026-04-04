# Redis 对话历史持久化 - 实施会话上下文

## 📋 会话信息

| 项目 | 内容 |
|------|------|
| **会话时间** | 2026-03-29 |
| **任务** | 实现对话历史 Redis 持久化 |
| **状态** | ✅ 已完成 |
| **相关文件** | 见下方清单 |

---

## 🎯 任务背景

SuperBizAgent 项目原本使用 `ConcurrentHashMap` 在内存中存储会话数据，服务重启后所有对话历史丢失。需要实现 Redis 持久化来解决这个问题。

---

## 📁 相关文件清单

### 新增文件（6 个）

```
src/main/java/org/example/
├── dto/
│   ├── ChatMessage.java              # 消息实体 (role, content, timestamp)
│   ├── ChatSession.java              # 会话实体 (sessionId, createTime, messageCount)
│   └── SessionListResponse.java      # 会话列表响应
├── repository/
│   └── ChatSessionRepository.java    # Redis 数据访问层
├── service/
│   └── ChatSessionService.java       # 会话管理服务（含 recoverSession 方法）
└── config/
    └── RedisConfig.java              # Redis 配置（注意：去掉了重复的 ObjectMapper Bean）
```

### 修改文件（3 个）

```
├── pom.xml                           # 添加 spring-boot-starter-data-redis 依赖
├── src/main/resources/
│   └── application.yml               # 添加 Redis 连接配置（spring.data.redis.*）
└── src/main/java/org/example/controller/
    └── ChatController.java           # 集成持久化逻辑
        ├── SessionInfo 新增 summary 字段
        ├── getOrCreateSession() 改为从 Redis 恢复
        ├── buildSystemPrompt() 支持摘要参数
        └── 新增 3 个 API 接口
```

### 后续新增的上下文相关文件（3 个）

```
src/main/java/com/spf/
├── config/
│   └── QueryRewriteConfig.java       # query 改写 / HyDE 配置
├── context/
│   └── ConversationContext.java      # ThreadLocal 持有近期历史与 summary
└── service/
    └── QueryRewriteService.java      # 基于会话上下文做指代消解与 HyDE
```

### 文档文件（2 个）

```
docs/
├── redis-persistence-plan.md         # 完整技术方案（已更新实施总结）
└── api/
    └── chat-session-api.md           # API 接口文档
```

---

## 🔑 核心实现逻辑

### 1. 双写策略（Write-Through）

每次消息更新同时写入内存和 Redis：

```java
// ChatController.java 第 107-109 行
session.addMessage(request.getQuestion(), fullAnswer);  // 写内存
chatSessionService.addMessage(session.getSessionId(), request.getQuestion(), fullAnswer);  // 写 Redis
```

### 2. 会话恢复 + LLM 摘要压缩

服务重启后的恢复流程：

```java
// ChatController.getOrCreateSession()
1. 从 Redis 加载全部历史消息
2. 调用 chatSessionService.recoverSession(sessionId, MAX_WINDOW_SIZE)
3. 如果超出窗口（6 对）：
   - 旧消息 → 文本 → chatService.summarizeConversation() → LLM 生成摘要
   - 最近消息 → 直接加载到内存
4. session.setSummary(summary)
```

**关键方法：**
- `ChatSessionService.recoverSession(String, int)` → 返回 `RecentMessages` (旧消息文本 + 最近消息列表)
- `ChatService.summarizeConversation(String)` → 调用 DashScope LLM 生成摘要（200字内）
- `ChatService.buildSystemPrompt(List, String)` → 摘要注入到"早期对话摘要"区块

### 3. 数据流

```
用户请求
    ↓
ChatController.chat()
    ↓
getOrCreateSession() → 从 Redis 恢复（含摘要压缩）
    ↓
buildSystemPrompt(history, summary) → 注入摘要 + 近期消息
    ↓
ConversationContext.set(history, summary) → 检索侧可读取当前会话上下文
    ↓
ReactAgent.call(question)
    ↓
session.addMessage() + chatSessionService.addMessage() → 双写
    ↓
返回结果
```

---

## ⚠️ 已知问题/限制

### 已修复的 Bug

| 问题 | 修复 |
|------|------|
| 流式接口用 `request.getId()` 传 Redis | 改用 `session.getSessionId()` |
| `getSessionInfo` 重启后查不到 | 补充 Redis fallback |
| ObjectMapper Bean 冲突 | 删除 RedisConfig 中的重复 Bean |

### 当前限制

1. **会话无过期策略**：数据永久保留在 Redis，建议添加 TTL
2. **摘要仅在恢复时生成**：后续新增消息不会自动更新摘要
3. **检索侧上下文依赖 ThreadLocal**：当前只覆盖同线程内的同步调用路径
4. **无消息搜索功能**：暂不支持按关键词搜索历史消息
5. **单 Redis 实例**：大规模部署需考虑 Cluster 模式

---

## 🔧 Redis 数据结构

```
# 会话元数据
chat:session:{sessionId} → Hash
  - sessionId, createTime, updateTime, messageCount

# 消息列表（保持顺序）
chat:messages:{sessionId} → List
  - [{"role":"user","content":"...","timestamp":123}, ...]

# 时间线索引（按时间排序）
chat:sessions:timeline → ZSet
  - {sessionId: createTime}
```

---

## 🚀 启动 Redis

```bash
docker run -d \
  --name super-biz-redis \
  -p 6379:6379 \
  -v $(pwd)/data/redis:/data \
  redis:7-alpine \
  redis-server --appendonly yes --appendfsync everysec
```

---

## 📊 新增 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/chat/sessions` | 查询会话列表（分页） |
| GET | `/api/chat/messages/{id}` | 获取会话消息历史 |
| DELETE | `/api/chat/session/{id}` | 删除会话 |

详细 API 文档见：`docs/api/chat-session-api.md`

---

## 🧪 验证测试

```bash
# 1. 发送对话
curl -X POST http://localhost:9900/api/chat \
  -H "Content-Type: application/json" \
  -d '{"Id": "test-001", "Question": "你好"}'

# 2. 查询会话列表
curl http://localhost:9900/api/chat/sessions

# 3. 查询消息历史
curl http://localhost:9900/api/chat/messages/test-001

# 4. 删除会话
curl -X DELETE http://localhost:9900/api/chat/session/test-001
```

---

## 💡 后续优化建议

### 优先级高

1. **会话 TTL**：给 Redis key 设置过期时间，自动清理长期未使用的会话
2. **摘要更新**：当消息再次超出窗口时，重新生成摘要

### 优先级中

3. **消息搜索**：集成 Redis Search 或单独的搜索引擎
4. **数据归档**：定期将旧会话归档到 MySQL/MongoDB
5. **监控指标**：添加 Redis 命中率、摘要生成耗时等监控

### 优先级低

6. **Redis Cluster**：支持大规模部署
7. **会话导入/导出**：支持会话数据的批量导入导出
8. **会话分享**：生成会话分享链接

---

## 📝 给其他 AI 的提示

### 如需继续优化，建议从：

1. **性能优化**：检查 Redis 查询是否有瓶颈，考虑 pipeline 或批量操作
2. **功能增强**：实现上述"后续优化建议"中的功能
3. **测试补充**：编写单元测试、集成测试
4. **文档完善**：补充架构图、时序图

### 关键代码位置

- 会话恢复逻辑：`ChatController.getOrCreateSession()` (第 480-510 行)
- 摘要生成：`ChatService.summarizeConversation()` (第 183-205 行)
- Redis 操作：`ChatSessionRepository` 全文
- 新增 API：`ChatController` 第 416-468 行

---

**会话结束 - 2026-03-29**
