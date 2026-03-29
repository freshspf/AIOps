# Chat Session API 文档

## 基础信息

| 项目 | 内容 |
|------|------|
| **Base URL** | `http://localhost:9900/api` |
| **Content-Type** | `application/json` |
| **版本** | v1.0 |
| **更新时间** | 2026-03-29 |

---

## 接口列表

### 1. 发送对话消息

**接口：** `POST /api/chat`

**描述：** 发送用户问题，获取 AI 回复。支持多轮对话，自动管理会话历史。

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Id | String | 否 | 会话ID，首次可留空，系统自动生成并返回 |
| Question | String | 是 | 用户问题 |

**请求示例：**

```bash
curl -X POST http://localhost:9900/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "Id": "session-001",
    "Question": "你好，介绍一下你自己"
  }'
```

**响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "success": true,
    "answer": "你好！我是智能助手...",
    "sessionId": "session-001"
  }
}
```

---

### 2. 流式对话（SSE）

**接口：** `POST /api/chat_stream`

**描述：** 流式返回 AI 回复，适合需要实时显示的场景。支持 Server-Sent Events (SSE)。

**请求参数：** 同 `/api/chat`

**请求示例：**

```bash
curl -N -X POST http://localhost:9900/api/chat_stream \
  -H "Content-Type: application/json" \
  -d '{
    "Id": "session-001",
    "Question": "写一首诗"
  }'
```

**响应格式：** SSE 流

```
data: {"type":"content","data":"春"}

data: {"type":"content","data":"天"}

data: {"type":"content","data":"来了"}

...

data: {"type":"done","data":null}
```

**字段说明：**

| type | 说明 |
|------|------|
| content | 内容片段，逐步输出 |
| error | 错误信息 |
| done | 完成标记 |

---

### 3. 清空会话历史

**接口：** `POST /api/chat/clear`

**描述：** 清空指定会话的历史消息，不影响会话本身。

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Id | String | 是 | 会话ID |

**请求示例：**

```bash
curl -X POST http://localhost:9900/api/chat/clear \
  -H "Content-Type: application/json" \
  -d '{"Id": "session-001"}'
```

**响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": "会话历史已清空"
}
```

---

### 4. 获取会话信息

**接口：** `GET /api/chat/session/{sessionId}`

**描述：** 获取指定会话的基本信息。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| sessionId | String | 会话ID |

**请求示例：**

```bash
curl http://localhost:9900/api/chat/session/session-001
```

**响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "sessionId": "session-001",
    "messagePairCount": 5,
    "createTime": 1712345678900
  }
}
```

---

### 5. 获取会话列表 ⭐ 新增

**接口：** `GET /api/chat/sessions`

**描述：** 获取所有会话列表，支持分页。数据从 Redis 查询，服务重启后仍可获取。

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| page | Integer | 否 | 1 | 页码 |
| pageSize | Integer | 否 | 20 | 每页大小 |

**请求示例：**

```bash
# 获取第一页（默认20条）
curl http://localhost:9900/api/chat/sessions

# 获取第二页，每页10条
curl http://localhost:9900/api/chat/sessions?page=2&pageSize=10
```

**响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "sessions": [
      {
        "sessionId": "session-001",
        "createTime": 1712345678900,
        "updateTime": 1712345999000,
        "messageCount": 10,
        "firstMessage": "你好，介绍一下你自己..."
      },
      {
        "sessionId": "session-002",
        "createTime": 1712346000000,
        "updateTime": 1712346100000,
        "messageCount": 3,
        "firstMessage": "帮我查一下今天的天气..."
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### 6. 获取会话消息历史 ⭐ 新增

**接口：** `GET /api/chat/messages/{sessionId}`

**描述：** 获取指定会话的消息历史。数据从 Redis 查询，支持限制返回数量。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| sessionId | String | 会话ID |

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| limit | Integer | 否 | 100 | 返回消息数量上限 |

**请求示例：**

```bash
# 获取全部消息（最多100条）
curl http://localhost:9900/api/chat/messages/session-001

# 只获取最近10条消息
curl http://localhost:9900/api/chat/messages/session-001?limit=10
```

**响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "role": "user",
      "content": "你好，介绍一下你自己",
      "timestamp": 1712345678900
    },
    {
      "role": "assistant",
      "content": "你好！我是智能助手...",
      "timestamp": 1712345679000
    },
    {
      "role": "user",
      "content": "你能做什么？",
      "timestamp": 1712345800000
    },
    {
      "role": "assistant",
      "content": "我可以帮助你...",
      "timestamp": 1712345801000
    }
  ]
}
```

---

### 7. 删除会话 ⭐ 新增

**接口：** `DELETE /api/chat/session/{sessionId}`

**描述：** 删除指定会话及其所有消息，同时从内存和 Redis 中删除。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| sessionId | String | 会话ID |

**请求示例：**

```bash
curl -X DELETE http://localhost:9900/api/chat/session/session-001
```

**响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": "会话已删除"
}
```

---

## 通用响应格式

所有接口返回统一的响应格式：

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | Integer | 状态码，200 表示成功 |
| message | String | 状态消息 |
| data | Object/Array/String | 返回数据 |

错误响应示例：

```json
{
  "code": 500,
  "message": "会话ID不能为空",
  "data": null
}
```

---

## 数据模型

### ChatMessage

```typescript
{
  role: "user" | "assistant",  // 消息角色
  content: string,              // 消息内容
  timestamp: number             // 时间戳（毫秒）
}
```

### SessionSummary

```typescript
{
  sessionId: string,            // 会话ID
  createTime: number,           // 创建时间
  updateTime: number,           // 更新时间
  messageCount: number,         // 消息对数
  firstMessage: string          // 第一条消息预览
}
```

---

## 使用示例

### 完整对话流程

```bash
# 1. 发送第一条消息（自动创建会话）
RESPONSE=$(curl -s -X POST http://localhost:9900/api/chat \
  -H "Content-Type: application/json" \
  -d '{"Question": "你好"}')

# 2. 提取 sessionId
SESSION_ID=$(echo $RESPONSE | jq -r '.data.sessionId')
echo "会话ID: $SESSION_ID"

# 3. 继续对话（带上 sessionId）
curl -X POST http://localhost:9900/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"Id\": \"$SESSION_ID\", \"Question\": \"你能做什么？\"}"

# 4. 查看会话历史
curl http://localhost:9900/api/chat/messages/$SESSION_ID

# 5. 查看所有会话
curl http://localhost:9900/api/chat/sessions

# 6. 清空会话历史
curl -X POST http://localhost:9900/api/chat/clear \
  -H "Content-Type: application/json" \
  -d "{\"Id\": \"$SESSION_ID\"}"

# 7. 删除会话
curl -X DELETE http://localhost:9900/api/chat/session/$SESSION_ID
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 500 | 服务器内部错误 |
| 400 | 参数错误 |

---

## 注意事项

1. **会话ID格式**：UUID 格式，由系统自动生成
2. **历史消息窗口**：内存中最多保留 6 对消息，超出部分由 LLM 摘要压缩
3. **消息持久化**：所有消息永久保存在 Redis，除非手动删除
4. **流式接口**：使用 SSE 协议，需要客户端支持 EventSource 或类似技术
5. **并发安全**：所有接口都是线程安全的