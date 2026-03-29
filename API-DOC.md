# SuperBizAgent API 文档

## 概述

SuperBizAgent 是一个基于 Spring Boot 3.2.0 和阿里云 DashScope 的智能运维助手系统。系统提供文件上传、向量检索、AI 对话和智能运维分析等功能。

**服务地址**: `http://localhost:9900`

**技术栈**:
- Spring Boot 3.2.0
- Spring AI Alibaba 1.1.0
- Milvus 2.6.10 (向量数据库)
- DashScope API (通义千问)

---

## 目录

- [聊天接口](#聊天接口)
  - [普通对话](#普通对话)
  - [流式对话](#流式对话)
  - [清空会话历史](#清空会话历史)
  - [获取会话信息](#获取会话信息)
- [智能运维接口](#智能运维接口)
- [文件上传接口](#文件上传接口)
- [健康检查接口](#健康检查接口)

---

## 聊天接口

### 普通对话

支持多轮对话和工具调用的普通聊天接口（非流式返回）。

**接口地址**: `POST /api/chat`

**Content-Type**: `application/json`

**请求参数**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Id | String | 否 | 会话ID，首次可为空，系统自动生成 |
| Question | String | 是 | 用户问题内容 |

**请求示例**:

```json
{
  "Id": "session-123",
  "Question": "帮我分析一下最近的告警"
}
```

**响应参数**:

| 字段 | 类型 | 说明 |
|------|------|------|
| code | Integer | 状态码，200表示成功 |
| message | String | 响应消息 |
| data | Object | 响应数据 |
| data.success | Boolean | 是否成功 |
| data.answer | String | AI回答内容 |
| data.errorMessage | String | 错误信息（失败时） |

**响应示例**:

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "success": true,
    "answer": "根据最近的告警数据..."
  }
}
```

---

### 流式对话

支持多轮对话和工具调用的流式聊天接口，使用 SSE (Server-Sent Events) 返回。

**接口地址**: `POST /api/chat_stream`

**Content-Type**: `application/json`

**响应类型**: `text/event-stream`

**请求参数**: 同 [普通对话](#普通对话)

**SSE 事件格式**:

| type | 说明 |
|------|------|
| content | 内容块 |
| error | 错误信息 |
| done | 流结束标记 |

**响应示例**:

```
event: message
data: {"type":"content","data":"根据"}

event: message
data: {"type":"content","data":"最近的告警"}

event: message
data: {"type":"done","data":null}
```

---

### 清空会话历史

清空指定会话的历史消息记录。

**接口地址**: `POST /api/chat/clear`

**Content-Type**: `application/json`

**请求参数**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Id | String | 是 | 会话ID |

**请求示例**:

```json
{
  "Id": "session-123"
}
```

**响应示例**:

```json
{
  "code": 200,
  "message": "success",
  "data": "会话历史已清空"
}
```

---

### 获取会话信息

获取指定会话的详细信息。

**接口地址**: `GET /api/chat/session/{sessionId}`

**路径参数**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | String | 是 | 会话ID |

**响应示例**:

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "sessionId": "session-123",
    "messagePairCount": 5,
    "createTime": 1710123456789
  }
}
```

---

## 智能运维接口

### AI 智能运维分析

自动分析告警并生成运维报告，使用多 Agent 协作模式。

**接口地址**: `POST /api/ai_ops`

**响应类型**: `text/event-stream`

**说明**: 无需请求参数，系统自动读取告警并执行分析流程。

**SSE 事件格式**: 同 [流式对话](#流式对话)

**响应示例**:

```
event: message
data: {"type":"content","data":"正在读取告警并拆解任务...\n"}

event: message
data: {"type":"content","data":"📋 **告警分析报告**\n\n"}

event: message
data: {"type":"done","data":null}
```

---

## 文件上传接口

### 上传文件

上传文本或 Markdown 文件，并自动创建向量索引。

**接口地址**: `POST /api/upload`

**Content-Type**: `multipart/form-data`

**请求参数**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | 上传的文件（支持 .txt, .md） |

**请求示例** (cURL):

```bash
curl -X POST http://localhost:9900/api/upload \
  -F "file=@document.txt"
```

**响应参数**:

| 字段 | 类型 | 说明 |
|------|------|------|
| code | Integer | 状态码，200表示成功 |
| message | String | 响应消息 |
| data | Object | 响应数据 |
| data.fileName | String | 文件名 |
| data.filePath | String | 文件存储路径 |
| data.fileSize | Long | 文件大小（字节） |

**响应示例**:

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "fileName": "document.txt",
    "filePath": "./uploads/document.txt",
    "fileSize": 1024
  }
}
```

**错误响应**:

```json
{
  "code": 400,
  "message": "不支持的文件格式，仅支持: txt,md"
}
```

---

## 健康检查接口

### Milvus 健康检查

检查 Milvus 向量数据库连接状态。

**接口地址**: `GET /milvus/health`

**响应示例** (成功):

```json
{
  "message": "ok",
  "collections": ["documents", "logs"]
}
```

**响应示例** (失败):

```json
{
  "message": "连接失败: Connection refused",
  "collections": []
}
```

---

## 统一响应格式

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
  "code": 500,
  "message": "错误描述",
  "data": null
}
```

---

## 会话管理

### 会话生命周期

- 会话通过 `Id` 字段标识
- 首次请求时 `Id` 可为空，系统自动生成 UUID
- 系统保留最多 **6 对消息**（12 条记录）
- 超出限制时，自动删除最早的消息对

### 历史消息格式

```json
[
  {"role": "user", "content": "用户问题1"},
  {"role": "assistant", "content": "AI回复1"},
  {"role": "user", "content": "用户问题2"},
  {"role": "assistant", "content": "AI回复2"}
]
```

---

## 工具调用

系统支持以下工具（由 ReactAgent 自动调用）：

- 查询 Prometheus 指标
- 获取 CLS 云日志服务日志
- 向量检索（基于 Milvus）
- 获取当前时间
- 其他自定义工具

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用（如 Milvus 连接失败） |

---

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| DASHSCOPE_API_KEY | 通义千问 API Key | - |
| MILVUS_HOST | Milvus 地址 | localhost |
| MILVUS_PORT | Milvus 端口 | 19530 |

### 服务端口

| 服务 | 端口 |
|------|------|
| 应用服务 | 9900 |
| Milvus | 19530 |

---

## 注意事项

1. **向量索引**: 文件上传成功后会自动创建向量索引，即使索引失败，文件仍会保存
2. **文件去重**: 上传同名文件会覆盖旧文件及其向量索引
3. **流式超时**: SSE 流式接口超时时间为 5 分钟（普通对话）和 10 分钟（AI 运维分析）
4. **会话隔离**: 不同会话的历史消息互不影响

---

## 更新日志

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-03-23 | 初始版本 |