# RAG 评测与数据扩充方案

> 更新时间：2026-03-29
> 目标：为 SuperBizAgent 补一套可落地的离线 RAG 实验，既能真实指导调优，也能在面试中自圆其说。

---

## 1. 方案目标

当前项目已经有：

- 文档分片
- DashScope embedding
- Milvus 向量检索
- 两阶段检索：`Milvus 粗排 -> rerank 精排 -> per-doc-cap`

但还缺两样东西：

1. 足够规模、足够像真实场景的知识库语料
2. 一套能稳定复现的离线评测方法

这份文档就是为了解决这两个问题。

---

## 2. 数据扩充原则

不要追求“文档数量看起来很多”，而要追求“文档分布像真实检索场景”。

建议把语料分成 3 层：

1. `核心文档`
   现有高质量 runbook，作为主知识源。

2. `同主题变体文档`
   基于核心文档扩成 FAQ、值班手册、事故复盘摘要、日志查询附录等不同表达形态。

3. `相似干扰文档`
   主题相近但答案不同，用来模拟真实知识库中的噪声和误召回。

---

## 3. 第一批建议补充的文档

### 3.1 现有核心文档

当前可直接作为核心语料的文档：

- [cpu_high_usage.md](/Users/joer/Gitroom/SuperBizAgent/aiops-docs/cpu_high_usage.md)
- [memory_high_usage.md](/Users/joer/Gitroom/SuperBizAgent/aiops-docs/memory_high_usage.md)
- [slow_response.md](/Users/joer/Gitroom/SuperBizAgent/aiops-docs/slow_response.md)
- [service_unavailable.md](/Users/joer/Gitroom/SuperBizAgent/aiops-docs/service_unavailable.md)
- [disk_high_usage.md](/Users/joer/Gitroom/SuperBizAgent/aiops-docs/disk_high_usage.md)

这 5 篇是第一批评测的“核心正确文档”。

### 3.2 每篇核心文档建议扩成 4 类变体

每个主题都建议再补 4 篇短文档：

1. `FAQ 版`
   形式：问答式
   用途：测试口语化 query 和问答式检索

2. `值班手册版`
   形式：checklist / SOP
   用途：测试步骤型问题和结构化文本召回

3. `事故复盘摘要版`
   形式：现象、根因、止血、长期优化
   用途：测试“原因分析”和“处理建议”型 query

4. `日志/命令附录版`
   形式：关键检索语句、日志主题、命令清单
   用途：测试关键词和细节型 query

按这个方式，5 个主题至少可以扩出：

- `5 篇核心 runbook`
- `20 篇同主题变体文档`

合计约 `25 篇文档`

### 3.3 建议新增的相似干扰文档

这些文档不用特别长，`300~800` 字即可，重点是主题接近但不完全相同：

1. `high_load_average.md`
2. `frequent_gc.md`
3. `db_connection_exhausted.md`
4. `redis_timeout.md`
5. `mq_backlog.md`
6. `disk_inode_full.md`
7. `network_latency_spike.md`
8. `pod_restart_frequently.md`
9. `http_5xx_spike.md`
10. `cache_breakdown.md`

这些文档的作用：

- 增加检索难度
- 测试向量检索是否会把相近主题误排到前面
- 更真实地体现 rerank 的价值

这样第一版知识库规模就能到：

- `25 篇主语料`
- `10 篇干扰语料`
- 合计约 `35 篇文档`

这个规模已经足够支撑一次像样的小型离线评测。

---

## 4. 优先搜集顺序

如果时间有限，按下面顺序补：

### P0：必须先补齐

1. 把 `aiops-docs/` 现有 5 篇全部正式入库
2. 每篇补一份 FAQ 版
3. 每篇补一份值班手册版

这一层完成后，大约有：

- `5 篇核心文档`
- `10 篇变体文档`
- 合计 `15 篇`

已经可以做 Mini Eval。

### P1：第二阶段补齐

1. 每篇补一份事故复盘摘要
2. 每篇补一份日志/命令附录
3. 补 5 篇相似干扰文档

这一层完成后，大约有：

- `25` 到 `30` 篇文档

已经可以做面试可讲的正式版离线评测。

### P2：后续增强

1. 补 PDF 格式文档
2. 补跨主题综合文档
3. 补更多噪声和长文档

这部分适合后续继续优化分片策略时再做。

---

## 5. 建议的目录组织

建议单独建一个评测数据目录，例如：

```text
rag-eval-data/
├── corpus/
│   ├── core/
│   ├── variants/
│   └── distractors/
├── queries/
│   ├── mini_eval_queries.csv
│   └── full_eval_queries.csv
└── labels/
    ├── mini_eval_labels.csv
    └── full_eval_labels.csv
```

### 5.1 corpus 目录

- `core/`
  放核心 runbook

- `variants/`
  放 FAQ、值班手册、复盘摘要、附录

- `distractors/`
  放相似干扰文档

### 5.2 queries 文件建议字段

```csv
query_id,query_text,query_type,target_doc,target_theme,difficulty
```

例如：

```csv
Q001,HighCPUUsage 告警怎么排查,keyword,cpu_high_usage.md,cpu,easy
Q002,CPU 飙高一般先查什么,paraphrase,cpu_high_usage.md,cpu,medium
Q003,内存告警出现 OOM 时先看什么日志,detail,memory_high_usage.md,memory,medium
```

### 5.3 labels 文件建议字段

```csv
query_id,relevant_doc,relevance_level,notes
```

其中：

- `relevance_level=2`
  高相关，目标正确文档

- `relevance_level=1`
  次相关，可作为补充材料

- `relevance_level=0`
  不相关

第一版如果想轻量一点，也可以先只做文档级主标签：

```csv
query_id,target_doc
```

---

## 6. 实验设计

建议分两阶段做。

### 6.1 Mini Eval

目的：

- 快速验证方法是否成立
- 能先拿到一版面试可讲结果

建议规模：

- `10~15` 篇文档
- `60` 条 query

来源：

- 5 篇核心文档
- 每篇 1 份 FAQ
- 每篇 1 份值班手册

每个主题出 `12` 条 query：

- 4 条关键词直问
- 4 条口语化改写
- 2 条步骤型问题
- 2 条细节型问题

### 6.2 Full Eval

目的：

- 对比不同检索方案
- 真正指导参数调优

建议规模：

- `30~35` 篇文档
- `180~240` 条 query

来源：

- 核心文档
- 同主题变体文档
- 相似干扰文档

---

## 7. Query 设计方法

每个主题的 query 都建议按固定模板出，避免题型单一。

### 7.1 每个主题建议的 query 类型

1. `告警名直问`
   例如：`HighCPUUsage 告警怎么排查`

2. `现象描述`
   例如：`CPU 使用率一直很高一般先看什么`

3. `排查步骤`
   例如：`响应时间过长时应该先查什么日志`

4. `常见原因`
   例如：`服务不可用最常见的原因有哪些`

5. `紧急处理`
   例如：`内存爆了之后 5 分钟内先做什么`

6. `长期优化`
   例如：`慢响应问题后续怎么长期治理`

7. `日志/命令细节`
   例如：`OOM 时要查什么日志主题`

8. `口语化改写`
   例如：`服务 500 特别多直接挂了怎么查`

### 7.2 难度分层

每个 query 加一个难度标签：

- `easy`
  关键词很明确

- `medium`
  口语化表达，有一定改写

- `hard`
  细节型、跨段信息型、容易和相似主题混淆

这样后面能回答：

> easy query 的命中率较高，hard query 更能体现 rerank 和分片质量。

---

## 8. 评测分组

建议至少比较 3 组：

### Group A：一阶段基线

```text
Milvus top3
```

用途：

- 当前最简单基线

### Group B：只扩大粗排候选

```text
Milvus top12 -> 取前3
```

用途：

- 看提升是不是仅仅来自“候选变多”

### Group C：两阶段检索

```text
Milvus top12 -> rerank -> per-doc-cap -> top3
```

用途：

- 看 rerank 和文档级限流是否真正带来收益

如果后续要做更多实验，再扩展：

### Group D：不同 nprobe

```text
nprobe = 8 / 16 / 32
```

### Group E：不同分片参数

```text
chunk_size = 600 / 800 / 1000
overlap = 50 / 100 / 150
```

---

## 9. 核心指标

第一版先看这 6 个指标就够了。

### 9.1 Hit@1

Top1 是否命中目标文档。

用途：

- 看第一名是否直接正确

### 9.2 Hit@3

Top3 是否至少命中一个目标文档。

用途：

- 建议作为对外主指标
- 面试里最容易解释

### 9.3 MRR

第一个正确结果的平均倒数排名。

用途：

- 体现排序质量
- 能看 rerank 是否有效

### 9.4 重复率

定义：

- Top3 结果里来自同一文档的 chunk 占比

用途：

- 体现 `per-doc-cap` 是否有效

### 9.5 平均检索延迟

拆开统计：

- embedding 耗时
- Milvus 粗排耗时
- rerank 耗时
- 总检索耗时

用途：

- 评估两阶段检索的性能代价

### 9.6 分桶命中率

按两种维度分桶：

1. `query_type`
   - keyword
   - paraphrase
   - step
   - detail

2. `theme`
   - cpu
   - memory
   - slow_response
   - service_unavailable
   - disk

用途：

- 看哪些场景效果好
- 看哪些场景需要补数据或调分片

---

## 10. 标注方法

第一版推荐：

### 10.1 文档级标注

规则：

- 只要 TopK 中出现目标文档的任意 chunk，就算命中

优点：

- 标注成本低
- 适合当前项目规模

### 10.2 Chunk 级抽样评估

对命中的结果抽样人工检查：

- 这个 chunk 是否真的足够支撑回答
- 是否只是命中了文档但段落不对

用途：

- 弥补文档级指标过于宽松的问题

推荐比例：

- 每轮随机抽 `20~30` 条 query 做 chunk 级人工检查

---

## 11. 实验输出模板

建议最终产出一张总表：

| 方案 | Hit@1 | Hit@3 | MRR | 重复率 | 平均总耗时 |
|------|------:|------:|----:|------:|----------:|
| Milvus top3 | - | - | - | - | - |
| Milvus top12 -> top3 | - | - | - | - | - |
| Milvus top12 -> rerank -> per-doc-cap -> top3 | - | - | - | - | - |

再加两张分桶表：

### 按 query 类型

| query_type | Hit@3 | MRR |
|-----------|------:|----:|
| keyword | - | - |
| paraphrase | - | - |
| step | - | - |
| detail | - | - |

### 按主题

| theme | Hit@3 | MRR |
|------|------:|----:|
| cpu | - | - |
| memory | - | - |
| slow_response | - | - |
| service_unavailable | - | - |
| disk | - | - |

---

## 12. 面试里的说法

如果后面实验真正做出来，推荐统一这么讲：

> 因为项目初期真实语料规模有限，我先以现有运维 runbook 为核心，构造了一套离线评测集。语料分成核心文档、同主题变体文档和相似干扰文档三层，尽量模拟真实知识库中的检索噪声。评测时我重点看 Hit@3、MRR、重复率和检索延迟，并比较了一阶段向量检索和两阶段检索的效果差异。这样做的目的不是追求一个漂亮数字，而是知道提升到底来自粗排、rerank，还是来自分片和去重策略。

如果面试官继续追问“你为什么这么设计实验”，可以补一句：

> 因为我这个项目的目标不是做学术 benchmark，而是做一个可运行、可调优的原型系统，所以评测方案更强调可解释性和可复现性。

---

## 13. 你接下来要做什么

### 第一步

先搜集并整理文档，优先完成：

1. 核心 5 篇文档正式入库
2. 每篇 1 份 FAQ
3. 每篇 1 份值班手册

### 第二步

把 query 集整理出来，先做 Mini Eval：

- `10~15` 篇文档
- `60` 条 query

### 第三步

再扩到 Full Eval：

- `30+` 篇文档
- `180+` 条 query

### 第四步

基于实验结果再决定：

- 分片策略怎么调
- `recall-top-k` 怎么设
- `per-doc-cap` 是否合理
- `nprobe` 是否继续调
- rerank 是否真的带来收益

---

## 14. 当前结论

对你现在这个项目，最合理的路径不是先硬讲一个 `85%`，而是先把下面这件事做扎实：

> 用一套可复现的小规模离线评测，把“文档数据扩充 + query 设计 + 指标体系 + 实验分组”全部定清楚。

只要这套方法立住了，后面的数字无论是 `80%`、`85%` 还是 `88%`，你都能讲得稳。
