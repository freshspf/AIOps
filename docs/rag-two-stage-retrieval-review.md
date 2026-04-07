# RAG 检索架构说明

> 更新时间：2026-04-07

这份文档只描述**当前线上代码所采用的 RAG 检索链路**。  
实验设计、数据扩充和评测结果，分别放在：

- `docs/rag-eval-plan.md`
- `rag-eval-data/docs/experiment_method_overview.md`
- `rag-eval-data/docs/experiment_report_20260329.md`

## 1. 当前链路

当前检索流程已经从“单阶段向量召回”升级为：

```text
原始 query
  -> QueryRewriteService.rewriteQuery()
  -> QueryRewriteService.generateHyDE() [optional]
  -> VectorSearchService.searchSimilarDocuments()
  -> RetrievalPipelineService.mapToRetrievedChunks()
  -> DashScopeRerankService.rerank()
  -> applyPerDocCap()
  -> final topK
  -> RagService / InternalDocsTools
```

## 2. 每一层负责什么

### Query rewrite

作用：

- 在多轮场景下做简单指代消解
- 让当前 query 更接近“可检索表达”

### HyDE

作用：

- 先生成一段假设性回答文档
- 用这段文本做粗排 embedding
- 在短 query 或描述过于口语化时增强粗排稳定性

### Milvus 粗排

作用：

- 从大量 chunk 里先召回一批候选
- 当前默认不是直接拿 Top3 给大模型，而是先拿更大的候选集

### rerank 精排

作用：

- 对粗排候选再次做 query-doc 相关性排序
- 当前实现使用 DashScope rerank API

### per-doc-cap

作用：

- 限制同一文档最多进入多少个 chunk
- 避免相邻 chunk 挤满最终上下文

## 3. 当前配置重点

当前最关键的配置项是：

```yaml
rag:
  recall-top-k: 12
  final-top-k: 4
  per-doc-cap: 2
  search:
    nprobe: 16
  query-rewrite:
    enabled: true
    hyde-enabled: true
  rerank:
    enabled: true
    model: qwen3-rerank
```

这些参数的含义：

- `recall-top-k`：Milvus 粗排候选数
- `final-top-k`：最后送给 LLM 的 chunk 数
- `per-doc-cap`：同一文档最终最多保留几个 chunk
- `nprobe`：Milvus IVF_FLAT 粗排时的搜索参数
- `query-rewrite.enabled`：是否启用 query 改写
- `hyde-enabled`：是否启用 HyDE
- `rerank.enabled`：是否启用真实 rerank

## 4. 文档分片与 embedding

当前文档分片仍以 Markdown 结构为主：

- 按标题层级和段落切分
- 为每个 chunk 维护 `breadcrumb`

当前 embedding 使用的不是纯正文，而是：

```text
retrieval text = breadcrumb + "\n" + raw content
```

也就是说：

- `raw content` 用于保存正文内容本体
- `retrieval text` 用于向量化和粗排检索
- `breadcrumb` 同时保留在 metadata 里，便于后续展示和拼接上下文

## 5. 相关代码

主要文件：

- `src/main/java/com/spf/service/RetrievalPipelineService.java`
- `src/main/java/com/spf/service/VectorSearchService.java`
- `src/main/java/com/spf/service/DashScopeRerankService.java`
- `src/main/java/com/spf/service/QueryRewriteService.java`
- `src/main/java/com/spf/service/RagService.java`
- `src/main/java/com/spf/agent/tool/InternalDocsTools.java`
- `src/main/java/com/spf/service/DocumentChunkService.java`
- `src/main/java/com/spf/service/VectorIndexService.java`

## 6. 当前收益

这条链路相比最初版本解决了几个核心问题：

- 不再把 Milvus TopK 直接送给 LLM
- 能在多轮场景下做 query 改写
- 能通过 HyDE 提升部分 query 的粗排稳定性
- 能通过 rerank 改善候选排序质量
- 能通过 `per-doc-cap` 控制重复上下文

## 7. 当前边界

这套方案仍然有明确限制：

- 还没有做 BM25 或 hybrid recall
- PDF 解析和结构化切分还未正式接入
- query rewrite / HyDE 仍然依赖 prompt 驱动，不是严格规则系统
- rerank 带来质量提升的同时，也增加了延迟

## 8. 建议阅读顺序

如果想快速理解当前实现，建议按这个顺序看：

1. `RetrievalPipelineService`
2. `QueryRewriteService`
3. `VectorSearchService`
4. `DashScopeRerankService`
5. `DocumentChunkService`
6. `VectorIndexService`
