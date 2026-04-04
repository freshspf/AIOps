# RAG 两阶段检索改动说明

## 文档目的

这份文档用于 review 最近一次 RAG 检索链路改动。

本次改动的核心目标，是把检索链路从：

`Milvus 直接 topK -> 给 LLM`

升级成：

`Query rewrite / HyDE -> Milvus 粗排 -> DashScope rerank 精排 -> 文档级去重/限流 -> 给 LLM`

这次不是只搭结构，而是在已有两阶段检索基础上，继续把 query 改写、HyDE 和标题层级上下文一起接入进来了。

---

## 本次改动解决了什么问题

改动前：

1. RAG 直接使用 `VectorSearchService.searchSimilarDocuments(query, topK)`
2. `topK` 结果直接送给 LLM
3. 同一文档相邻 chunk 容易同时进入上下文
4. 没有独立精排阶段
5. 没有真实 rerank 模型

改动后：

1. 多轮场景下先做 query 改写（指代消解）
2. 可选生成 HyDE 假设文档，优先用于向量粗排
3. Milvus 先做粗排召回候选
4. DashScope 官方 rerank API 再做精排
5. 再按单文档上限做结果限流
6. 最终只把少量高质量 chunk 送给 LLM
7. 文档 embedding 时会带上标题层级 breadcrumb
8. 新增 query rewrite 相关配置与降级逻辑

---

## 总体设计

### 新链路

```text
query
 -> QueryRewriteService.rewriteQuery()
 -> QueryRewriteService.generateHyDE() [optional]
 -> VectorSearchService.searchSimilarDocuments(vectorQuery, recallTopK)
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

3. **查询增强与排序解耦**
   query 改写 / HyDE 属于粗排前的增强层，rerank 仍只负责排序，不把所有能力堆进一个组件里。

4. **失败时可降级**
   如果 query 改写、HyDE 或真实 rerank 调用失败，当前会自动回退到更基础的链路，避免整条链路不可用。

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
  - 负责 query 改写、HyDE、粗排、rerank、去重/限流、输出最终结果

- `src/main/java/com/spf/config/QueryRewriteConfig.java`
  - query 改写与 HyDE 的配置项

- `src/main/java/com/spf/service/QueryRewriteService.java`
  - 多轮指代消解
  - HyDE 假设文档生成

- `src/main/java/com/spf/context/ConversationContext.java`
  - 基于 ThreadLocal 持有近期对话与 summary
  - 供检索链路里的 query 改写读取

### 修改文件

- `src/main/java/com/spf/service/VectorSearchService.java`
  - 支持 `nprobe` 配置
  - 解析 metadata JSON
  - 返回原始分数和归一化后的粗排分数
  - 暴露 source/fileName/title/chunkIndex 等字段

- `src/main/java/com/spf/controller/ChatController.java`
  - 在普通对话与 SSE 对话中注入 `ConversationContext`
  - 对话完成或异常时清理 ThreadLocal

- `src/main/java/com/spf/service/DocumentChunkService.java`
  - 维护 Markdown 标题层级 breadcrumb
  - 构建带 breadcrumb 的 embedding 文本

- `src/main/java/com/spf/service/VectorIndexService.java`
  - 向量化时不再只用 chunk content
  - 改为使用 `breadcrumb + content`

- `src/main/java/com/spf/dto/DocumentChunk.java`
  - 新增 `breadcrumb` 字段

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
  query-rewrite:
    enabled: true
    model: qwen-turbo
    max-tokens: 200
    temperature: 0.3
    hyde-enabled: true
    hyde-max-tokens: 300
    hyde-temperature: 0.5
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

- `rag.query-rewrite.enabled`
  - 是否启用 query 改写
  - 当前默认 `true`

- `rag.query-rewrite.model`
  - query 改写与 HyDE 默认使用的轻量模型
  - 当前默认 `qwen-turbo`

- `rag.query-rewrite.hyde-enabled`
  - 是否启用 HyDE 假设文档生成
  - 当前默认 `true`

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

1. 先尝试做 query 改写
2. 如果启用 HyDE，则生成假设文档作为粗排查询文本
3. 再调用 Milvus 粗排
4. 将粗排结果映射成 `RetrievedChunk`
5. 如果启用 rerank，则调用 `RerankService`
6. 如果 rerank 失败，则降级回粗排顺序
7. 执行 `per-doc-cap`
8. 返回最终候选

`per-doc-cap` 的作用是减少：

- 同一文档多个相邻 chunk 同时进入最终上下文
- 候选结果信息重复、覆盖面变差

query 改写与 HyDE 的作用分别是：

- query 改写：让多轮场景中的短 query 变成自包含查询，减少“它/这个/上面那个”这类指代带来的召回漂移
- HyDE：先生成一段假设性回答文档，再拿这段文本做 embedding，提升短 query 场景下的粗排稳定性

### 5. 标题层级 breadcrumb 编码

这次对文档切分和向量化也做了一处补强。

`DocumentChunkService` 在按 Markdown 标题切分时，会维护一个标题层级路径，例如：

```text
RAG 智能问答 > 检索流程 > 精排阶段
```

这个 breadcrumb 会：

1. 写入 `DocumentChunk`
2. 写入 metadata
3. 在向量化时拼接到 chunk 内容前面

这样 embedding 模型在编码时，不再只看到孤立段落文本，而是能一起看到章节路径信息，对语义定位更友好。

### 6. RagService / InternalDocsTools

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

4. **query rewrite 仍是 prompt 驱动**
   - 当前没有离线数据集专门评估改写收益
   - 还需要通过 badcase 验证改写是否稳定

5. **暂未引入 score threshold**
   - 当前一定会输出候选
   - 后续可增加低质量候选过滤阈值

6. **失败时降级回粗排**
   - 当前可用性优先
   - 还没有更细的重试、熔断或缓存策略

---

## 建议 review 重点

1. **架构边界是否合理**
   - `VectorSearchService` 是否仍只做粗排
   - `RetrievalPipelineService` 是否承担了应有的编排职责

2. **query rewrite / HyDE 接法是否合理**
   - 多轮历史注入是否会引入噪声
   - HyDE 是否真的优于直接用 query 做粗排
   - 改写模型是否需要和主模型解耦

3. **真实 rerank 接法是否合理**
   - 候选文档拼接格式是否合适
   - `max-input-chars` 默认值是否合理
   - `instruct` 是否需要保留

4. **去重/限流策略是否合理**
   - `per-doc-cap=2` 是否适合作为默认值
   - 是否需要补更细的 chunk 去重逻辑

5. **breadcrumb 编码是否合理**
   - 标题路径是否会引入无关噪声
   - 是否需要限制 breadcrumb 深度或长度

6. **配置默认值是否合理**
   - `recall-top-k=12`
   - `final-top-k=4`
   - `nprobe=16`
   - `query-rewrite.max-tokens=200`
   - `hyde-max-tokens=300`
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
2. 分别评估 query rewrite / HyDE / rerank 的独立收益
3. 评估是否切换更合理的 metric / index 参数
4. 视需要补 score threshold / score fusion
5. 再考虑引入 hybrid recall

---

## 一句话总结

这次改动的本质，是把 RAG 从“直接 query 向量召回”继续升级成了“query rewrite / HyDE + 两阶段检索 + 标题层级编码”的检索架构，并为后续做混合召回和离线评测打下了结构基础。
