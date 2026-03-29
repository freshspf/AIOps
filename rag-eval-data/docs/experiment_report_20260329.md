# RAG 检索评测实验报告（修正版）

> 实验时间：2026-03-29  
> 修正时间：2026-03-29 23:18  
> 评测对象：SuperBizAgent 智能运维 RAG 检索链路  
> 修正原因：原始评测脚本未使用 `labels.csv`，导致部分高相关变体文档被误判为错误结果

---

## 1. 这次修正了什么

原始实验已经保留了检索返回结果：

- [eval_20260329_230801.jsonl](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results/eval_20260329_230801.jsonl)

但原始评分逻辑有一个关键问题：

- [eval_rag.py](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/eval_rag.py) 旧版只拿 `queries.csv` 中的单个 `target_doc` 当唯一正确答案
- 实际上 [mini_eval_labels.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/labels/mini_eval_labels.csv) 已经标注了 FAQ、SOP、incident、附录以及部分“高度相关干扰文档”

这意味着：

- rerank 把更精确的 FAQ/SOP 文档排上来时
- 旧脚本会把这些结果误判为“错误”

因此，原始旧报告的主结论已失效，不能继续使用。

---

## 2. 本次评测口径

### 2.1 语料规模

| 类别 | 数量 | 说明 |
|------|------|------|
| 核心文档 | 5 | 原始 runbook |
| 同主题变体 | 8 | FAQ、SOP、事故复盘、附录 |
| 相似干扰文档 | 10 | 主题接近但答案不同 |
| 合计 | 23 | - |

### 2.2 Query 集

- 数量：30 条
- 来源：[mini_eval_queries.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/queries/mini_eval_queries.csv)

### 2.3 对比方案

| Group | 方案 | 配置 |
|-------|------|------|
| A | 纯粗排 baseline | Milvus top3 |
| C | 两阶段检索 | Milvus top12 → rerank → per-doc-cap=999（禁用） |

### 2.4 两种评分口径

本次修正后同时保留两种口径：

1. `严格口径（relevance >= 2）`
   只把强相关目标文档算命中。

2. `宽松口径（relevance >= 1）`
   只要能支持回答的问题相关文档都算命中。

这样可以把两件事情分开看：

- 是否回到了最理想的“主答案文档”
- 是否至少找到了能支撑回答的相关文档

---

## 3. 修正后的总体结果

### 3.1 严格口径（relevance >= 2）

来源：

- [summary_20260329_231808.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results/summary_20260329_231808.csv)

| Pipeline | Hit@1 | Hit@3 | MRR | Avg Latency (ms) |
|----------|------:|------:|----:|-----------------:|
| Group A: 纯粗排 | 14 (46.7%) | 22 (73.3%) | 0.589 | 528 |
| Group C: 两阶段 | 19 (63.3%) | 29 (96.7%) | 0.794 | 1214 |

结论：

- 在严格口径下，`rerank` 明显提升了排序质量
- Hit@3 从 `73.3%` 提升到 `96.7%`
- MRR 从 `0.589` 提升到 `0.794`
- 但延迟从 `528ms` 增加到 `1214ms`

### 3.2 宽松口径（relevance >= 1）

来源：

- [summary_20260329_231808.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results_relaxed/summary_20260329_231808.csv)

| Pipeline | Hit@1 | Hit@3 | MRR | Avg Latency (ms) |
|----------|------:|------:|----:|-----------------:|
| Group A: 纯粗排 | 20 (66.7%) | 26 (86.7%) | 0.767 | 528 |
| Group C: 两阶段 | 25 (83.3%) | 30 (100%) | 0.911 | 1214 |

结论：

- 在“是否找到可回答文档”的口径下，两阶段检索是稳定优于纯粗排的
- Hit@3 达到 `100%`
- MRR 也进一步提升到 `0.911`

---

## 4. 分桶结果

### 4.1 严格口径按主题分桶

来源：

- [bucket_theme_Milvus_top3_Group_A_coarse_baseline_20260329_231808.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results/bucket_theme_Milvus_top3_Group_A_coarse_baseline_20260329_231808.csv)
- [bucket_theme_Two-stage_rerank_Group_C_coarse+rerank,_no_per-doc-cap_20260329_231808.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results/bucket_theme_Two-stage_rerank_Group_C_coarse+rerank,_no_per-doc-cap_20260329_231808.csv)

| Theme | Baseline Hit@3 | Two-stage Hit@3 | 变化 |
|-------|---------------|----------------|------|
| cpu | 5/6 (83.3%) | 6/6 (100%) | +16.7% |
| disk | 5/6 (83.3%) | 6/6 (100%) | +16.7% |
| memory | 4/6 (66.7%) | 6/6 (100%) | +33.3% |
| service_unavailable | 4/6 (66.7%) | 6/6 (100%) | +33.3% |
| slow_response | 4/6 (66.7%) | 5/6 (83.3%) | +16.7% |

### 4.2 严格口径按 Query 类型分桶

来源：

- [bucket_type_Milvus_top3_Group_A_coarse_baseline_20260329_231808.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results/bucket_type_Milvus_top3_Group_A_coarse_baseline_20260329_231808.csv)
- [bucket_type_Two-stage_rerank_Group_C_coarse+rerank,_no_per-doc-cap_20260329_231808.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results/bucket_type_Two-stage_rerank_Group_C_coarse+rerank,_no_per-doc-cap_20260329_231808.csv)

| Query Type | Baseline Hit@3 | Two-stage Hit@3 | 变化 |
|------------|---------------|----------------|------|
| keyword | 5/5 (100%) | 5/5 (100%) | 不变 |
| paraphrase | 5/6 (83.3%) | 6/6 (100%) | +16.7% |
| step | 4/7 (57.1%) | 7/7 (100%) | +42.9% |
| detail | 8/12 (66.7%) | 11/12 (91.7%) | +25.0% |

这说明：

- 两阶段检索对 `step` 和 `detail` 类问题帮助最大
- 这类 query 更依赖精排，而不是只靠粗排

---

## 5. 真正还存在的问题

这次修正之后，问题不再是“rerank 是否有效”，而是下面两点。

### 5.1 延迟代价明显

从总体指标看：

- 粗排平均延迟：`528ms`
- 两阶段平均延迟：`1214ms`

也就是说：

- rerank 带来了明显效果提升
- 但代价是大约 `2.3x` 的延迟上升

这是当前最真实、最值得继续优化的问题。

### 5.2 canonical 文档偏移

两阶段检索虽然能更稳定地找到“能回答问题的文档”，但有时会更偏向：

- FAQ
- SOP
- incident
- 某个更细分的专题文档

而不是优先回到核心 runbook。

这不是绝对错误，但它暴露了一个产品设计问题：

> 系统到底是应该优先找“最适合回答当前问题的文档”，还是优先找“项目里定义的主 runbook”？

这个目标在评测时必须单独定义，不能混在一个指标里。

---

## 6. 剩余 miss 分析

### 6.1 严格口径下，纯粗排的主要 miss

纯粗排在严格口径下还有 8 个 miss，典型问题包括：

1. 没有召回 FAQ/SOP 型变体
2. 对步骤型问题更容易回到核心文档而不是 SOP
3. 对专题型问题无法稳定命中更精确的干扰文档

代表案例：

- `MEM_003`
  目标更偏 `memory_high_usage_sop.md`，但粗排只回到核心文档

- `ERR_003`
  query 更像应急 SOP，但粗排没有稳定命中 `service_unavailable_sop.md`

### 6.2 严格口径下，两阶段检索只剩 1 个 miss

唯一剩余 miss：

- `SLW_006`
  query：`城战发兵接口特别慢，怎么定位是不是 Redis 的 BigKey 访问超时引起的`
  目标强相关文档：`redis_timeout.md`

当前两阶段返回：

- `slow_response_faq.md`
- `slow_response_incident.md`
- `slow_response.md`

这说明：

- rerank 已经把问题理解成“慢响应主问题”
- 但还没有进一步路由到“Redis 超时 / BigKey”这个更精确的子主题

这会是你下一轮优化最值得盯的样本。

---

## 7. 对这次实验的正确结论

### 7.1 可以下的结论

1. `旧报告结论作废`
   旧脚本没有按 labels 计分，导致结果失真。

2. `两阶段检索在 label-aware 评测下明显优于纯粗排`
   无论严格口径还是宽松口径，Hit@1、Hit@3、MRR 都提升。

3. `当前最大问题不是效果，而是延迟`
   rerank 带来明显收益，但增加了约 2.3 倍时延。

4. `当前还存在主文档偏移问题`
   系统有时更偏向 FAQ/SOP/专题文档，而非核心 runbook。

### 7.2 暂时不要下的结论

1. 不要再说“当前阶段纯粗排优于两阶段”
2. 不要再说“rerank 对 step/detail 类型有明显负面影响”
3. 不要再拿旧版 summary 作为面试材料

---

## 8. 下一步建议

### 8.1 评测层

后续评测建议同时保留两套指标：

1. `Answer-support retrieval`
   只要能支撑回答的问题相关文档就算命中

2. `Canonical runbook routing`
   是否优先回到核心主文档

这样才能把“回答质量”和“主文档归因”拆开看。

### 8.2 检索层

下一轮建议优先尝试：

1. 调大 `recall_top_k`
   看 `SLW_006` 这类细分主题是否能先被召回

2. 给 rerank 输入补更多结构信息
   例如主题标签、文档类型标签（core/faq/sop/distractor）

3. 增加“主文档优先”的轻量规则
   在 rerank 分数接近时，对核心 runbook 做小幅加权

4. 单独构造一组“子主题路由” query
   重点测 `redis_timeout`、`db_connection_exhausted`、`disk_inode_full` 这种精细主题

---

## 9. 面试里的推荐说法

如果面试官问你实验结果，你最稳的说法是：

> 我最开始做了一版离线检索实验，但后来自己复盘时发现评测脚本口径有问题，把 FAQ、SOP 和部分高度相关专题文档误算成了错。修正成 label-aware 评测后，两阶段检索在 Hit@3 和 MRR 上是明显优于纯向量粗排的，尤其对步骤型和细节型问题提升更明显。不过它也带来了大约 2 倍以上的延迟开销，而且会出现更偏向 FAQ/SOP 而不是核心 runbook 的问题。所以我后面会把“回答支持型检索”和“主文档路由型检索”拆开评估。

这套说法的价值是：

- 你没有回避实验错误
- 你能解释为什么错
- 你还能把错误转化成更严谨的实验设计能力

---

## 10. 当前有效结果文件

### 严格口径（relevance >= 2）

- [summary_20260329_231808.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results/summary_20260329_231808.csv)
- [summary_20260329_231808.json](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results/summary_20260329_231808.json)
- [eval_rescored_20260329_231808.jsonl](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results/eval_rescored_20260329_231808.jsonl)

### 宽松口径（relevance >= 1）

- [summary_20260329_231808.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results_relaxed/summary_20260329_231808.csv)
- [summary_20260329_231808.json](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results_relaxed/summary_20260329_231808.json)
- [eval_rescored_20260329_231808.jsonl](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/results_relaxed/eval_rescored_20260329_231808.jsonl)
