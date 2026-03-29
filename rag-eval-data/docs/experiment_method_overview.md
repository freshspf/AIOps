# RAG 实验方案简版说明

> 这份文档只回答 4 个问题：
> 1. 这个实验在测什么
> 2. 数据是怎么组织的
> 3. 指标怎么看
> 4. 面试时该怎么讲

---

## 1. 实验目标

这个实验不是在测“大模型回答得好不好”，而是在测：

1. 检索能不能把正确文档找回来
2. 两阶段检索是否比纯向量粗排更有效
3. rerank 带来的收益和延迟代价分别是什么

所以它本质上是一个 `离线检索评测实验`。

---

## 2. 什么是核心文档，什么是非核心文档

### 核心文档

核心文档就是这个主题下最标准、最完整、最像主 runbook 的文档。

例如：

- [cpu_high_usage.md](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/corpus/core/cpu_high_usage.md)
- [memory_high_usage.md](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/corpus/core/memory_high_usage.md)
- [slow_response.md](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/corpus/core/slow_response.md)

它们的特点是：

- 内容完整
- 覆盖问题背景、排查步骤、原因分析、处理方案
- 可以看作“主答案文档”

### 非核心文档

非核心文档不是“错文档”，而是“不属于主 runbook 的其他相关文档”。

它分两类：

1. `同主题变体文档`
   例如 FAQ、SOP、事故复盘、附录。

2. `相似干扰文档`
   主题接近，但回答角度更细或不同。

例如：

- [cpu_high_usage_faq.md](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/corpus/variants/cpu_high_usage_faq.md)
- [service_unavailable_sop.md](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/corpus/variants/service_unavailable_sop.md)
- [redis_timeout.md](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/corpus/distractors/redis_timeout.md)

要注意：

> 非核心文档不等于错误文档。  
> 有些 query 更适合命中 FAQ/SOP，甚至更适合命中某个专题干扰文档。

所以这次实验不能只看“有没有回到核心文档”，还要看“有没有找到能回答问题的相关文档”。

---

## 3. 数据是怎么组织的

当前语料分 3 层：

1. `core/`
   核心 runbook

2. `variants/`
   FAQ、SOP、incident、appendix

3. `distractors/`
   相似但不完全相同的主题文档

这样设计的目的，是让检索更接近真实知识库场景：

- 不是只有一个标准答案
- 而是有多个相关候选
- rerank 才有发挥空间

---

## 4. Query 怎么设计

当前每个主题大概覆盖 4 类 query：

1. `keyword`
   关键词直问

2. `paraphrase`
   口语化改写

3. `step`
   步骤型问题

4. `detail`
   细节型问题

这样做的原因是：

- keyword 容易测基础召回
- paraphrase 容易测语义理解
- step/detail 更能测 rerank 是否有效

---

## 5. 评测分组

本次对比两组：

### Group A

`Milvus top3`

含义：

- 只做向量粗排
- 直接取前 3 个结果

### Group C

`Milvus top12 -> rerank -> top3`

含义：

- 先粗排召回 12 个候选
- 再用 rerank 重排
- 最后取前 3 个结果

这个对比的意义是：

> 看 rerank 到底有没有比“纯粗排”更好。

---

## 6. 为什么要用 labels.csv

因为一个 query 可能不止一个“合理答案文档”。

例如：

- 问步骤型问题时，SOP 可能比核心 runbook 更合适
- 问 Redis BigKey 超时时，`redis_timeout.md` 可能比 `slow_response.md` 更合适

所以需要 [mini_eval_labels.csv](/Users/joer/Gitroom/SuperBizAgent/rag-eval-data/labels/mini_eval_labels.csv) 来标注：

- 哪些文档是强相关
- 哪些文档是弱相关但可接受

否则就会把很多合理结果误判成错误。

---

## 7. 两种评测口径

### 严格口径

`relevance >= 2`

意思：

- 只把强相关文档算命中
- 更接近“有没有找到最理想答案”

### 宽松口径

`relevance >= 1`

意思：

- 只要找到能支持回答的问题相关文档，就算命中
- 更接近“能不能回答出来”

这两种口径都要保留，因为它们回答的是两个不同问题：

1. 有没有命中最理想文档
2. 有没有命中可用文档

---

## 8. 核心指标

### Hit@1

Top1 是否命中。

意义：

- 看第一名排得准不准

### Hit@3

Top3 中是否至少有一个命中。

意义：

- 这是最适合对外讲的主指标

### MRR

第一个正确结果排在第几位。

意义：

- 看排序质量
- rerank 是否真的起作用

### Avg Latency

平均检索耗时。

意义：

- 看效果提升的性能代价

---

## 9. 这次实验最重要的结论

修正评分口径后，结论是：

1. `rerank 是有效的`
   在严格口径和宽松口径下，Hit@1、Hit@3、MRR 都优于纯粗排。

2. `延迟明显增加`
   两阶段检索的耗时大约是纯粗排的 2 倍多。

3. `会出现主文档偏移`
   rerank 有时更偏向 FAQ、SOP 或专题文档，而不是核心 runbook。

所以当前最准确的说法不是“rerank 没用”，而是：

> rerank 提升了检索效果，但也带来了延迟代价和主文档偏移问题。

---

## 10. 面试时怎么讲

你可以直接这么说：

> 我做过一版离线 RAG 检索实验。语料分成核心 runbook、同主题变体文档和相似干扰文档三层，query 也覆盖关键词、口语化、步骤型和细节型问题。评测时我用两种口径：严格口径看是否找到最理想答案文档，宽松口径看是否找到能支持回答的相关文档。结果上，两阶段检索在 Hit@3 和 MRR 上都优于纯向量粗排，但延迟会增加，而且有时会更偏向 FAQ 或 SOP，而不是主 runbook。所以我后面会继续优化 rerank 和主文档优先策略。

---

## 11. 你自己记住一句话

> 核心文档是主 runbook，非核心文档不是错文档，而是 FAQ、SOP、专题文档这些“也可能更适合回答当前问题”的候选。
