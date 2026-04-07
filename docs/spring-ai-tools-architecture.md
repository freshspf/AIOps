# Spring AI Tools 封装原理

本文档详细说明项目中 `@Tool` 注解的封装机制、工具注册流程、Agent 调用链路以及双源工具架构。

---

## 1. 什么是 Spring AI 的 @Tool

Spring AI 的 `@Tool` 注解是 Function Calling 的 Java 实现。它的核心作用是：**把一个普通 Java 方法"暴露"给 LLM，让 LLM 能像调用 API 一样主动调用这个方法**。

### 基本结构

```java
@Component
public class MyTool {

    @Tool(description = "告诉 LLM 这个工具是干什么的、什么时候该用")
    public String myMethod(
        @ToolParam(description = "告诉 LLM 这个参数应该填什么") String param
    ) {
        // 业务逻辑，返回字符串结果给 LLM
        return "结果";
    }
}
```

关键点：
- `@Tool` 的 `description` 是写给 **LLM 看**的，LLM 根据这段描述决定"用户的问题该不该用这个工具"
- `@ToolParam` 的 `description` 同理，帮助 LLM 理解"该传什么值进来"
- 返回值是 `String`（通常用 JSON），LLM 拿到结果后继续生成回答

### 为什么返回 String 而不是对象

因为 LLM 只能理解文本。即使你内部用了复杂的 Java 对象，最终都必须序列化成字符串交给 LLM。所以项目里的工具方法统一返回 JSON 字符串，用 Jackson 的 `ObjectMapper` 做序列化。

---

## 2. 项目中的四个 Tool

| Tool 类 | 方法 | 职责 | 依赖 |
|---------|------|------|------|
| `DateTimeTools` | `getCurrentDateTime()` | 获取当前时间 | 无，纯工具方法 |
| `InternalDocsTools` | `queryInternalDocs(query)` | RAG 知识库检索 | `RetrievalPipelineService` |
| `QueryMetricsTools` | `queryPrometheusAlerts()` | Prometheus 告警查询 | OkHttp + Prometheus API |
| `QueryLogsTools` | `queryLogs(region, topic, query, limit)` | CLS 日志查询 | Mock / CLS API |
| | `getAvailableLogTopics()` | 获取可用日志主题 | Mock |

### 2.1 DateTimeTools — 最简单的 Tool

```java
@Component
public class DateTimeTools {

    @Tool(description = "Get the current date and time in the user's timezone")
    public String getCurrentDateTime() {
        return LocalDateTime.now()
            .atZone(LocaleContextHolder.getTimeZone().toZoneId())
            .toString();
    }
}
```

无参无依赖，返回 ISO-8601 格式时间。LLM 看到"当前时间"类问题时，会自动调用这个工具。

### 2.2 InternalDocsTools — 封装 RAG 检索链路

```java
@Component
public class InternalDocsTools {

    private final RetrievalPipelineService retrievalPipelineService;

    @Tool(description = "Use this tool to search internal documentation...")
    public String queryInternalDocs(
        @ToolParam(description = "Search query...") String query
    ) {
        // 1. 调用两阶段检索管道
        List<RetrievedChunk> searchResults = retrievalPipelineService.retrieve(query);

        // 2. 结果为空时返回结构化空响应
        if (searchResults.isEmpty()) {
            return "{\"status\": \"no_results\", ...}";
        }

        // 3. 序列化为 JSON 返回给 LLM
        return objectMapper.writeValueAsString(searchResults);
    }
}
```

这是 Tool 封装的典型模式：**一个简单的 Java 方法，内部封装了完整的业务链路（query 改写 → HyDE → Milvus 粗召回 → Rerank 精排），对外只暴露一个 query 参数**。LLM 不需要知道检索链路有多复杂，只需要传一个问题进来。

### 2.3 QueryMetricsTools — Mock/真实双模式

```java
@Component
public class QueryMetricsTools {

    @Value("${prometheus.mock-enabled:false}")
    private boolean mockEnabled;

    @Tool(description = "Query active alerts from Prometheus alerting system...")
    public String queryPrometheusAlerts() {
        List<SimplifiedAlert> alerts;

        if (mockEnabled) {
            alerts = buildMockAlerts();        // 返回模拟数据
        } else {
            alerts = fetchPrometheusAlerts();   // 调用真实 API
        }

        // 统一序列化为 JSON
        return objectMapper.writerWithDefaultPrettyPrinter()
            .writeValueAsString(output);
    }
}
```

设计要点：
- 通过 `@Value` 读取配置决定走 Mock 还是真实 API，对调用方（LLM）透明
- 真实模式用 OkHttp 调 Prometheus 的 `/api/v1/alerts` 接口
- Mock 数据和知识库文档（`aiops-docs/`）中的告警场景对齐，保证 AIOps 流程可演示
- 错误处理统一返回 `{"success": false, "message": "..."}` 格式，LLM 能理解失败原因

### 2.4 QueryLogsTools — 多方法 Tool

这个 Tool 类有两个 `@Tool` 方法，是项目中唯一一个注册了多个工具方法的类：

```java
@Tool(description = "Get all available log topics...")
public String getAvailableLogTopics() { ... }

@Tool(description = "Query logs from Cloud Log Service...")
public String queryLogs(
    @ToolParam(description = "地域...") String region,
    @ToolParam(description = "日志主题...") String logTopic,
    @ToolParam(description = "查询条件...") String query,
    @ToolParam(description = "返回条数...") Integer limit
) { ... }
```

设计巧妙之处：`@Tool` 的 description 里直接告诉 LLM 有哪些可用的 logTopic 和对应的告警类型（如 `system-metrics` 对应 `HighCPUUsage`），这样 LLM 在选择参数时不需要先调用 `getAvailableLogTopics`，减少一轮工具调用。

---

## 3. 工具注册机制

### 3.1 Spring 容器管理

所有 Tool 类都是 `@Component`，由 Spring IoC 容器管理。Service 层通过 `@Autowired` 注入：

```java
@Autowired
private DateTimeTools dateTimeTools;

@Autowired
private InternalDocsTools internalDocsTools;

@Autowired
private QueryMetricsTools queryMetricsTools;

@Autowired(required = false)  // 注意：optional 注入
private QueryLogsTools queryLogsTools;
```

`QueryLogsTools` 用 `required = false` 是因为：
- Mock 模式下，`cls.mock-enabled=true`，本地 Bean 存在，正常注入
- 真实模式下，`cls.mock-enabled=false`，Bean 不注册（或由 MCP 提供替代能力），不能注入失败

### 3.2 动态工具数组

```java
public Object[] buildMethodToolsArray() {
    if (queryLogsTools != null) {
        return new Object[]{dateTimeTools, internalDocsTools, queryMetricsTools, queryLogsTools};
    } else {
        return new Object[]{dateTimeTools, internalDocsTools, queryMetricsTools};
    }
}
```

这是一个策略选择：**根据运行环境动态决定注册哪些 Tool**。Mock 模式多注册一个 `QueryLogsTools`，真实模式下日志查询由 MCP 服务器提供。

### 3.3 注册到 Agent

```java
public ReactAgent createReactAgent(DashScopeChatModel chatModel, String systemPrompt) {
    return ReactAgent.builder()
            .name("intelligent_assistant")
            .model(chatModel)
            .systemPrompt(systemPrompt)
            .methodTools(buildMethodToolsArray())  // 本地 Java @Tool 方法
            .tools(getToolCallbacks())              // MCP 远程工具
            .build();
}
```

`ReactAgent` 接受两类工具源：
- **`methodTools()`** — 本地 Java 对象，Spring AI 扫描其中的 `@Tool` 方法，自动注册
- **`tools()`** — `ToolCallback[]` 数组，来自 MCP 服务器提供的远程工具

---

## 4. LLM 如何调用 Tool — React Agent 循环

`ReactAgent`（Reasoning + Acting）实现了工具调用的核心循环：

```
用户提问
    ↓
① LLM 推理：分析问题，决定是否需要调用工具
    ↓
② 选择工具 + 填充参数：根据 @Tool 和 @ToolParam 的 description
    ↓
③ 执行工具：调用 Java 方法，拿到 JSON 结果
    ↓
④ LLM 再次推理：基于工具结果，决定是否还需要调用其他工具
    ↓
   ┌─── 需要更多工具 → 回到 ②
   │
   └─── 信息足够 → 生成最终回答
```

### 一个具体的调用示例

用户问："现在有几个告警在触发？"

```
① LLM 推理："用户问告警状态，我有 queryPrometheusAlerts 工具可以用"
② LLM 输出：tool_call(queryPrometheusAlerts, {})
③ Spring AI 执行 QueryMetricsTools.queryPrometheusAlerts()
④ 拿到 JSON 结果：
   {
     "success": true,
     "alerts": [
       {"alert_name": "HighCPUUsage", "state": "firing", "duration": "25m10s"},
       {"alert_name": "HighMemoryUsage", "state": "firing", "duration": "15m3s"},
       {"alert_name": "SlowResponse", "state": "firing", "duration": "10m22s"}
     ]
   }
⑤ LLM 推理："信息足够了，不需要再调用其他工具"
⑥ LLM 生成回答："当前有 3 个活跃告警：1) CPU 使用率过高（持续 25 分钟）..."
```

整个过程对用户是透明的，用户只看到最终回答，不知道中间发生了工具调用。

---

## 5. 双源工具架构

项目有一个精巧的设计：**同一个能力可以由本地 Tool 或 MCP 远程 Tool 提供**。

```
┌─────────────────────────────────────────────────┐
│                  ReactAgent                      │
│                                                  │
│  methodTools (本地)           tools (MCP远程)     │
│  ┌─────────────────┐        ┌─────────────────┐ │
│  │ DateTimeTools    │        │ 腾讯云 CLS 工具  │ │
│  │ InternalDocsTools│        │ (SSE 连接)      │ │
│  │ QueryMetricsTools│        └─────────────────┘ │
│  │ QueryLogsTools*  │                           │
│  └─────────────────┘                            │
└─────────────────────────────────────────────────┘

* QueryLogsTools 仅在 Mock 模式下注册
  真实模式下由 MCP 腾讯云 CLS 工具替代
```

**为什么要这样做？**

本地 Mock 工具的好处：
- 开发调试不需要连接真实的外部服务
- Mock 数据和知识库文档对齐，端到端演示一致
- 不依赖网络，CI/CD 友好

MCP 远程工具的好处：
- 真实环境下接入腾讯云 CLS 等 SaaS 服务
- MCP 是标准化协议，换服务提供商不需要改 Agent 代码
- 远程工具可以有更丰富的参数和更强大的能力

关键在于：**对 Agent 来说，本地工具和远程工具的调用方式完全一致**，都是 `tool_call → 执行 → 返回 JSON → 继续推理`。切换工具源不需要改 Agent 的推理逻辑。

---

## 6. 在不同 Agent 中的使用

### 6.1 Chat（单 Agent）

```
ChatController
    ↓
ChatService.createReactAgent(chatModel, systemPrompt)
    ↓
ReactAgent.call(question)
    ├→ LLM 自主决定调用哪些 Tool
    └→ 生成最终回答（流式 SSE 返回）
```

Chat 场景下是一个 ReactAgent 独立工作，LLM 根据用户问题自主选择工具。

### 6.2 AIOps（多 Agent 协作）

```
ChatController
    ↓
AiOpsService.executeAiOpsAnalysis(chatModel, toolCallbacks)
    ↓
SupervisorAgent（调度者）
    ├→ PlannerAgent（规划者）  ← 共享同一组 methodTools + MCP tools
    │       ↓
    │   输出执行计划（decision: PLAN/EXECUTE/FINISH）
    │       ↓
    └→ ExecutorAgent（执行者）  ← 共享同一组 methodTools + MCP tools
            ↓
        执行第一步工具调用，返回结果
            ↓
        回到 Supervisor → 交给 Planner 再规划
            ↓
        循环直到 decision=FINISH
            ↓
        输出完整的 Markdown 告警分析报告
```

三个 Agent 共享同一组工具，但职责不同：
- **Planner**：分析告警，制定计划，决定下一步做什么
- **Executor**：只执行 Planner 给的第一步，调用工具拿数据
- **Supervisor**：在 Planner 和 Executor 之间调度，判断是否继续

每个 Agent 都能独立调用工具，但 Planner 偏向"分析+规划"，Executor 偏向"执行+反馈"。

---

## 7. 错误处理策略

所有 Tool 统一采用**结构化 JSON 错误响应**，而不是抛异常：

```java
// Tool 内部
catch (Exception e) {
    return "{\"status\": \"error\", \"message\": \"Failed to query...\"}";
}
```

为什么不抛异常让 Agent 框架处理？
1. **LLM 能理解 JSON 错误** — 看到错误信息后可以调整策略，换一个工具或换一个参数重试
2. **不会中断 Agent 循环** — 异常可能导致整个 React 循环中断，而返回错误 JSON 让循环继续
3. **提示词引导** — Planner/Executor 的 system prompt 里明确写了"如果工具返回错误，记录原因并停止该方向"

---

## 8. 设计要点总结

| 设计点 | 做法 | 为什么 |
|--------|------|--------|
| Tool 描述写给 LLM 看 | `@Tool(description=...)` 精确描述能力 | LLM 依赖 description 做工具选择 |
| 返回统一 JSON | 所有 Tool 返回 JSON 字符串 | LLM 只理解文本，JSON 方便解析 |
| 错误不抛异常 | 返回 `{"success": false}` | 让 Agent 循环继续，LLM 自行调整策略 |
| Mock/真实双模式 | `@Value` + `@Autowired(required=false)` | 开发和生产环境无缝切换 |
| 工具粒度 | 每个 Tool 对应一个外部系统能力 | 职责清晰，LLM 选择简单 |
| 复杂链路封装在 Tool 内 | RAG 检索链路封装在 `InternalDocsTools` 一个方法里 | 对 LLM 来说只是一个"查文档"的操作 |
| 双源工具 | 本地 methodTools + 远程 MCP tools | 同一能力多来源，不绑定单一实现 |