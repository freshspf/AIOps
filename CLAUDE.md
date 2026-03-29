# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SuperBizAgent is an enterprise AI agent system with two core modules:
- **RAG Intelligent Q&A** — vector similarity search over documents via Milvus + LLM generation via DashScope
- **AIOps Intelligent Operations** — multi-agent (Planner/Executor/Replanner) automated alert analysis and diagnosis

Full-stack: Java 17 / Spring Boot 3.2 backend + React 19 / TypeScript frontend.

## Build & Run Commands

### Backend (Maven)
```bash
# Set required env var first
export DASHSCOPE_API_KEY=your-key

# Build
mvn clean install

# Run (port 9900)
mvn spring-boot:run
```

### Frontend (web-ui/)
```bash
cd web-ui
npm install
npm run dev      # Dev server on port 5173, proxies /api and /milvus to backend
npm run build    # Production build
npm run lint     # ESLint
```

### Infrastructure & Shortcuts (Makefile)
```bash
make init        # One-shot: start Milvus Docker → start backend → upload aiops-docs
make up / down   # Start / stop Milvus Docker (vector-database.yml)
make start       # Start Spring Boot in background (nohup)
make stop        # Stop Spring Boot
make restart     # Stop + start + wait for readiness
make upload      # Upload all aiops-docs/*.md to vector DB
make check       # Health check against /milvus/health
make status      # Show Docker container status
```

No test suites currently exist in this project.

## Architecture

### Backend — `src/main/java/org/example/`

```
ChatController ──→ ChatService ──→ ReactAgent (Spring AI)
                  AiOpsService ──→ SupervisorAgent → PlannerAgent → ExecutorAgent
                                          ↑ Replanner (refines plan iteratively)
```

- **ChatService** — orchestrates RAG chat via a single `ReactAgent` that uses tools (DateTimeTools, InternalDocsTools, QueryMetricsTools, QueryLogsTools) and maintains in-memory session history keyed by session ID.
- **AiOpsService** — multi-agent pipeline: Supervisor delegates to Planner (creates analysis plan), Executor (runs tool calls), and Replanner (refines based on results). Produces a structured ops report via SSE.
- **Agent tools** (`agent/tool/`) — Spring AI `@Tool`-annotated beans. InternalDocsTools triggers vector search; QueryMetricsTools/QueryLogsTools fetch from Prometheus/CLS (both have mock modes toggled via config).
- **Vector pipeline** — `DocumentChunkService` (splits text, 800 chars max, 100 overlap) → `VectorEmbeddingService` (DashScope text-embedding-v4, 1536-dim) → `VectorIndexService` (stores in Milvus collection `biz`).
- **VectorSearchService** — similarity search in Milvus with configurable top-k.

Key config: `application.yml` — sets Milvus host/port, DashScope API key, RAG top-k, model name, mock toggles for Prometheus/CLS.

### Frontend — `web-ui/`

React app with Zustand state management. The `useChat` hook handles SSE streaming. Vite dev server proxies `/api` and `/milvus` to the backend on port 9900.

Path aliases configured: `@/` → `src/`, `@/components`, `@/hooks`, `@/services`, `@/stores`, `@/types`, `@/assets`.

SSE stream format from backend: `data: {"type":"content","data":"..."}\n` with `data: {"type":"done","data":null}` as terminator.

## Key API Endpoints

### Chat & Session

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | Non-streaming chat |
| `/api/chat_stream` | POST | Streaming chat (SSE) |
| `/api/chat/clear` | POST | Clear session history |
| `/api/chat/session/{id}` | GET | Get session info |
| `/api/chat/sessions` | GET | List all sessions (paginated) |
| `/api/chat/messages/{id}` | GET | Get session message history |
| `DELETE /api/chat/session/{id}` | DELETE | Delete a session |

### AIOps & File

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai_ops` | POST | AIOps analysis (SSE) |
| `/api/upload` | POST | Upload file (multipart, .txt/.md) |

### Health Check

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/milvus/health` | GET | Milvus connection health check |

**Request body for chat endpoints:** `{"Id": "session-id", "Question": "user question"}`

**Note:** All endpoints return unified response format: `{"code": 200, "message": "success", "data": {...}}`

## Environment

### Required

- `DASHSCOPE_API_KEY` — required, Alibaba Cloud AI service key

### Optional (Redis for Chat Persistence)

- `REDIS_HOST` — default: `localhost`
- `REDIS_PORT` — default: `6379`
- `REDIS_PASSWORD` — default: empty

**Start Redis (Docker):**
```bash
docker run -d \
  --name super-biz-redis \
  -p 6379:6379 \
  -v $(pwd)/data/redis:/data \
  redis:7-alpine \
  redis-server --appendonly yes --appendfsync everysec
```

### Infrastructure

- Milvus runs in Docker (see `vector-database.yml`), default host `100.77.244.98:19530`
- Prometheus mock mode is enabled by default (`prometheus.mock-enabled: true`)
- Chat history is persisted to Redis (messages are recoverable after restart with LLM summary compression for old messages)

---

## Documentation

### Document Structure & Purpose

All project documentation is located in `docs/` directory:

```
docs/
├── redis-persistence-plan.md           # 技术方案：Redis 持久化完整设计
├── redis-persistence-session-context.md # 会话上下文：当前实施状态，供其他 AI 继续
└── api/
    ├── SuperBizAgent-API.md            # API 文档：完整项目所有接口
    └── chat-session-api.md             # API 子文档：聊天会话接口详述
```

### Document Index

| 文档路径 | 用途 | 维护场景 |
|---------|------|----------|
| `docs/redis-persistence-plan.md` | 技术方案与实施总结 | 新增功能、架构变更时更新 |
| `docs/redis-persistence-session-context.md` | AI 会话上下文 | 每次完成工作后更新状态 |
| `docs/api/SuperBizAgent-API.md` | 完整 API 文档 | **任何 API 变更时必须更新** |
| `docs/api/chat-session-api.md` | 聊天会话 API 详述 | 聊天相关 API 变更时更新 |
| `CLAUDE.md` | 项目规范与文档索引 | 文档结构变更、规范调整时更新 |

### Documentation Maintenance Rules

**🔴 强制要求 - 完成任何功能优化后，必须同步更新以下文档：**

1. **API 变更时**
   - 更新 `docs/api/SuperBizAgent-API.md`
   - 在文档底部的「更新日志」中添加记录
   - 格式：`### YYYY-MM-DD` → 新增/修改/废弃说明

2. **架构/功能变更时**
   - 更新 `docs/redis-persistence-session-context.md` 的「已知问题/限制」和「后续优化建议」
   - 如果是重大架构变更，更新对应的技术方案文档

3. **新增文件/类时**
   - 在 `docs/redis-persistence-session-context.md` 的「相关文件清单」中补充

**🟡 建议行为：**

- 每次会话结束时，在 `redis-persistence-session-context.md` 顶部更新「会话时间」和「状态」
- 发现新的 Bug 或限制时，及时更新到对应文档的「已知问题」章节

### Documentation Update Template

当完成功能优化后，按以下检查清单更新文档：

```markdown
## 文档更新检查清单

- [ ] 如果新增/修改/删除 API → 更新 docs/api/SuperBizAgent-API.md
- [ ] 如果变更聊天相关 API → 同步更新 docs/api/chat-session-api.md
- [ ] 在 API 文档底部「更新日志」添加今日记录
- [ ] 如果涉及架构变更 → 更新 docs/redis-persistence-session-context.md
- [ ] 如果新增文件 → 更新「相关文件清单」
- [ ] 如果解决已知问题 → 从「已知问题」移除
- [ ] 如果发现新问题/限制 → 添加到「已知问题」
```

### Quick Reference for API Docs

- **Base URL:** `http://localhost:9900`
- **Response format:** `{"code": 200, "message": "success", "data": {...}}`
- **SSE stream format:** `data: {"type":"content","data":"..."}\n` with `data: {"type":"done","data":null}` as terminator

---

## Project Specifications

### Chat Persistence (Redis)

**Architecture:** Write-Through pattern (dual-write to memory + Redis)

**Data Structures:**
- `chat:session:{sessionId}` (Hash) — session metadata
- `chat:messages:{sessionId}` (List) — ordered messages
- `chat:sessions:timeline` (ZSet) — time-indexed sessions

**Session Recovery:**
- On service restart, sessions are loaded from Redis
- Messages beyond `MAX_WINDOW_SIZE` (6 pairs) are compressed by LLM into ~200-char summary
- Summary is injected into system prompt as "早期对话摘要"

**Key Classes:**
- `ChatSessionService.recoverSession()` — loads from Redis, splits old/recent
- `ChatService.summarizeConversation()` — calls DashScope LLM for summary
- `ChatController.getOrCreateSession()` — orchestrates recovery

### Coding Conventions

1. **Controller Layer** — Handle HTTP, delegate to services, return `ApiResponse<T>`
2. **Service Layer** — Business logic, coordinate with external services
3. **Repository Layer** — Data access (e.g., `ChatSessionRepository` for Redis)
4. **DTO Layer** — Data transfer objects with Lombok annotations

### Testing Notes

- No test suites currently exist
- Verify API changes with cURL examples in `docs/api/SuperBizAgent-API.md`
- Use SSE-compatible client for streaming endpoints (`curl -N` works)