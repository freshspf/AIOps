# SuperBizAgent

> 基于 Spring Boot + AI Agent 的智能问答与运维系统

## 📖 项目简介

企业级智能业务代理系统，包含三大核心模块：

### 1. RAG 智能问答
集成 Milvus 向量数据库和阿里云 DashScope，提供基于检索增强生成的智能问答能力，支持多轮对话和流式输出。

### 2. AIOps 智能运维
基于 AI Agent 的自动化运维系统，采用 Planner-Executor-Replanner 架构，实现告警分析、日志查询、智能诊断和报告生成。

### 3. 对话历史持久化 ⭐ 新增
基于 Redis 的对话历史持久化，支持会话恢复、历史查询和智能摘要压缩。

## 🚀 核心特性

- ✅ **RAG 问答**: 向量检索 + 多轮对话 + 流式输出
- ✅ **AIOps 运维**: 智能诊断 + 多 Agent 协作 + 自动报告
- ✅ **会话持久化**: Redis 存储 + LLM 摘要压缩 + 自动恢复
- ✅ **工具集成**: 文档检索、告警查询、日志分析、时间工具
- ✅ **会话管理**: 会话列表、历史查询、自动清理
- ✅ **Web 界面**: 提供测试界面和 RESTful API

## 🛠️ 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Java | 17 | 开发语言 |
| Spring Boot | 3.2.0 | 应用框架 |
| Spring AI Alibaba | 1.1.0 | AI Agent 框架 |
| DashScope | 2.17.0 | 阿里云 AI 服务 |
| Milvus | 2.6.10 | 向量数据库 |
| Redis | 7.x | 会话持久化 |

## 📦 核心模块

```
SuperBizAgent/
├── src/main/java/org/example/
│   ├── controller/
│   │   ├── ChatController.java          # 统一接口控制器 ⭐
│   │   ├── FileUploadController.java    # 文件上传控制器
│   │   └── MilvusCheckController.java   # Milvus 健康检查
│   ├── service/
│   │   ├── ChatService.java             # 对话服务 ⭐
│   │   ├── ChatSessionService.java      # 会话持久化服务 ⭐
│   │   ├── AiOpsService.java            # AIOps 服务 ⭐
│   │   └── Vector*.java                 # 向量服务
│   ├── repository/
│   │   └── ChatSessionRepository.java   # Redis 数据访问层 ⭐
│   ├── agent/tool/                       # Agent 工具集
│   │   ├── DateTimeTools.java           # 时间工具
│   │   ├── InternalDocsTools.java       # 文档检索
│   │   ├── QueryMetricsTools.java       # 告警查询
│   │   └── QueryLogsTools.java          # 日志查询
│   ├── dto/                             # 数据传输对象 ⭐
│   │   ├── ChatMessage.java
│   │   ├── ChatSession.java
│   │   └── SessionListResponse.java
│   └── config/                          # 配置类
│       ├── RedisConfig.java             # Redis 配置 ⭐
│       └── MilvusConfig.java
├── src/main/resources/
│   ├── static/                          # Web 界面
│   ├── application.yml.template         # 配置模板 ⭐
│   └── application.yml                  # 本地配置（不提交）
├── docs/                                # 项目文档 ⭐
│   ├── redis-persistence-plan.md        # Redis 持久化方案
│   ├── redis-persistence-session-context.md  # AI 上下文文档
│   └── api/
│       ├── SuperBizAgent-API.md         # 完整 API 文档
│       └── chat-session-api.md          # 会话 API 详述
├── web-ui/                              # 前端项目
└── aiops-docs/                          # 运维文档库
```

⭐ 标记为新增/更新的模块

## 📡 核心接口

### 1. 智能问答接口

**流式对话（推荐）**
```bash
POST /api/chat_stream
Content-Type: application/json

{
  "Id": "session-123",
  "Question": "什么是向量数据库？"
}
```
支持 SSE 流式输出、自动工具调用、多轮对话。

**普通对话**
```bash
POST /api/chat
Content-Type: application/json

{
  "Id": "session-123",
  "Question": "什么是向量数据库？"
}
```
一次性返回完整结果，支持工具调用和多轮对话。

### 2. AIOps 智能运维接口

```bash
POST /api/ai_ops
```
自动执行告警分析流程，生成运维报告（SSE 流式输出）。

### 3. 会话管理 ⭐ 新增

```bash
# 获取会话列表（分页）
GET /api/chat/sessions?page=1&pageSize=20

# 获取会话消息历史
GET /api/chat/messages/{sessionId}?limit=50

# 清空会话历史
POST /api/chat/clear
{"Id": "session-123"}

# 获取会话信息
GET /api/chat/session/{sessionId}

# 删除会话
DELETE /api/chat/session/{sessionId}
```

### 4. 文件管理

```bash
# 上传文件并自动向量化
POST /api/upload

# Milvus 健康检查
GET /milvus/health
```

## ⚙️ 配置说明

### 配置文件

项目使用 `application.yml.template` 作为配置模板，首次运行需要：

```bash
# 复制模板文件
cp src/main/resources/application.yml.template src/main/resources/application.yml

# 编辑配置，填入实际值
```

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DASHSCOPE_API_KEY` | ✅ | - | 阿里云 AI 服务密钥 |
| `REDIS_HOST` | ❌ | localhost | Redis 服务器地址 |
| `REDIS_PORT` | ❌ | 6379 | Redis 端口 |
| `REDIS_PASSWORD` | ❌ | - | Redis 密码 |
| `MILVUS_HOST` | ❌ | localhost | Milvus 服务器地址 |
| `MILVUS_PORT` | ❌ | 19530 | Milvus 端口 |

### 启动 Redis（会话持久化）

```bash
docker run -d \
  --name super-biz-redis \
  -p 6379:6379 \
  -v $(pwd)/data/redis:/data \
  redis:7-alpine \
  redis-server --appendonly yes --appendfsync everysec
```

## 🚀 快速开始

### 1. 环境准备

```bash
# 设置 API Key
export DASHSCOPE_API_KEY=your-api-key

# 启动 Redis（会话持久化）
docker run -d --name super-biz-redis -p 6379:6379 redis:7-alpine
```

### 2. 启动应用

**方法一：手动启动**
```bash
# 1. 启动向量数据库
docker compose up -d -f vector-database.yml

# 2. 启动服务
mvn clean install
mvn spring-boot:run
```

**方法二：一键启动**
```bash
make init  # 自动启动向量数据库并上传运维文档到向量库
```

### 3. 使用示例

**Web 界面**
```
http://localhost:9900
```

**命令行**
```bash
# 上传文档
curl -X POST http://localhost:9900/api/upload \
  -F "file=@document.txt"

# 智能问答
curl -X POST http://localhost:9900/api/chat \
  -H "Content-Type: application/json" \
  -d '{"Id":"test","Question":"什么是向量数据库？"}'

# 查询会话列表
curl http://localhost:9900/api/chat/sessions

# 健康检查
curl http://localhost:9900/milvus/health
```

## 📚 文档

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | 项目规范与文档索引 |
| [docs/api/SuperBizAgent-API.md](docs/api/SuperBizAgent-API.md) | 完整 API 文档 |
| [docs/redis-persistence-plan.md](docs/redis-persistence-plan.md) | Redis 持久化技术方案 |

## 🔧 开发指南

### 新增功能后文档更新

根据 [CLAUDE.md](CLAUDE.md) 中的文档管理规范：

1. **API 变更** → 更新 `docs/api/SuperBizAgent-API.md`
2. **架构变更** → 更新 `docs/redis-persistence-session-context.md`
3. **新增文件** → 更新「相关文件清单」

### 代码提交

```bash
# 提交代码
git add .
git commit -m "feat: 你的功能描述"

# 推送到远程
git push
```

---

**版本**: v1.1.0
**作者**: chief
**许可证**: MIT