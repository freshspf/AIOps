# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Project Overview

SuperBizAgent is an enterprise AI agent system with two main flows:

- RAG intelligent Q&A based on Milvus vector search plus DashScope generation
- AIOps intelligent operations based on a Planner / Executor / Replanner multi-agent flow

Tech stack:

- Backend: Java 17, Spring Boot 3.2, Spring AI, Maven
- Frontend: React 19, TypeScript, Vite, Zustand

Default ports:

- Backend: `9900`
- Frontend dev server: `5173`

## Repository Structure

Top-level directories:

- `src/main/java/com/spf/`: Spring Boot application code
- `src/main/resources/application.yml`: backend runtime config
- `web-ui/`: React + TypeScript frontend
- `aiops-docs/`: markdown documents uploaded into the vector store
- `docs/`: design notes and implementation plans
- `rag-eval-data/`: offline RAG evaluation datasets, scripts, and result snapshots
- `uploads/`: uploaded file storage
- `target/`: Maven build output

Backend structure:

- `controller/`: HTTP and SSE endpoints, mainly chat and upload entrypoints
- `service/`: chat orchestration, session management, RAG, vector indexing/search, AIOps flow
- `config/`: Spring configuration for Milvus, Redis, file upload, web settings
- `dto/`: request / response / domain transfer objects
- `repository/`: chat session persistence access
- `client/`: Milvus client factory
- `tool/` and `agent/`: agent tools and agent-related logic

Frontend structure:

- `web-ui/src/components/`: UI components
- `web-ui/src/hooks/`: client hooks such as chat and SSE handling
- `web-ui/src/services/`: API access
- `web-ui/src/stores/`: Zustand state
- `web-ui/src/types/`: shared frontend types
- `web-ui/src/lib/`: utility helpers

## Build And Run Commands

Backend:

```bash
export DASHSCOPE_API_KEY=your-key
mvn clean install
mvn spring-boot:run
```

Backend shortcuts from the root `Makefile`:

```bash
make init      # Start Milvus Docker, start backend, wait for readiness, upload aiops-docs
make up        # Start Milvus-related Docker services
make down      # Stop Milvus-related Docker services
make start     # Start Spring Boot in background and write server.log / server.pid
make stop      # Stop Spring Boot
make restart   # Restart backend and wait for readiness
make upload    # Upload aiops-docs/*.md
make check     # Check backend health via /milvus/health
make status    # Inspect Milvus Docker status
```

Frontend:

```bash
cd web-ui
npm install
npm run dev
npm run build
npm run lint
```

Frontend dev server proxies `/api` and `/milvus` to `http://localhost:9900`.

## Environment And Runtime Notes

- `DASHSCOPE_API_KEY` is required for real model calls.
- Redis overrides supported by the project docs: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`.
- Backend config also references Redis and Milvus settings in `src/main/resources/application.yml`.
- `prometheus.mock-enabled` and `cls.mock-enabled` are enabled by default, so some operations use mock data.
- `make init` and `make up` require Docker / docker-compose.
- The backend currently depends on external services; local verification may fail if Milvus, Redis, or DashScope are unreachable.
- Chat history is persisted to Redis and can be recovered after restart.

## Architecture

Backend flow under `src/main/java/com/spf/`:

```text
ChatController -> ChatService -> ReactAgent
               -> AiOpsService -> Supervisor / Planner / Executor / Replanner
```

Key backend responsibilities:

- `ChatController`: unified HTTP and SSE API entrypoint, session lifecycle, session recovery orchestration
- `ChatService`: RAG chat orchestration, ReactAgent creation, tool wiring, prompt construction, summary generation
- `ChatSessionService`: Redis-backed session persistence, paging, recovery, and message-window handling
- `AiOpsService`: multi-agent alert analysis and final report generation
- `DocumentChunkService` -> `VectorEmbeddingService` -> `VectorIndexService`: document chunking, embedding, and Milvus indexing
- `VectorSearchService`: similarity retrieval for RAG

Frontend flow under `web-ui/`:

- React app with Zustand state
- `useChat` and SSE-related hooks drive streaming chat behavior
- Vite proxies `/api` and `/milvus` to the backend
- Path aliases are defined in `web-ui/vite.config.ts`

## Key API Endpoints

Chat and session APIs:

- `POST /api/chat`: non-streaming chat
- `POST /api/chat_stream`: streaming chat over SSE
- `POST /api/chat/clear`: clear session history
- `GET /api/chat/session/{id}`: get session metadata
- `GET /api/chat/sessions`: list sessions with pagination
- `GET /api/chat/messages/{id}`: get session message history
- `DELETE /api/chat/session/{id}`: delete a session

Other APIs:

- `POST /api/ai_ops`: AIOps analysis over SSE
- `POST /api/upload`: upload `.txt` or `.md` files for vectorization
- `GET /milvus/health`: Milvus health check

Request / response conventions:

- Chat request body: `{"Id": "session-id", "Question": "user question"}`
- Standard JSON endpoints return unified wrapper format: `{"code": 200, "message": "success", "data": {...}}`
- SSE endpoints stream `content` chunks and finish with a `done` event payload

## Documentation Rules

Current documentation layout:

- `docs/`: project-facing design, architecture, API, evaluation, and frontend docs
- `aiops-docs/`: markdown knowledge-base source files uploaded into the vector store
- `rag-eval-data/`: offline RAG evaluation assets, labels, queries, scripts, and reports
- `简历以及面试话术/`: interview prep material; not product/project docs

Project docs under `docs/` are organized as:

- `docs/api/SuperBizAgent-API.md`: complete backend API document
- `docs/api/chat-session-api.md`: chat session API details
- `docs/frontend-features.md`: frontend feature overview and implementation notes
- `docs/redis-persistence-plan.md`: Redis persistence design and implementation plan
- `docs/redis-persistence-session-context.md`: current session/persistence context and follow-up notes
- `docs/rag-two-stage-retrieval-review.md`: current RAG retrieval architecture and review notes
- `docs/rag-eval-plan.md`: RAG evaluation plan
- `docs/eval_paln/rag_eval_data_expansion_plan.md`: expanded RAG eval dataset and experiment plan

RAG evaluation assets under `rag-eval-data/` are organized as:

- `rag-eval-data/corpus/`: evaluation corpus split into `core/`, `variants/`, and `distractors/`
- `rag-eval-data/queries/`: evaluation query CSV files
- `rag-eval-data/labels/`: golden labels for retrieval evaluation
- `rag-eval-data/results/` and `rag-eval-data/results_relaxed/`: saved evaluation outputs
- `rag-eval-data/docs/`: experiment notes and reports
- `rag-eval-data/eval_rag.py`: local evaluation script

Documentation placement rules:

- API or request/response changes go under `docs/api/`
- RAG retrieval, indexing, query rewrite, rerank, or eval changes go under the `docs/rag*.md` family or `docs/eval_paln/`
- Evaluation datasets, labels, scripts, or snapshots belong under `rag-eval-data/`
- Session persistence, Redis, memory, and recovery changes go under the `docs/redis-*.md` family
- Frontend behavior or interaction changes go to `docs/frontend-features.md`
- New AIOps markdown knowledge content belongs in `aiops-docs/`, not `docs/`
- Interview scripts and prep notes belong in `简历以及面试话术/`, not `docs/`

Documentation maintenance requirements:

- Every new feature or meaningful behavior change must update the corresponding docs in the same task; do not leave documentation follow-up for a later pass.
- Every interview-worthy feature must also update `README.md` in the same task so the GitHub landing page makes the project highlights obvious at a glance.
- For `README.md` feature highlights, summarize each new capability using three short parts:
  - the pain point it solves
  - the core implementation idea
  - the resulting effect or validation outcome
- If any API changes, update `docs/api/SuperBizAgent-API.md`
- If chat session APIs change, also update `docs/api/chat-session-api.md`
- If RAG retrieval behavior, ranking strategy, indexing context, or evaluation plan changes, update the corresponding `docs/rag*.md` or `docs/eval_paln/*.md`
- If offline eval datasets, labels, scripts, or result baselines change, update the relevant files under `rag-eval-data/` and their companion docs
- If architecture, persistence flow, or implementation status changes, update `docs/redis-persistence-session-context.md`
- If frontend behavior changes, update `docs/frontend-features.md`
- If knowledge-base source documents change for retrieval content, update files under `aiops-docs/` as needed
- If new project files are introduced for the persistence/session area, update the related file list in `docs/redis-persistence-session-context.md`
- If a change resolves or introduces a known limitation, update the corresponding docs in the same task

When finishing feature work, use this checklist:

- If a new feature was added, update the relevant design, usage, or status docs before considering the task complete
- If the new feature is a visible project highlight, update `README.md` with a concise `pain point / solution / result` summary
- If API changed, update the API docs and append an entry to their update log
- If RAG behavior changed, update the relevant retrieval/eval docs
- If eval datasets or baselines changed, update `rag-eval-data/` artifacts as needed
- If architecture or persistence behavior changed, update the session-context doc
- If frontend behavior changed, update the frontend docs
- If vector knowledge content changed, update the corresponding `aiops-docs/*.md`
- If new files were added, reflect them in the relevant docs
- If a known issue was fixed or a new one was found, update the known issues section

## Project-Specific Notes

Chat persistence:

- Persistence uses Redis with a write-through pattern to memory plus Redis
- Repository keys include `chat:session:{sessionId}`, `chat:messages:{sessionId}`, and `chat:sessions:timeline`
- On recovery, old messages beyond the recent window are summarized by `ChatService.summarizeConversation()`
- `ChatController.getOrCreateSession()` coordinates Redis recovery and summary injection

Layering conventions:

- Controller layer handles HTTP/SSE and returns `ApiResponse<T>`
- Service layer contains business logic and external-service coordination
- Repository layer handles persistence access such as Redis
- DTO layer carries transport and session data

## Testing And Validation

There is no stable backend unit test suite or frontend integration test suite in this repository today.

Use these checks depending on the area changed:

Backend-only changes:

```bash
mvn clean install
make check
```

Frontend-only changes:

```bash
cd web-ui
npm run lint
npm run build
```

Full-stack changes:

```bash
mvn clean install
cd web-ui && npm run lint && npm run build
make check
```

Manual smoke checks after relevant changes:

- Open `http://localhost:5173` for frontend dev or `http://localhost:9900` if serving from backend static assets
- Verify chat requests work through `/api/chat` or `/api/chat_stream`
- Verify session APIs if chat persistence or history handling changed
- Verify `/milvus/health` returns success when vector functionality is touched
- Re-run `make upload` if document ingestion, chunking, embedding, or vector indexing logic changed
- Use `curl -N` or another SSE-capable client when verifying streaming endpoints

## Code Style Conventions

General:

- Follow existing code before introducing new patterns.
- Keep changes narrowly scoped; do not refactor unrelated files.
- Do not revert user changes already present in the worktree unless explicitly asked.

Backend conventions:

- Use Java 17 features conservatively and stay consistent with the current Spring Boot style.
- Keep package organization under `org.example` by responsibility: `controller`, `service`, `config`, `dto`, `repository`, `tool`.
- Controllers should stay thin and delegate orchestration to services.
- Reuse existing DTOs and service boundaries instead of pushing ad hoc maps and inline logic across layers.
- Match the existing formatting style: 4-space indentation, `LoggerFactory` loggers, Spring annotations, and descriptive method names.
- Prefer extending existing services such as `ChatService`, `ChatSessionService`, `AiOpsService`, `Vector*Service` rather than duplicating logic.

Frontend conventions:

- Use TypeScript and functional React components.
- Follow the existing alias scheme from `web-ui/vite.config.ts`, especially `@/components`, `@/hooks`, `@/services`, `@/stores`, `@/types`, `@/lib`.
- Keep stateful chat behavior in hooks and Zustand stores rather than pushing it into presentational components.
- Match the existing formatting style: no semicolons, concise function components, and import aliases instead of deep relative paths.
- Run `npm run lint` after frontend changes; the ESLint config is the main enforced style check.

Configuration conventions:

- Prefer environment variables for secrets and runtime-dependent values.
- Avoid hardcoding new credentials, URLs, or ports unless they are already repo conventions.
- If changing `application.yml`, note any external dependency or mock-mode impact in the final summary.

## Change Workflow For Agents

Before making changes:

- Read the relevant files first; this repo is actively changing.
- Check `git status --short` and avoid touching unrelated modified files.

When making changes:

- Preserve current architecture unless the task explicitly requires larger restructuring.
- Update docs in the same task when behavior, commands, endpoints, or feature scope change.
- Treat documentation maintenance as part of feature completion, not as optional cleanup.

After making changes:

- Run the smallest relevant validation commands from the section above.
- Report clearly what was changed, what was verified, and what could not be verified locally.
