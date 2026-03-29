# RAG 两阶段检索改动说明

## 文档目的

这份文档用于 review 最近一次 RAG 检索链路改动。

本次改动的核心目标，是把检索链路从：

`Milvus 直接 topK -> 给 LLM`

升级成：

`Milvus 粗排 -> DashScope rerank 精排 -> 文档级去重/限流 -> 给 LLM`

这次不是只搭结构，而是已经把真实 rerank 模型接入进来了。

---

## 本次改动解决了什么问题

改动前：

1. RAG 直接使用 `VectorSearchService.searchSimilarDocuments(query, topK)`
2. `topK` 结果直接送给 LLM
3. 同一文档相邻 chunk 容易同时进入上下文
4. 没有独立精排阶段
5. 没有真实 rerank 模型

改动后：

1. Milvus 先做粗排召回候选
2. DashScope 官方 rerank API 再做精排
3. 再按单文档上限做结果限流
4. 最终只把少量高质量 chunk 送给 LLM
5. 新增真实 rerank 相关配置与降级逻辑

---

## 总体设计

### 新链路

```text
query
 -> VectorSearchService.searchSimilarDocuments(query, recallTopK)
 -> RetrievalPipelineService.mapToRetrievedChunks()
 -> DashScopeRerankService.rerank()
 -> applyPerDocCap()
 -> final topK
 -> RagService / InternalDocsTools
```

### 设计原则

1. **Milvus 只做粗排**
   `VectorSearchService` 仍然只负责向量召回，不承担检索编排。

2. **rerank 单独抽象**
   `RerankService` 作为统一接口，后续可继续切换不同 provider 或本地模型。

3. **失败时可降级**
   如果真实 rerank 调用失败，当前会自动回退为粗排结果，避免整条链路不可用。

---

## 关键文件

### 新增文件

- `src/main/java/com/spf/dto/RetrievedChunk.java`
  - 两阶段检索中的统一结果对象
  - 包含 content、metadata、vectorScore、rerankScore、finalScore 等字段

- `src/main/java/com/spf/service/RerankService.java`
  - 精排接口抽象

- `src/main/java/com/spf/config/RerankConfig.java`
  - 真实 rerank 配置项

- `src/main/java/com/spf/service/DashScopeRerankService.java`
  - 当前默认的真实精排实现
  - 使用 DashScope 官方 rerank API
  - 默认模型是 `qwen3-rerank`

- `src/main/java/com/spf/service/RetrievalPipelineService.java`
  - 检索编排层
  - 负责粗排、rerank、去重/限流、输出最终结果

### 修改文件

- `src/main/java/com/spf/service/VectorSearchService.java`
  - 支持 `nprobe` 配置
  - 解析 metadata JSON
  - 返回原始分数和归一化后的粗排分数
  - 暴露 source/fileName/title/chunkIndex 等字段

- `src/main/java/com/spf/service/RagService.java`
  - 不再直接调用 `VectorSearchService`
  - 改为走 `RetrievalPipelineService`
  - prompt context 中补充标题和来源文件信息

- `src/main/java/com/spf/agent/tool/InternalDocsTools.java`
  - 改为走两阶段检索 pipeline

- `src/main/resources/application.yml`
- `src/main/resources/application.yml.template`
  - 新增真实 rerank 相关配置

### 删除文件

- `src/main/java/com/spf/service/HeuristicRerankService.java`
  - 已删除
  - 当前不再保留本地 heuristic 精排实现

---

## 配置项

当前配置如下：

```yaml
rag:
  top-k: 3
  recall-top-k: 12
  final-top-k: 4
  per-doc-cap: 2
  search:
    nprobe: 16
  rerank:
    enabled: true
    provider: dashscope
    model: qwen3-rerank
    base-url: https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank
    timeout-ms: 10000
    max-input-chars: 1200
    instruct: "Given a user query, retrieval a list of passages that are relevant to the query"
```

### 配置含义

- `recall-top-k`
  - Milvus 粗排候选数
  - 当前默认 `12`

- `final-top-k`
  - rerank 后真正送给 LLM 的结果数
  - 当前默认 `4`

- `per-doc-cap`
  - 单文档最多保留多少个 chunk
  - 当前默认 `2`

- `rag.search.nprobe`
  - IVF_FLAT 搜索时探测的簇数
  - 当前默认 `16`

- `rag.rerank.model`
  - 当前默认模型：`qwen3-rerank`

- `rag.rerank.base-url`
  - DashScope 官方 rerank HTTP endpoint

- `rag.rerank.timeout-ms`
  - HTTP 超时时间

- `rag.rerank.max-input-chars`
  - 每个候选在送入 rerank 模型时允许的最大字符数

- `rag.rerank.instruct`
  - qwen3-rerank 支持的排序指令

---

## 核心实现说明

### 1. VectorSearchService 改动

粗排仍然由 Milvus 完成，但结果不再只是：

- `id`
- `content`
- `score`

现在还会解析：

- `rawScore`
- `metadataMap`
- `source`
- `fileName`
- `title`
- `chunkIndex`

此外，`score` 不再直接使用 Milvus 原始 L2 距离，而是先做简单归一化：

```text
normalizedScore = 1 / (1 + rawL2Score)
```

这样更方便与后续 rerank 结果一起使用。

### 2. RetrievedChunk

`RetrievedChunk` 是两阶段检索中的统一中间对象。

它承接：

- 粗排结果
- rerank 分数
- 最终分数
- metadata 与来源信息

这样 `RagService` 和工具层不再依赖 Milvus 返回对象细节。

### 3. DashScopeRerankService

当前已经接入真实 rerank 模型。

输入格式：

- `query`
- `documents[]`

每个 document 由以下内容拼接而成：

- 标题
- 来源文件
- chunk 内容

如果长度过长，再通过 `max-input-chars` 截断。

当前默认模型：

- `qwen3-rerank`

当前实现特点：

1. 通过 HTTP 调用 DashScope 官方 rerank API
2. 读取 `output.results` 中的 `index + relevance_score`
3. 将分数映射回原始 `RetrievedChunk`
4. 以 rerank score 作为最终排序依据

### 4. RetrievalPipelineService

它负责把检索流程真正串起来：

1. 先调用 Milvus 粗排
2. 将粗排结果映射成 `RetrievedChunk`
3. 如果启用 rerank，则调用 `RerankService`
4. 如果 rerank 失败，则降级回粗排顺序
5. 执行 `per-doc-cap`
6. 返回最终候选

`per-doc-cap` 的作用是减少：

- 同一文档多个相邻 chunk 同时进入最终上下文
- 候选结果信息重复、覆盖面变差

### 5. RagService / InternalDocsTools

两者都改成依赖 `RetrievalPipelineService`，而不是直接依赖 `VectorSearchService`。

这意味着：

- 普通 RAG 回答
- Agent 的内部文档工具调用

现在使用的是同一套“两阶段检索 + 真实 rerank”逻辑。

---

## 当前限制

1. **当前只接了单一 provider**
   - 默认是 DashScope rerank
   - 还没有做多 provider 切换

2. **当前 rerank 分数直接作为最终分数**
   - 还没有做 score fusion
   - 是否需要和向量分数组合，要通过评测决定

3. **粗排 metric 仍沿用现有配置**
   - 本次没有同时调整 embedding / metric / collection schema
   - 这部分后续还值得单独 review

4. **暂未引入 score threshold**
   - 当前一定会输出候选
   - 后续可增加低质量候选过滤阈值

5. **失败时降级回粗排**
   - 当前可用性优先
   - 还没有更细的重试、熔断或缓存策略

---

## 建议 review 重点

1. **架构边界是否合理**
   - `VectorSearchService` 是否仍只做粗排
   - `RetrievalPipelineService` 是否承担了应有的编排职责

2. **真实 rerank 接法是否合理**
   - 候选文档拼接格式是否合适
   - `max-input-chars` 默认值是否合理
   - `instruct` 是否需要保留

3. **去重/限流策略是否合理**
   - `per-doc-cap=2` 是否适合作为默认值
   - 是否需要补更细的 chunk 去重逻辑

4. **配置默认值是否合理**
   - `recall-top-k=12`
   - `final-top-k=4`
   - `nprobe=16`
   - `max-input-chars=1200`

---

## 编译验证

本次改动完成后，应执行：

```bash
mvn -q -DskipTests compile
```

---

## 下一步可继续做的事

如果这版你 review 认可，后续建议按这个顺序继续：

1. 给检索链路补离线评测
2. 评估是否切换更合理的 metric / index 参数
3. 视需要补 score threshold / score fusion
4. 再考虑引入 hybrid recall

---

## 一句话总结

这次改动的本质，是把 RAG 从“一阶段直接召回”升级成了“使用真实 rerank 模型的两阶段检索架构”，并为后续评测、调参与混合召回打下了结构基础。
