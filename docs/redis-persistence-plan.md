# Redis 对话历史持久化技术方案

## 📖 文档信息

| 项目 | 内容 |
|------|------|
| **方案名称** | Redis 对话历史持久化系统 |
| **创建时间** | 2026-03-27 |
| **完成时间** | 2026-03-29 |
| **版本** | v1.1 |
| **状态** | ✅ 已实施 |

---

## 1. 背景与问题分析

### 1.1 当前问题

SuperBizAgent 项目的对话系统目前使用 `ConcurrentHashMap` 在内存中存储会话数据：

```java
// ChatController.java 第 55 行
private final Map<String, SessionInfo> sessions = new ConcurrentHashMap<>();
```

**存在的问题：**

| 问题 | 影响 | 严重程度 |
|------|------|----------|
| 服务重启后数据丢失 | 用户无法继续之前的对话 | 🔴 高 |
| 无法查询历史记录 | 用户无法查看过往对话 | 🟡 中 |
| 多实例无法共享 | 水平扩展受限 | 🟡 中 |
| 内存占用增长 | 长时间运行内存泄漏风险 | 🟢 低 |

### 1.2 需求分析

用户需要以下功能：

1. **会话恢复**：服务重启后用户可以继续之前的对话
2. **历史查询**：用户可以查看、搜索之前的对话记录
3. **永久保留**：对话历史永久保存（除非用户手动删除）
4. **高并发支持**：支持多用户同时使用
5. **高性能读写**：对话场景需要低延迟

### 1.3 技术选型：Redis

**为什么选择 Redis？**

| 优势 | 说明 |
|------|------|
| 高性能 | 内存存储，读写延迟 < 1ms |
| 丰富数据结构 | List、Hash、ZSet 适配多种场景 |
| 持久化支持 | RDB + AOF 双重保障 |
| 成熟稳定 | Spring Data Redis 生态完善 |
| 部署简单 | Docker 一键启动 |
| 水平扩展 | 支持 Redis Cluster 集群模式 |

---

## 2. Redis 数据结构设计

### 2.1 Key 命名规范

```
前缀:类型:标识:字段
```

- `chat` - 业务前缀
- `session` / `messages` / `timeline` - 数据类型
- `{sessionId}` - 会话ID

### 2.2 数据结构详解

#### 2.2.1 会话元数据 (Hash)

```
Key: chat:session:{sessionId}
Type: Hash
Fields:
  - sessionId: String      # 会话ID
  - createTime: Long       # 创建时间（时间戳）
  - updateTime: Long       # 更新时间（时间戳）
  - messageCount: Integer  # 消息对数
```

**示例：**
```bash
HGETALL chat:session:abc-123-def
# 1) "sessionId"
# 2) "abc-123-def"
# 3) "createTime"
# 4) "1712345678900"
# 5) "updateTime"
# 6) "1712345699000"
# 7) "messageCount"
# 8) "12"
```

#### 2.2.2 会话消息列表 (List)

```
Key: chat:messages:{sessionId}
Type: List
Elements: JSON 字符串
Order: 保持插入顺序（左进右出或右进左出）
```

**消息格式：**
```json
{
  "role": "user",           // "user" 或 "assistant"
  "content": "问题内容",
  "timestamp": 1712345678900
}
```

**示例：**
```bash
# 添加消息（右侧插入）
RPUSH chat:messages:abc-123-def '{"role":"user","content":"你好","timestamp":1712345678900}'
RPUSH chat:messages:abc-123-def '{"role":"assistant","content":"你好！有什么我可以帮助你的吗？","timestamp":1712345679000}'

# 获取最近 N 条消息
LRANGE chat:messages:abc-123-def -10 -1
```

#### 2.2.3 时间线索引 (Sorted Set)

```
Key: chat:sessions:timeline
Type: ZSet
Member: sessionId
Score: createTime（时间戳）
```

**用途：** 支持按创建时间排序查询所有会话

**示例：**
```bash
# 添加会话到时间线
ZADD chat:sessions:timeline 1712345678900 "abc-123-def"

# 获取最新的 10 个会话（倒序）
ZREVRANGE chat:sessions:timeline 0 9 WITHSCORES

# 删除会话时同时从时间线移除
ZREM chat:sessions:timeline "abc-123-def"
```

---

## 3. 代码实现

### 3.1 项目结构

```
src/main/java/org/example/
├── dto/
│   ├── ChatMessage.java           # 消息实体类
│   ├── ChatSession.java           # 会话实体类
│   └── SessionListResponse.java   # 会话列表响应类
├── repository/
│   └── ChatSessionRepository.java # Redis 数据访问层
├── service/
│   ├── ChatSessionService.java    # 会话管理服务层
│   └── ChatService.java           # (已存在)
├── config/
│   └── RedisConfig.java           # Redis 配置类
└── controller/
    └── ChatController.java        # (修改，集成持久化)
```

### 3.2 实体类

#### 3.2.1 ChatMessage.java

```java
package org.example.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 聊天消息实体
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage {
    /**
     * 消息角色：user 或 assistant
     */
    private String role;

    /**
     * 消息内容
     */
    private String content;

    /**
     * 消息时间戳（毫秒）
     */
    private Long timestamp;

    /**
     * 构造用户消息
     */
    public static ChatMessage userMessage(String content) {
        return new ChatMessage("user", content, System.currentTimeMillis());
    }

    /**
     * 构造助手消息
     */
    public static ChatMessage assistantMessage(String content) {
        return new ChatMessage("assistant", content, System.currentTimeMillis());
    }
}
```

#### 3.2.2 ChatSession.java

```java
package org.example.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 聊天会话实体
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatSession {
    /**
     * 会话ID（UUID）
     */
    private String sessionId;

    /**
     * 创建时间（毫秒时间戳）
     */
    private Long createTime;

    /**
     * 最后更新时间（毫秒时间戳）
     */
    private Long updateTime;

    /**
     * 消息对数（一对 = 1个用户消息 + 1个助手消息）
     */
    private Integer messageCount;

    /**
     * 创建新会话
     */
    public static ChatSession create(String sessionId) {
        long now = System.currentTimeMillis();
        return new ChatSession(sessionId, now, now, 0);
    }

    /**
     * 更新会话时间
     */
    public void touch() {
        this.updateTime = System.currentTimeMillis();
    }

    /**
     * 增加消息计数
     */
    public void incrementMessageCount() {
        this.messageCount = (this.messageCount == null ? 0 : this.messageCount) + 1;
    }
}
```

#### 3.2.3 SessionListResponse.java

```java
package org.example.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 会话列表响应
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SessionListResponse {
    /**
     * 会话列表
     */
    private List<SessionSummary> sessions;

    /**
     * 总数
     */
    private Integer total;

    /**
     * 当前页码
     */
    private Integer page;

    /**
     * 每页大小
     */
    private Integer pageSize;

    /**
     * 会话摘要
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SessionSummary {
        /**
         * 会话ID
         */
        private String sessionId;

        /**
         * 创建时间
         */
        private Long createTime;

        /**
         * 最后更新时间
         */
        private Long updateTime;

        /**
         * 消息对数
         */
        private Integer messageCount;

        /**
         * 第一条消息预览（作为标题）
         */
        private String firstMessage;
    }
}
```

### 3.3 Repository 层

#### 3.2.4 ChatSessionRepository.java

```java
package org.example.repository;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.example.dto.ChatMessage;
import org.example.dto.ChatSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.Set;
import java.concurrent.TimeUnit;

/**
 * 聊天会话 Redis 数据访问层
 */
@Slf4j
@Repository
public class ChatSessionRepository {

    private static final String SESSION_KEY_PREFIX = "chat:session:";
    private static final String MESSAGES_KEY_PREFIX = "chat:messages:";
    private static final String TIMELINE_KEY = "chat:sessions:timeline";

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    // ==================== 会话元数据操作 ====================

    /**
     * 保存会话元数据
     */
    public void saveSession(ChatSession session) {
        String key = SESSION_KEY_PREFIX + session.getSessionId();
        redisTemplate.opsForHash().put(key, "sessionId", session.getSessionId());
        redisTemplate.opsForHash().put(key, "createTime", session.getCreateTime());
        redisTemplate.opsForHash().put(key, "updateTime", session.getUpdateTime());
        redisTemplate.opsForHash().put(key, "messageCount", session.getMessageCount());

        // 添加到时间线
        redisTemplate.opsForZSet().add(TIMELINE_KEY, session.getSessionId(), session.getCreateTime());

        log.debug("保存会话元数据: {}", session.getSessionId());
    }

    /**
     * 获取会话元数据
     */
    public ChatSession getSession(String sessionId) {
        String key = SESSION_KEY_PREFIX + sessionId;
        Object obj = redisTemplate.opsForHash().get(key, "sessionId");
        if (obj == null) {
            return null;
        }

        ChatSession session = new ChatSession();
        session.setSessionId((String) obj);
        session.setCreateTime((Long) redisTemplate.opsForHash().get(key, "createTime"));
        session.setUpdateTime((Long) redisTemplate.opsForHash().get(key, "updateTime"));
        session.setMessageCount((Integer) redisTemplate.opsForHash().get(key, "messageCount"));

        return session;
    }

    /**
     * 更新会话元数据
     */
    public void updateSession(ChatSession session) {
        saveSession(session);
    }

    /**
     * 删除会话元数据
     */
    public void deleteSession(String sessionId) {
        // 删除会话元数据
        String key = SESSION_KEY_PREFIX + sessionId;
        redisTemplate.delete(key);

        // 从时间线移除
        redisTemplate.opsForZSet().remove(TIMELINE_KEY, sessionId);

        log.debug("删除会话元数据: {}", sessionId);
    }

    // ==================== 消息操作 ====================

    /**
     * 添加消息到会话
     */
    public void addMessage(String sessionId, ChatMessage message) {
        String key = MESSAGES_KEY_PREFIX + sessionId;

        try {
            String json = objectMapper.writeValueAsString(message);
            redisTemplate.opsForList().rightPush(key, json);
            log.debug("添加消息到会话 {}: role={}", sessionId, message.getRole());
        } catch (Exception e) {
            log.error("序列化消息失败", e);
            throw new RuntimeException("添加消息失败", e);
        }
    }

    /**
     * 获取会话的所有消息
     */
    public List<ChatMessage> getMessages(String sessionId) {
        return getMessages(sessionId, -1);
    }

    /**
     * 获取会话的最近 N 条消息
     * @param limit 消息数量，-1 表示全部
     */
    public List<ChatMessage> getMessages(String sessionId, int limit) {
        String key = MESSAGES_KEY_PREFIX + sessionId;
        long size = redisTemplate.opsForList().size(key);

        if (size == 0) {
            return new ArrayList<>();
        }

        // 计算范围
        long start = (limit > 0 && size > limit) ? (size - limit) : 0;
        long end = -1;

        List<Object> jsonList = redisTemplate.opsForList().range(key, start, end);
        List<ChatMessage> messages = new ArrayList<>();

        if (jsonList != null) {
            for (Object obj : jsonList) {
                try {
                    String json = (String) obj;
                    ChatMessage message = objectMapper.readValue(json, ChatMessage.class);
                    messages.add(message);
                } catch (Exception e) {
                    log.error("反序列化消息失败: {}", obj, e);
                }
            }
        }

        log.debug("获取会话 {} 的消息，数量: {}", sessionId, messages.size());
        return messages;
    }

    /**
     * 清空会话消息
     */
    public void clearMessages(String sessionId) {
        String key = MESSAGES_KEY_PREFIX + sessionId;
        redisTemplate.delete(key);
        log.debug("清空会话 {} 的消息", sessionId);
    }

    /**
     * 获取消息数量
     */
    public long getMessageCount(String sessionId) {
        String key = MESSAGES_KEY_PREFIX + sessionId;
        return redisTemplate.opsForList().size(key);
    }

    // ==================== 时间线操作 ====================

    /**
     * 获取所有会话ID（按创建时间倒序）
     */
    public List<String> getAllSessionIds() {
        Set<Object> members = redisTemplate.opsForZSet().reverseRange(TIMELINE_KEY, 0, -1);
        List<String> sessionIds = new ArrayList<>();

        if (members != null) {
            for (Object obj : members) {
                sessionIds.add((String) obj);
            }
        }

        return sessionIds;
    }

    /**
     * 获取分页会话ID列表（按创建时间倒序）
     */
    public List<String> getSessionIds(int page, int pageSize) {
        long start = (long) (page - 1) * pageSize;
        long end = start + pageSize - 1;

        Set<Object> members = redisTemplate.opsForZSet().reverseRange(TIMELINE_KEY, start, end);
        List<String> sessionIds = new ArrayList<>();

        if (members != null) {
            for (Object obj : members) {
                sessionIds.add((String) obj);
            }
        }

        return sessionIds;
    }

    /**
     * 获取总会话数
     */
    public long getTotalSessionCount() {
        Long count = redisTemplate.opsForZSet().size(TIMELINE_KEY);
        return count != null ? count : 0;
    }
}
```

### 3.4 Service 层

#### 3.2.5 ChatSessionService.java

```java
package org.example.service;

import lombok.extern.slf4j.Slf4j;
import org.example.dto.ChatMessage;
import org.example.dto.ChatSession;
import org.example.dto.SessionListResponse;
import org.example.repository.ChatSessionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 聊天会话管理服务
 */
@Slf4j
@Service
public class ChatSessionService {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_HISTORY_LIMIT = 100;

    @Autowired
    private ChatSessionRepository repository;

    // ==================== 会话管理 ====================

    /**
     * 获取或创建会话
     */
    public ChatSession getOrCreateSession(String sessionId) {
        if (!StringUtils.hasText(sessionId)) {
            sessionId = UUID.randomUUID().toString();
        }

        ChatSession session = repository.getSession(sessionId);

        if (session == null) {
            // 创建新会话
            session = ChatSession.create(sessionId);
            repository.saveSession(session);
            log.info("创建新会话: {}", sessionId);
        } else {
            log.debug("获取已存在会话: {}", sessionId);
        }

        return session;
    }

    /**
     * 更新会话时间
     */
    public void touchSession(String sessionId) {
        ChatSession session = repository.getSession(sessionId);
        if (session != null) {
            session.touch();
            repository.updateSession(session);
        }
    }

    /**
     * 删除会话
     */
    public void deleteSession(String sessionId) {
        // 删除消息
        repository.clearMessages(sessionId);
        // 删除会话元数据
        repository.deleteSession(sessionId);
        log.info("删除会话: {}", sessionId);
    }

    // ==================== 消息管理 ====================

    /**
     * 添加一对消息（用户问题 + AI回复）
     */
    public void addMessage(String sessionId, String userQuestion, String aiAnswer) {
        // 添加用户消息
        ChatMessage userMsg = ChatMessage.userMessage(userQuestion);
        repository.addMessage(sessionId, userMsg);

        // 添加助手消息
        ChatMessage assistantMsg = ChatMessage.assistantMessage(aiAnswer);
        repository.addMessage(sessionId, assistantMsg);

        // 更新会话元数据
        ChatSession session = repository.getSession(sessionId);
        if (session != null) {
            session.touch();
            session.incrementMessageCount();
            repository.updateSession(session);
        }

        log.debug("添加消息对到会话 {}: 用户消息长度={}, AI回复长度={}",
            sessionId, userQuestion.length(), aiAnswer.length());
    }

    /**
     * 获取会话历史消息
     * @param sessionId 会话ID
     * @param limit 消息数量限制，null 或 0 表示全部
     */
    public List<ChatMessage> getSessionHistory(String sessionId, Integer limit) {
        int actualLimit = (limit != null && limit > 0) ?
            Math.min(limit, MAX_HISTORY_LIMIT) : MAX_HISTORY_LIMIT;

        List<ChatMessage> messages = repository.getMessages(sessionId, actualLimit);
        log.info("获取会话 {} 历史消息，数量: {}", sessionId, messages.size());

        return messages;
    }

    /**
     * 获取会话历史消息（全部）
     */
    public List<ChatMessage> getSessionHistory(String sessionId) {
        return getSessionHistory(sessionId, null);
    }

    /**
     * 清空会话历史
     */
    public void clearSessionHistory(String sessionId) {
        repository.clearMessages(sessionId);

        // 重置消息计数
        ChatSession session = repository.getSession(sessionId);
        if (session != null) {
            session.setMessageCount(0);
            session.touch();
            repository.updateSession(session);
        }

        log.info("清空会话 {} 的历史消息", sessionId);
    }

    // ==================== 会话列表查询 ====================

    /**
     * 获取会话列表
     */
    public SessionListResponse listSessions(int page, int pageSize) {
        long total = repository.getTotalSessionCount();
        List<String> sessionIds = repository.getSessionIds(page, pageSize);

        List<SessionListResponse.SessionSummary> summaries = new ArrayList<>();

        for (String sessionId : sessionIds) {
            ChatSession session = repository.getSession(sessionId);
            if (session != null) {
                SessionListResponse.SessionSummary summary = new SessionListResponse.SessionSummary();
                summary.setSessionId(session.getSessionId());
                summary.setCreateTime(session.getCreateTime());
                summary.setUpdateTime(session.getUpdateTime());
                summary.setMessageCount(session.getMessageCount());

                // 获取第一条消息作为预览
                List<ChatMessage> messages = repository.getMessages(sessionId, 1);
                if (!messages.isEmpty()) {
                    String firstMsg = messages.get(0).getContent();
                    summary.setFirstMsg(truncate(firstMsg, 50));
                }

                summaries.add(summary);
            }
        }

        SessionListResponse response = new SessionListResponse();
        response.setSessions(summaries);
        response.setTotal((int) total);
        response.setPage(page);
        response.setPageSize(pageSize);

        return response;
    }

    /**
     * 获取会话列表（默认分页）
     */
    public SessionListResponse listSessions() {
        return listSessions(1, DEFAULT_PAGE_SIZE);
    }

    // ==================== 辅助方法 ====================

    /**
     * 转换消息列表为历史格式（供 ChatController 使用）
     */
    public List<ChatMessage> convertToHistoryMessages(List<ChatMessage> messages) {
        return messages;
    }

    /**
     * 截断字符串
     */
    private String truncate(String str, int maxLength) {
        if (str == null) {
            return "";
        }
        if (str.length() <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength) + "...";
    }
}
```

### 3.5 Config 层

#### 3.2.6 RedisConfig.java

```java
package org.example.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/**
 * Redis 配置类
 */
@Configuration
public class RedisConfig {

    /**
     * 配置 RedisTemplate
     * - Key 使用 String 序列化
     * - Value 使用 JSON 序列化
     */
    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        // Key 序列化器
        StringRedisSerializer stringSerializer = new StringRedisSerializer();
        template.setKeySerializer(stringSerializer);
        template.setHashKeySerializer(stringSerializer);

        // Value 序列化器（使用 JSON）
        GenericJackson2JsonRedisSerializer jsonSerializer = createJsonSerializer();
        template.setValueSerializer(jsonSerializer);
        template.setHashValueSerializer(jsonSerializer);

        template.afterPropertiesSet();
        return template;
    }

    /**
     * 创建 JSON 序列化器
     */
    private GenericJackson2JsonRedisSerializer createJsonSerializer() {
        ObjectMapper mapper = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .build();

        return new GenericJackson2JsonRedisSerializer(mapper);
    }

    /**
     * ObjectMapper Bean（供其他组件使用）
     */
    @Bean
    public ObjectMapper objectMapper() {
        return JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .build();
    }
}
```

---

## 4. 配置文件

### 4.1 pom.xml 依赖添加

在 `<dependencies>` 节点添加：

```xml
<!-- Redis for chat history persistence -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
<dependency>
    <groupId>org.apache.commons</groupId>
    <artifactId>commons-pool2</artifactId>
</dependency>
```

### 4.2 application.yml 配置

```yaml
spring:
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      password: ${REDIS_PASSWORD:}
      database: 0
      timeout: 5000ms
      lettuce:
        pool:
          max-active: 20
          max-idle: 10
          min-idle: 5
```

---

## 5. ChatController 改造

### 5.1 修改点汇总

| 位置 | 修改内容 |
|------|----------|
| 第 47 行后 | 注入 ChatSessionService |
| 第 101 行后 | 同步消息到 Redis |
| 第 251 行后 | 同步消息到 Redis（流式接口） |
| 第 406-411 行 | 修改 getOrCreateSession 方法 |
| 第 119-140 行 | 修改 clearChatHistory 方法 |
| 新增 | 查询会话列表接口 |
| 新增 | 获取会话消息接口 |
| 新增 | 删除会话接口 |

### 5.2 详细修改代码

#### 5.2.1 注入 ChatSessionService

```java
@Autowired
private ChatSessionService chatSessionService;
```

#### 5.2.2 修改 getOrCreateSession 方法

```java
private SessionInfo getOrCreateSession(String sessionId) {
    if (sessionId == null || sessionId.isEmpty()) {
        sessionId = UUID.randomUUID().toString();
    }

    // 先从 Redis 获取或创建会话
    ChatSession redisSession = chatSessionService.getOrCreateSession(sessionId);

    // 从内存缓存获取 SessionInfo（如果不存在则创建）
    SessionInfo sessionInfo = sessions.get(sessionId);
    if (sessionInfo == null) {
        sessionInfo = new SessionInfo(sessionId);

        // 从 Redis 加载历史消息
        List<ChatMessage> history = chatSessionService.getSessionHistory(sessionId);
        for (ChatMessage msg : history) {
            if ("user".equals(msg.getRole())) {
                // 暂存用户消息，等待配对
                // 注意：这里需要根据实际情况调整逻辑
            }
        }

        sessions.put(sessionId, sessionInfo);
    }

    return sessionInfo;
}
```

#### 5.2.3 同步消息到 Redis

在 `/api/chat` 接口的 `session.addMessage()` 后添加：

```java
// 更新会话历史
session.addMessage(request.getQuestion(), fullAnswer);

// 同步到 Redis（新增）
chatSessionService.addMessage(session.getSessionId(), request.getQuestion(), fullAnswer);
```

在 `/api/chat_stream` 接口的 `session.addMessage()` 后添加：

```java
// 更新会话历史
session.addMessage(request.getQuestion(), fullAnswer);

// 同步到 Redis（新增）
chatSessionService.addMessage(request.getId(), request.getQuestion(), fullAnswer);
```

#### 5.2.4 修改 clearChatHistory 方法

```java
@PostMapping("/chat/clear")
public ResponseEntity<ApiResponse<String>> clearChatHistory(@RequestBody ClearRequest request) {
    try {
        logger.info("收到清空会话历史请求 - SessionId: {}", request.getId());

        if (request.getId() == null || request.getId().isEmpty()) {
            return ResponseEntity.ok(ApiResponse.error("会话ID不能为空"));
        }

        // 清空 Redis 历史记录（新增）
        chatSessionService.clearSessionHistory(request.getId());

        // 清空内存缓存
        SessionInfo session = sessions.get(request.getId());
        if (session != null) {
            session.clearHistory();
        }

        return ResponseEntity.ok(ApiResponse.success("会话历史已清空"));

    } catch (Exception e) {
        logger.error("清空会话历史失败", e);
        return ResponseEntity.ok(ApiResponse.error(e.getMessage()));
    }
}
```

#### 5.2.5 新增查询接口

```java
/**
 * 获取会话列表
 */
@GetMapping("/chat/sessions")
public ResponseEntity<ApiResponse<SessionListResponse>> listSessions(
    @RequestParam(defaultValue = "1") int page,
    @RequestParam(defaultValue = "20") int pageSize
) {
    try {
        SessionListResponse response = chatSessionService.listSessions(page, pageSize);
        return ResponseEntity.ok(ApiResponse.success(response));
    } catch (Exception e) {
        logger.error("获取会话列表失败", e);
        return ResponseEntity.ok(ApiResponse.error(e.getMessage()));
    }
}

/**
 * 获取会话消息历史
 */
@GetMapping("/chat/messages/{sessionId}")
public ResponseEntity<ApiResponse<List<ChatMessage>>> getSessionMessages(
    @PathVariable String sessionId,
    @RequestParam(required = false) Integer limit
) {
    try {
        List<ChatMessage> messages = chatSessionService.getSessionHistory(sessionId, limit);
        return ResponseEntity.ok(ApiResponse.success(messages));
    } catch (Exception e) {
        logger.error("获取会话消息失败", e);
        return ResponseEntity.ok(ApiResponse.error(e.getMessage()));
    }
}

/**
 * 删除会话
 */
@DeleteMapping("/chat/session/{sessionId}")
public ResponseEntity<ApiResponse<String>> deleteSession(@PathVariable String sessionId) {
    try {
        // 从内存删除
        sessions.remove(sessionId);

        // 从 Redis 删除
        chatSessionService.deleteSession(sessionId);

        return ResponseEntity.ok(ApiResponse.success("会话已删除"));
    } catch (Exception e) {
        logger.error("删除会话失败", e);
        return ResponseEntity.ok(ApiResponse.error(e.getMessage()));
    }
}
```

---

## 6. 部署指南

### 6.1 启动 Redis（Docker）

```bash
# 启动 Redis 容器（带持久化）
docker run -d \
  --name super-biz-redis \
  -p 6379:6379 \
  -v $(pwd)/data/redis:/data \
  redis:7-alpine \
  redis-server \
    --appendonly yes \
    --appendfsync everysec \
    --maxmemory 256mb \
    --maxmemory-policy allkeys-lru
```

**参数说明：**

| 参数 | 说明 |
|------|------|
| `-d` | 后台运行 |
| `--name super-biz-redis` | 容器名称 |
| `-p 6379:6379` | 端口映射 |
| `-v $(pwd)/data/redis:/data` | 数据持久化目录 |
| `--appendonly yes` | 启用 AOF 持久化 |
| `--appendfsync everysec` | 每秒同步一次 |
| `--maxmemory 256mb` | 最大内存 256MB |
| `--maxmemory-policy allkeys-lru` | 内存淘汰策略 |

### 6.2 验证 Redis 连接

```bash
# 检查容器状态
docker ps | grep super-biz-redis

# 测试连接
docker exec -it super-biz-redis redis-cli ping
# 应返回: PONG

# 查看数据
docker exec -it super-biz-redis redis-cli
> KEYS chat:*
> HGETALL chat:session:xxx
```

### 6.3 环境变量配置

```bash
# 开发环境（默认）
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_PASSWORD=

# 生产环境
export REDIS_HOST=your-redis-host
export REDIS_PORT=6379
export REDIS_PASSWORD=your-password
```

---

## 7. 验证测试

### 7.1 功能测试清单

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 连接测试 | 启动应用，查看日志 | Redis 连接成功 |
| 发送对话 | 调用 `/api/chat` | Redis 中有数据 |
| 重启恢复 | 重启应用，调用对话 | 会话历史恢复 |
| 查询列表 | 调用 `/api/chat/sessions` | 返回会话列表 |
| 查询消息 | 调用 `/api/chat/messages/{id}` | 返回消息历史 |
| 清空历史 | 调用 `/api/chat/clear` | Redis 数据清空 |
| 删除会话 | 调用 `DELETE /api/chat/session/{id}` | 会话被删除 |

### 7.2 测试脚本

#### 7.2.1 发送对话

```bash
curl -X POST http://localhost:9900/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "Id": "test-session-001",
    "Question": "你好"
  }'
```

#### 7.2.2 查询会话列表

```bash
curl http://localhost:9900/api/chat/sessions
```

#### 7.2.3 查询会话消息

```bash
curl http://localhost:9900/api/chat/messages/test-session-001
```

#### 7.2.4 清空历史

```bash
curl -X POST http://localhost:9900/api/chat/clear \
  -H "Content-Type: application/json" \
  -d '{"Id": "test-session-001"}'
```

#### 7.2.5 删除会话

```bash
curl -X DELETE http://localhost:9900/api/chat/session/test-session-001
```

### 7.3 Redis 数据验证

```bash
# 连接 Redis
docker exec -it super-biz-redis redis-cli

# 查看所有 Key
KEYS chat:*

# 查看会话元数据
HGETALL chat:session:test-session-001

# 查看消息列表
LRANGE chat:messages:test-session-001 0 -1

# 查看时间线
ZREVRANGE chat:sessions:timeline 0 -1 WITHSCORES
```

---

## 8. 常见问题

### 8.1 Redis 连接失败

**现象：** 应用启动报错 `Unable to connect to Redis`

**解决方案：**

1. 检查 Redis 是否启动：
```bash
docker ps | grep redis
```

2. 检查端口是否被占用：
```bash
lsof -i :6379
```

3. 检查防火墙设置

### 8.2 序列化错误

**现象：** `JsonMappingException` 或反序列化失败

**解决方案：**

确保 `RedisConfig` 中配置了正确的 `ObjectMapper`：

```java
@Bean
public ObjectMapper objectMapper() {
    return JsonMapper.builder()
        .addModule(new JavaTimeModule())  // 支持 LocalDateTime
        .build();
}
```

### 8.3 内存溢出

**现象：** 长时间运行后 Redis 内存占用过高

**解决方案：**

1. 设置最大内存和淘汰策略（已在 Docker 启动命令中配置）
2. 定期清理过期会话
3. 考虑使用 Redis Cluster 水平扩展

### 8.4 并发问题

**现象：** 消息丢失或顺序错乱

**解决方案：**

- Redis 的 `List` 操作是原子的
- 使用 `rightPush` 保证顺序
- 如需更高并发性能，考虑使用 Lua 脚本

---

## 9. 后续优化方向

1. **会话过期策略**：设置 TTL 自动清理长时间未使用的会话
2. **消息搜索**：集成 Redis Search 支持全文搜索
3. **数据归档**：定期将旧会话归档到数据库
4. **集群部署**：使用 Redis Cluster 支持大规模部署
5. **监控告警**：添加 Redis 监控和告警

---

## 10. 附录

### 10.1 Redis 命令速查

```bash
# String
SET key value
GET key

# Hash
HSET key field value
HGET key field
HGETALL key
HDEL key field

# List
LPUSH key value
RPUSH key value
LRANGE key start stop
LLEN key
LPOP key
RPOP key

# ZSet
ZADD key score member
ZREVRANGE key start stop
ZRANGE key start stop
ZREM key member
ZCARD key
```

### 10.2 相关文档

- [Spring Data Redis 官方文档](https://docs.spring.io/spring-data/redis/docs/current/reference/html/)
- [Redis 命令参考](https://redis.io/commands/)
- [Docker Redis 镜像](https://hub.docker.com/_/redis)

---

## 11. 实施总结 (2026-03-29)

### 11.1 实施状态

✅ **已完成** - Redis 对话历史持久化系统已成功集成

### 11.2 实际文件清单

**新增 6 个文件：**

| 路径 | 说明 |
|------|------|
| `src/main/java/org/example/dto/ChatMessage.java` | 消息实体类 |
| `src/main/java/org/example/dto/ChatSession.java` | 会话实体类 |
| `src/main/java/org/example/dto/SessionListResponse.java` | 会话列表响应类 |
| `src/main/java/org/example/repository/ChatSessionRepository.java` | Redis 数据访问层 |
| `src/main/java/org/example/service/ChatSessionService.java` | 会话管理服务层 |
| `src/main/java/org/example/config/RedisConfig.java` | Redis 配置类 |

**修改 3 个文件：**

| 路径 | 修改内容 |
|------|----------|
| `pom.xml` | 添加 `spring-boot-starter-data-redis` 和 `commons-pool2` 依赖 |
| `src/main/resources/application.yml` | 添加 Redis 连接配置 |
| `src/main/java/org/example/controller/ChatController.java` | 集成 ChatSessionService，新增 3 个查询接口 |

**新增 3 个 API 接口：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/chat/sessions` | 查询会话列表（支持分页） |
| GET | `/api/chat/messages/{sessionId}` | 获取会话消息历史 |
| DELETE | `/api/chat/session/{sessionId}` | 删除会话 |

### 11.3 关键设计决策

#### 11.3.1 双写策略（内存 + Redis）

采用 Write-Through 模式：
- 内存作为一级缓存，保证高性能
- Redis 作为持久化存储，保证数据不丢失
- 每次消息更新同时写入内存和 Redis

```java
// ChatController 中的双写逻辑
session.addMessage(request.getQuestion(), fullAnswer);  // 写内存
chatSessionService.addMessage(session.getSessionId(), request.getQuestion(), fullAnswer);  // 写 Redis
```

#### 11.3.2 会话恢复 + LLM 摘要压缩

服务重启后的恢复策略：
1. 从 Redis 加载全部历史消息
2. 如果超出 `MAX_WINDOW_SIZE` (6 对)：
   - 旧消息：调用 LLM 生成摘要（200 字以内）
   - 最近消息：完整保留在内存中
3. 摘要注入到系统提示词的"早期对话摘要"区块

**优势：**
- 内存始终保持在合理大小
- 早期信息通过摘要形式保留
- LLM 上下文不会超长

#### 11.3.3 线程安全设计

- `SessionInfo` 内部使用 `ReentrantLock` 保护消息列表
- Redis 的 `List` 操作本身就是原子的
- 摘要字段使用 `volatile` 保证可见性

### 11.4 Bug 修复记录

| 问题 | 描述 | 修复 |
|------|------|------|
| 流式接口 sessionId 为 null | `request.getId()` 可能为 null | 改用 `session.getSessionId()` |
| getSessionInfo 重启后失效 | 只查内存，Redis 数据被忽略 | 补充 Redis 查询作为 fallback |
| ObjectMapper Bean 冲突 | `RedisConfig` 和 `WebConfig` 都定义了 | 删除 `RedisConfig` 中的重复 Bean |

### 11.5 未实现/待优化

| 项 | 说明 |
|----|------|
| 会话过期策略 | 目前数据永久保留，可添加 TTL 自动清理 |
| 消息搜索 | 可集成 Redis Search 支持全文搜索 |
| 数据归档 | 可定期将旧会话归档到数据库 |
| 集群部署 | 当前单 Redis 实例，大规模部署可用 Cluster |

### 11.6 启动 Redis

```bash
docker run -d \
  --name super-biz-redis \
  -p 6379:6379 \
  -v $(pwd)/data/redis:/data \
  redis:7-alpine \
  redis-server --appendonly yes --appendfsync everysec
```

### 11.7 验证测试

```bash
# 发送对话
curl -X POST http://localhost:9900/api/chat \
  -H "Content-Type: application/json" \
  -d '{"Id": "test-001", "Question": "你好"}'

# 查询会话列表
curl http://localhost:9900/api/chat/sessions

# 查询会话消息
curl http://localhost:9900/api/chat/messages/test-001

# 删除会话
curl -X DELETE http://localhost:9900/api/chat/session/test-001
```

---

**文档结束**
