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

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | Non-streaming chat |
| `/api/chat_stream` | POST | Streaming chat (SSE) |
| `/api/ai_ops` | POST | AIOps analysis (SSE) |
| `/api/chat/clear` | POST | Clear session history |
| `/api/chat/session/{id}` | GET | Get session info |
| `/api/upload` | POST | Upload file (multipart, .txt/.md) |
| `/milvus/health` | GET | Milvus connection health check |

Request body for chat endpoints: `{"Id": "session-id", "Question": "user question"}`

## Environment

- `DASHSCOPE_API_KEY` — required, Alibaba Cloud AI service key
- Milvus runs in Docker (see `vector-database.yml`), default host `100.77.244.98:19530`
- Prometheus mock mode is enabled by default (`prometheus.mock-enabled: true`)
- Chat history is currently in-memory; Redis persistence is planned (dependency exists in pom.xml)