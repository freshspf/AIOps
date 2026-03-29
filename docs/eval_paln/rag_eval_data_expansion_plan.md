# RAG 评测与数据扩充方案（整理版）

> 来源：Gemini 分享对话整理  
> 整理时间：2026-03-29  
> 适用对象：SuperBizAgent / 通用运维 RAG 原型系统

---

## 1. 方案目标

当前项目已经具备以下基础能力：

- 文档分片
- DashScope Embedding
- Milvus 向量检索
- 两阶段检索：`Milvus 粗排 -> Rerank 精排 -> Per-Doc-Cap`

但要把这套 RAG 系统做成一个**可调优、可解释、可复现**的原型，还缺两部分：

1. 足够规模、足够接近真实业务分布的知识库语料
2. 一套可稳定复现的离线评测方法

本方案的目标，就是补齐这两部分，并形成一套后续可直接用于实验和面试表达的离线评测体系。

---

## 2. 数据扩充原则

不要只追求“文档数量很多”，而要追求“文档分布像真实检索场景”。

建议将语料划分为三层：

### 2.1 核心文档

现有高质量 runbook，作为主知识源。

### 2.2 同主题变体文档

基于核心文档扩展出不同表达形式，例如：

- FAQ
- 值班手册 / SOP
- 事故复盘摘要
- 日志 / 命令附录

作用是模拟同一主题在真实知识库中的不同组织方式与表达风格。

### 2.3 相似干扰文档

主题相近，但答案不同。

作用是：

- 增加召回难度
- 模拟真实知识库中的噪声
- 验证 Rerank 是否真的能提升排序质量

---

## 3. 当前核心文档

以下 5 篇文档已经存在，可作为第一批评测的核心正确文档：

- `cpu_high_usage.md`
- `memory_high_usage.md`
- `slow_response.md`
- `service_unavailable.md`
- `disk_high_usage.md`

---

## 4. 文档扩充方案

### 4.1 每篇核心文档建议扩成 4 类变体

每个主题建议补齐以下 4 类短文档：

1. **FAQ 版**：问答式，测试口语化 query 与问答式检索
2. **值班手册版**：Checklist / SOP，测试步骤型问题与结构化文本召回
3. **事故复盘摘要版**：现象、根因、止血、长期优化，测试原因分析与处理建议类问题
4. **日志 / 命令附录版**：关键日志、检索语句、命令清单，测试关键词与细节型问题

如果 5 个主题都扩完，则可形成：

- 5 篇核心文档
- 20 篇同主题变体文档

共约 **25 篇主语料**。

### 4.2 相似干扰文档建议

建议补以下干扰文档：

- `high_load_average.md`
- `frequent_gc.md`
- `db_connection_exhausted.md`
- `redis_timeout.md`
- `mq_backlog.md`
- `disk_inode_full.md`
- `network_latency_spike.md`
- `pod_restart_frequently.md`
- `http_5xx_spike.md`
- `cache_breakdown.md`

补完后，第一版知识库可以达到：

- 25 篇主语料
- 10 篇干扰语料
- 合计约 **35 篇文档**

这个规模已经足够支撑一轮像样的小型离线评测。

---

## 5. 优先搜集顺序

### P0：必须先补齐

1. 把 `aiops-docs/` 现有 5 篇全部正式入库
2. 每篇补一份 FAQ 版
3. 每篇补一份值班手册版

完成后大约有：

- 5 篇核心文档
- 10 篇变体文档
- 共约 **15 篇**

这一层已经足够做 Mini Eval。

### P1：第二阶段补齐

1. 每篇补一份事故复盘摘要
2. 每篇补一份日志 / 命令附录
3. 补 5 篇相似干扰文档

完成后大约有 **25~30 篇文档**，已经够支撑正式版离线评测。

### P2：后续增强

1. 补 PDF 格式文档
2. 补跨主题综合文档
3. 补更多噪声与长文档

这部分适合后续在分片策略优化时继续推进。

---

## 6. 建议的目录组织

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

### 6.1 `corpus/`

- `core/`：核心 runbook
- `variants/`：FAQ、SOP、复盘摘要、附录
- `distractors/`：相似干扰文档

### 6.2 `queries/` 字段建议

```csv
query_id,query_text,query_type,target_doc,target_theme,difficulty
```

示例：

```csv
Q001,HighCPUUsage 告警怎么排查,keyword,cpu_high_usage.md,cpu,easy
Q002,CPU 飙高一般先查什么,paraphrase,cpu_high_usage.md,cpu,medium
Q003,内存告警出现 OOM 时先看什么日志,detail,memory_high_usage.md,memory,medium
```

### 6.3 `labels/` 字段建议

```csv
query_id,relevant_doc,relevance_level,notes
```

说明：

- `relevance_level = 2`：高相关，目标正确文档
- `relevance_level = 1`：次相关，可作为补充材料
- `relevance_level = 0`：不相关

如果先做轻量版，也可以只保留主标签：

```csv
query_id,target_doc
```

---

## 7. 实验设计

建议分两阶段推进：

### 7.1 Mini Eval

目的：

- 快速验证方法是否成立
- 先拿到一版面试可讲结果

建议规模：

- 10~15 篇文档
- 60 条 Query

来源：

- 5 篇核心文档
- 每篇 1 份 FAQ
- 每篇 1 份值班手册

每个主题出 12 条 Query：

- 4 条关键词直问
- 4 条口语化改写
- 2 条步骤型问题
- 2 条细节型问题

### 7.2 Full Eval

目的：

- 对比不同检索方案
- 真正指导参数调优

建议规模：

- 30~35 篇文档
- 180~240 条 Query

来源：

- 核心文档
- 同主题变体文档
- 相似干扰文档

---

## 8. Query 设计方法

每个主题的 Query 建议按固定模板出题，避免题型单一。

### 8.1 推荐题型

1. **告警名直问**  
   例如：`HighCPUUsage 告警怎么排查`

2. **现象描述**  
   例如：`CPU 使用率一直很高一般先看什么`

3. **排查步骤**  
   例如：`响应时间过长时应该先查什么日志`

4. **常见原因**  
   例如：`服务不可用最常见的原因有哪些`

5. **紧急处理**  
   例如：`内存爆了之后 5 分钟内先做什么`

6. **长期优化**  
   例如：`慢响应问题后续怎么长期治理`

7. **日志 / 命令细节**  
   例如：`OOM 时要查什么日志主题`

8. **口语化改写**  
   例如：`服务 500 特别多直接挂了怎么查`

### 8.2 难度分层

每条 Query 打一个难度标签：

- `easy`：关键词明确
- `medium`：有一定口语化改写
- `hard`：细节型、跨段信息型、容易与相似主题混淆

后续可以用这些标签回答：

> easy query 的命中率通常更高，hard query 更能体现 rerank 与分片质量。

---

## 9. 评测分组

建议至少比较 3 组：

### Group A：一阶段基线

```text
Milvus top3
```

用途：当前最简单基线。

### Group B：只扩大粗排候选

```text
Milvus top12 -> 取前3
```

用途：观察提升是否仅来自候选集变大。

### Group C：两阶段检索

```text
Milvus top12 -> rerank -> per-doc-cap -> top3
```

用途：验证 rerank 与文档级限流是否真正带来收益。

后续如要扩展实验，可继续做：

### Group D：不同 `nprobe`

```text
nprobe = 8 / 16 / 32
```

### Group E：不同分片参数

```text
chunk_size = 600 / 800 / 1000
overlap = 50 / 100 / 150
```

---

## 10. 核心指标

第一版先看以下 6 个指标即可：

### 10.1 Hit@1

Top1 是否命中目标文档。  
作用：判断第一名是否直接正确。

### 10.2 Hit@3

Top3 是否至少命中一个目标文档。  
作用：建议作为对外主指标，面试中也最好解释。

### 10.3 MRR

第一个正确结果的平均倒数排名。  
作用：体现排序质量，可用于判断 rerank 是否有效。

### 10.4 重复率

定义：Top3 结果中来自同一文档的 chunk 占比。  
作用：体现 `per-doc-cap` 是否有效。

### 10.5 平均检索延迟

建议拆分统计：

- embedding 耗时
- Milvus 粗排耗时
- rerank 耗时
- 总检索耗时

作用：评估两阶段检索的性能代价。

### 10.6 分桶命中率

按两个维度分桶：

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

作用：观察哪些场景效果好，哪些场景需要补数据或调整分片。

---

## 11. 标注方法

### 11.1 文档级标注

规则：只要 TopK 中出现目标文档的任意 chunk，就算命中。

优点：

- 标注成本低
- 适合当前项目规模

### 11.2 Chunk 级抽样评估

对命中的结果抽样人工检查：

- 该 chunk 是否真的足够支撑回答
- 是否只是命中了文档但段落不对

建议每轮随机抽 **20~30 条 Query** 做 chunk 级人工检查。

---

## 12. 实验输出模板

建议最终产出一张总表：

| 方案 | Hit@1 | Hit@3 | MRR | 重复率 | 平均总耗时 |
|------|------:|------:|----:|------:|----------:|
| Milvus top3 | - | - | - | - | - |
| Milvus top12 -> top3 | - | - | - | - | - |
| Milvus top12 -> rerank -> per-doc-cap -> top3 | - | - | - | - | - |

再加两张分桶表。

### 12.1 按 Query 类型

| query_type | Hit@3 | MRR |
|-----------|------:|----:|
| keyword | - | - |
| paraphrase | - | - |
| step | - | - |
| detail | - | - |

### 12.2 按主题

| theme | Hit@3 | MRR |
|------|------:|----:|
| cpu | - | - |
| memory | - | - |
| slow_response | - | - |
| service_unavailable | - | - |
| disk | - | - |

---

## 13. 面试表达版本

如果后续实验真正做出来，可以统一这样表述：

> 因为项目初期真实语料规模有限，我先以现有运维 runbook 为核心，构造了一套离线评测集。语料分成核心文档、同主题变体文档和相似干扰文档三层，尽量模拟真实知识库中的检索噪声。评测时重点看 Hit@3、MRR、重复率和检索延迟，并比较了一阶段向量检索和两阶段检索的效果差异。这样做的目的不是追求一个漂亮数字，而是知道提升到底来自粗排、rerank，还是来自分片和去重策略。

如果面试官继续追问“为什么这样设计实验”，可补一句：

> 因为这个项目的目标不是做学术 benchmark，而是做一个可运行、可调优的原型系统，所以评测方案更强调可解释性和可复现性。

---

## 14. 第一阶段已补齐的文档（Gemini 对话中已生成）

下面这些文档内容，是对话里已经继续生成出来、可直接落地的 P0 / P1 资料。

---

## 15. CPU 主题变体文档

### 15.1 `corpus/variants/cpu_high_usage_faq.md`

```markdown
# FAQ: CPU 使用率持续飙高常见问答

**Q1: 收到 HighCPUUsage 告警，第一步应该做什么？**
A: 首先确认是单机偶发还是集群大面积爆发。如果是单机，先将其从负载均衡（LB）或微服务注册中心摘除，避免影响真实用户流量；如果是大面积爆发，立刻查看是否有突发流量打入或定时任务集中触发。

**Q2: CPU 飙高一定是因为请求量变大吗？**
A: 不一定。常见的原因还包括：
1. **死循环或复杂计算**：代码逻辑 Bug（如正则回溯、无限重试跳不出）。
2. **频繁 GC（针对 Java 环境）**：内存泄漏导致老年代满，触发频繁 Full GC，GC 线程会占满 CPU。
3. **自旋锁冲突**：高并发下大量线程在 JUC 锁或 CAS 操作上自旋，白白消耗 CPU 周期。
4. **序列化/反序列化风暴**：处理超大 JSON 或缓存大对象（BigKey）时，CPU 会被大量占用。

**Q3: 怎么快速定位是哪段代码吃光了 CPU？**
A:
- **Java 进程**：通过 `top -Hp <pid>` 找出最耗 CPU 的线程 ID，将线程 ID 转为 16 进制，再去 `jstack` 输出的线程快照中 grep 这个 16 进制串，直接定位代码行。
- **Go 进程**：直接开启 pprof，使用 `go tool pprof http://localhost:port/debug/pprof/profile` 抓取 30 秒的 CPU profile，然后用 `web` 命令看火焰图。
```

### 15.2 `corpus/variants/cpu_high_usage_sop.md`

```markdown
# 值班手册：CPU 飙高应急处理 SOP

## 1. 现象确认与止血 (0-5分钟)
- [ ] **看监控**：确认当前 CPU 使用率是否超过阈值（如 >85%）且持续 3 分钟以上。
- [ ] **看流量**：检查网关层请求 QPS 是否有明显突增。
- [ ] **快速止血**：
  - 若为单节点异常，立刻重启该 Pod / 进程。
  - 若整体集群 CPU 告警且伴随响应变慢，立刻开启全局限流（Rate Limiting）或降级边缘非核心玩法/服务。

## 2. 现场留存 (5-10分钟)
> ⚠️ 警告：在重启应用前，务必抓取现场，否则后续无法定位根因！
- [ ] **执行系统命令**：`top -b -n 1 > top.log` 记录当前消耗资源的进程。
- [ ] **抓取堆栈（Java）**：执行 `jstack <pid> > jstack_$(date +%s).log`。
- [ ] **抓取采样（Go）**：执行 `wget http://127.0.0.1:port/debug/pprof/profile?seconds=30 -O cpu.pprof`。

## 3. 根因排查与恢复 (10-30分钟)
- [ ] 分析堆栈日志，排查是否存在死锁、死循环或长耗时序列化操作。
- [ ] 检查下游依赖状态：如果 MySQL 慢查询增多或 Redis 阻塞，可能会导致当前服务的工作线程（Worker Threads）全部堆积，触发 CPU 上下文切换风暴。
```

---

## 16. Memory 主题变体文档

### 16.1 `corpus/variants/memory_high_usage_faq.md`

```markdown
# FAQ: 内存使用率告警与 OOM 问答

**Q1: 为什么容器监控显示内存使用率已经 95% 了，但进程还没 OOM？**
A: 容器（Pod）的内存监控通常包含 `Working Set` 内存和 `Cache`（如 Linux Page Cache）。系统会在真正需要时回收 Cache 内存，所以只要业务进程的 RSS（常驻内存集）没超 limit，就不会触发 OOM Killer。重点关注 `container_memory_working_set_bytes` 这个指标。

**Q2: Java 服务发生 OOM (OutOfMemoryError) 后怎么查？**
A: 确保 JVM 启动参数配置了 `-XX:+HeapDumpOnOutOfMemoryError`。OOM 发生时会自动生成 `.hprof` 文件。把 dump 文件拉到本地，用 MAT (Memory Analyzer Tool) 或 JProfiler 打开，查看 Dominator Tree，通常一眼就能看出是哪个大对象或集合（如长生命周期的 Map）泄漏了。

**Q3: Go 服务内存一直在涨，怎么区分是内存泄漏还是正常的缓存堆积？**
A: 使用 pprof 查看堆内存：`go tool pprof -inuse_space http://.../debug/pprof/heap`。
1. 如果是全局变量、缓存大对象（如存了大量玩家战报数据且没设置 TTL），说明是业务层“伪泄漏”。
2. 如果是某个特定 goroutine 处理完逻辑后，关联的对象被强引用无法被 GC，或者是底层 CGO 调用的非托管内存没释放，那就是真泄漏。
```

### 16.2 `corpus/variants/memory_high_usage_sop.md`

```markdown
# 值班手册：内存告警与 OOM 处理 SOP

## 1. 响应与止血阶段
- [ ] **确认范围**：是单个 Pod 内存飙升还是所有副本同步飙升？
- [ ] **保护机制**：如果内存即将触及容器 Limit (OOM Kill 前夕)，为了防止服务雪崩，可以考虑手动触发主备切换或摘流。
- [ ] **重启恢复**：如果服务已经假死或处于持续 OOM 循环中，直接重启实例是恢复业务的最快手段。

## 2. 现场数据采集
- [ ] **自动 Dump 检查**：去指定挂载目录检查是否成功生成了堆转储（Heap Dump）文件。
- [ ] **手动 Dump（濒死前）**：如果还没死，抓紧执行 `jmap -dump:format=b,file=heap.bin <pid>` (Java) 或拉取 `pprof heap` (Go)。
- [ ] **GC 日志收集**：将发生问题前后的 `gc.log` 收集起来备查。

## 3. 分析与修复阶段
- [ ] 分析 Dump 文件，寻找占用内存 top 3 的类或数据结构。
- [ ] 检查近期是否有大批量数据加载操作（如：从 MySQL 全表扫数据到内存，或查出了超级大的 Redis BigKey）。
- [ ] 优化代码：对大集合分批处理，及时释放无用引用，或将内存态数据转移至外部 Redis 存储。
```

---

## 17. Slow Response 主题变体文档

### 17.1 `corpus/variants/slow_response_faq.md`

```markdown
# FAQ: 接口响应时间过长 (Slow Response) 常见问答

**Q1: 监控上看到 P99 响应时间突然从 50ms 飙升到 2000ms，但 P50 没变，说明什么？**
A: 这说明系统的平均处理能力还在，但有极少部分请求遇到了严重的阻塞。常见原因包括：个别大客户的超大负载请求（比如 SLG 游戏里请求超大规模的同屏战报）、长事务锁等待（MySQL 行锁争用），或者是这 1% 的请求刚好命中了发生 Full GC 的那个节点。

**Q2: 接口响应慢，和下游数据库有关吗？**
A: 高度相关。超过 80% 的接口慢响应最终都能追溯到存储层。你需要立刻排查：
1. **MySQL 慢查询**：是否有全表扫描，或者查询没走索引。
2. **连接池耗尽**：应用层的数据库连接池（如 HikariCP）是否被打满，导致新请求在排队获取连接。
3. **Redis 热 Key/大 Key**：读取超大体积的缓存对象会导致网络传输耗时剧增。

**Q3: 遇到慢响应告警，该怎么排查代码链路？**
A: 强依赖可观测性工具。打开分布式追踪系统（如 SkyWalking、Jaeger），通过 Trace ID 找到耗时最长的那个 Span。看时间是消耗在 RPC 调用、数据库查询，还是应用内部的本地方法计算上。
```

### 17.2 `corpus/variants/slow_response_incident.md`

```markdown
# 事故复盘摘要：核心玩法接口 RT 飙高导致网关堆积

**事故现象：**
某日晚高峰，核心城战玩法接口出现大面积超时，API 网关 504 错误激增。监控显示，下游处理大部队行军逻辑的微服务 P90 响应时间超过 5 秒。

**根因分析 (Root Cause)：**
1. **直接原因**：行军状态更新接口中，包含了一条复杂的 SQL，由于某个前置条件变更，导致该 SQL 避开了联合索引，退化为全表扫描。
2. **连带反应**：全表扫描导致 MySQL 侧 CPU 飙升，同时耗尽了该微服务的数据库连接池。后续所有请求都在 `getConnection()` 处阻塞，Tomcat / 协程池的工作线程被全部挂起。

**止血操作：**
1. 临时对该慢 SQL 关联的接口在网关层进行限流（Rate Limit）。
2. DBA 紧急介入，Kill 掉正在执行的慢查询事务。

**长期优化：**
引入 SQL 审计卡点，所有上线前的 DDL 和 DML 必须经过 EXPLAIN 校验；将行军坐标等高频变更数据从 MySQL 迁移至 Redis Geo 处理。
```

---

## 18. Service Unavailable 主题变体文档

### 18.1 `corpus/variants/service_unavailable_sop.md`

```markdown
# 值班手册：Service Unavailable (5xx) 应急排查 SOP

## 1. 现象界定 (0-3分钟)
- [ ] 检查网关监控：确认是 502 (Bad Gateway)、503 (Service Unavailable) 还是 504 (Gateway Timeout)。
- [ ] 502 通常意味着下游进程挂了（OOM 被杀、Panic 或 Core Dump）。
- [ ] 503 通常是下游服务主动拒绝（触发了限流、熔断器打开，或者 Pod 正在重启未就绪）。
- [ ] 504 通常是下游还在处理，但耗时太长超过了网关设置的超时时间。

## 2. 快速恢复 (3-10分钟)
- [ ] **重启或回滚**：如果刚刚有发版动作，且大面积 5xx，无需排查，立即执行回滚。
- [ ] **扩容与隔离**：如果是突发流量打挂了部分节点，将健康节点与异常节点隔离，并紧急扩容（HPA）。
- [ ] **降级开关**：开启预设的降级开关，关闭非核心的周边系统调用，保证主链路畅通。

## 3. 日志与链路排查
- [ ] 登录崩溃节点，检查 `/var/log/messages` 或 `dmesg -T`，确认是否被内核 OOM Killer 猎杀。
- [ ] 检查应用日志中的 `ERROR` 和 `FATAL` 级别信息，寻找是否有未捕获的全局异常（如 Go 的 nil pointer panic）。
```

---

## 19. Disk High Usage 主题变体文档

### 19.1 `corpus/variants/disk_high_usage_appendix.md`

```markdown
# 附录：磁盘空间与 IO 排查常用命令清单

处理磁盘高使用率（Disk High Usage）或 IO 瓶颈时，常用以下命令进行快速定位：

**1. 查空间占用 (Space Usage)**
- `df -h`：查看整体磁盘分区的使用率。
- `du -sh * | sort -hr`：在根目录下执行，找出占用空间最大的目录或文件。常见的大文件通常是未清理的 `application.log` 或遗留的 Heap Dump 文件。

**2. 查 IO 性能 (Disk I/O)**
- `iostat -x 1`：查看设备的 IO 负载。重点关注 `%util`（IO 设备的利用率，接近 100% 说明磁盘非常繁忙）和 `await`（平均等待时间，过高说明 IO 存在瓶颈）。
- `iotop`：类似 top，但专门用来查看哪个具体进程在疯狂读写磁盘。

**3. 查被删除但未释放的文件**
- `lsof | grep deleted`：有时候用 `rm` 删除了大日志文件，但 `df -h` 空间没变。这是因为还有进程占着它的句柄。通过此命令找出该进程并重启即可释放空间。
```

---

## 20. 相似干扰文档

### 20.1 `corpus/distractors/frequent_gc.md`

```markdown
# 干扰分析：频繁 GC (Garbage Collection) 引发的抖动

当系统出现频繁的垃圾回收时，通常会表现为 CPU 飙高和接口响应变慢。这就是为什么 GC 告警经常和 CPU/Slow Response 告警同时出现。

## 核心现象
1. **Young GC 频繁**：说明新生代的对象产生速度极快，通常是因为接口流量暴增，瞬间分配了大量短生命周期对象。它会导致少量的 CPU 上下文开销。
2. **Full GC 频繁**：老年代空间不足触发。这会导致严重的 STW（Stop-The-World）暂停。在这几秒钟内，所有应用线程停止执行，外部表现就是接口大量超时，甚至心跳断开导致节点被判定离线。

## 排查建议
重点排查 JVM 内存模型配置。检查 `-Xms` 和 `-Xmx` 是否一致，避免动态扩容带来的消耗。排查业务代码中是否在短时间内创建了大量大对象（比如几十 MB 的字节数组），导致对象直接绕过新生代进入老年代，迅速撑爆内存。
```

### 20.2 `corpus/distractors/redis_timeout.md`

```markdown
# 干扰分析：Redis 访问超时与慢查询排查

在分布式系统中，服务整体的 Slow Response 往往不是计算层的问题，而是存储层阻塞导致的。Redis 访问超时是最常见的导火索之一。

## 现象特征
业务网关报出大量的 HTTP 500 或 504 错误，应用日志中出现大量类似 `Redis command timed out` 或 `lettuce/redigo read timeout` 的异常堆栈。此时应用服务器本身的 CPU 和内存可能都处于极低的空闲状态。

## 排查步骤
1. **查网络**：排查应用服务器到 Redis 集群之间的网络延迟是否有尖刺（Network Latency Spike）。
2. **查慢日志**：在 Redis 执行 `SLOWLOG GET`，检查是否有 `KEYS *`、`HGETALL` 超大 Hash 结构等阻塞性命令。
3. **查 BigKey**：使用 `redis-cli --bigkeys` 扫描集群。如果某个玩家的数据或战报被塞在了一个巨型的 List 或 String 中，单线程的 Redis 处理该 Key 时会阻塞所有其他操作。
```

### 20.3 `corpus/distractors/db_connection_exhausted.md`

```markdown
# 干扰分析：数据库连接池耗尽 (Connection Pool Exhausted)

数据库连接池耗尽是导致应用层抛出大量 500 错误和请求超时的主要原因之一。它在监控上的表现经常与 CPU 飙高或慢响应混淆。

## 核心现象
应用日志中出现大量 `Timeout waiting for connection from pool` 或 `CannotGetJdbcConnectionException`。与此同时，系统的 CPU 并不高，内存也正常，但所有需要访问数据库的接口全部卡死。

## 常见原因与排查
1. **慢 SQL 拖垮**：数据库执行极其缓慢，导致借出的连接迟迟不归还，最终耗尽连接池。
2. **事务未提交**：代码逻辑存在缺陷，开启了事务 (`@Transactional`)，但在某个分支提前 return，或者发生了未捕获的异常导致连接未正确 `close()` 或 `commit()`。
3. **并发超预期**：瞬间并发量远远大于连接池的最大容量（如 max-active=50，但瞬间涌入 500 个并发写请求）。应该在应用层使用削峰填谷（如引入消息队列 MQ）。
```

### 20.4 `corpus/distractors/disk_inode_full.md`

```markdown
# 干扰分析: 磁盘 Inode 耗尽问题

这是磁盘告警中最具迷惑性的一种情况。开发者收到磁盘告警，登录机器执行 `df -h` 发现磁盘空间还有 50% 的剩余，但系统一直报错 `No space left on device`。

## 现象与根因
- **现象**：无法创建新文件，服务启动失败，无法写入日志。
- **根因**：Linux 文件系统不仅限制数据块（Block）的容量，还限制了文件数量（Inode）。如果程序生成了海量的小文件（例如：每条消息生成一个几 KB 的缓存文件，或者 Session 临时文件未清理），哪怕总共只占了 1GB 的空间，也会把 Inode 耗尽。

## 排查与解决
1. 执行 `df -i` 检查 Inode 使用率，确认是否达到 100%。
2. 执行 `find / -type d -size +1M` 或配合一段脚本，找出包含海量小文件的具体目录。
3. 紧急清理这批小文件：由于文件太多，直接 `rm -rf *` 会报错参数过长，建议使用 `find . -name "*.tmp" -print0 | xargs -0 rm` 进行安全删除。
```

---

## 21. Mini Eval Query 集（Gemini 对话中已生成）

建议保存为：`rag-eval-data/queries/mini_eval_queries.csv`

```csv
query_id,query_text,query_type,target_doc,target_theme,difficulty
CPU_001,HighCPUUsage 告警怎么排查,keyword,cpu_high_usage.md,cpu,easy
CPU_002,线上 CPU 跑满了，怎么快速定位是哪段代码的问题,paraphrase,cpu_high_usage.md,cpu,medium
CPU_003,单机 CPU 飙升到 90% 以上，第一步的止血操作是什么,step,cpu_high_usage.md,cpu,medium
CPU_004,Java 进程把 CPU 打满了，怎么把 jstack 和 top 的线程映射起来,detail,cpu_high_usage.md,cpu,hard
CPU_005,Go 服务由于死循环导致 CPU 占满，怎么抓取 pprof 火焰图,detail,cpu_high_usage.md,cpu,hard
CPU_006,频繁 GC 会导致 CPU 飙高吗，怎么看是不是序列化大对象导致的,paraphrase,cpu_high_usage.md,cpu,hard
MEM_001,MemoryHighUsage 告警排查思路,keyword,memory_high_usage.md,memory,easy
MEM_002,Pod 的容器内存快满了，但是进程一直没发生 OOM 是为什么,paraphrase,memory_high_usage.md,memory,medium
MEM_003,Java 频繁触发 OOM 被杀，怎么配置参数让它死前自动保留现场,step,memory_high_usage.md,memory,medium
MEM_004,Go 程序的堆内存一直在缓慢上涨，怎么排查是不是发生了内存泄漏,detail,memory_high_usage.md,memory,hard
MEM_005,发生 OOM 之后，怎么查是不是加载了超大的战报数据导致的,detail,memory_high_usage.md,memory,medium
MEM_006,内存使用率到 95% 且马上要触发限流了，为了防止雪崩应该做啥,step,memory_high_usage.md,memory,hard
SLW_001,接口慢响应 SlowResponse 怎么查,keyword,slow_response.md,slow_response,easy
SLW_002,监控看板上 P99 飙高但 P50 正常，这一般说明什么问题,paraphrase,slow_response.md,slow_response,medium
SLW_003,排查响应慢的接口时，应该怎么看 SkyWalking 的 Trace 链路,step,slow_response.md,slow_response,medium
SLW_004,MySQL 没走索引退化成全表扫描，导致接口大量超时怎么紧急处理,detail,slow_response.md,slow_response,hard
SLW_005,HikariCP 连接池耗尽会导致接口响应变慢吗，怎么看是不是有慢 SQL 占着不放,detail,slow_response.md,slow_response,hard
SLW_006,城战发兵接口特别慢，怎么定位是不是 Redis 的 BigKey 访问超时引起的,detail,slow_response.md,slow_response,hard
ERR_001,服务不可用 5xx 报错怎么应急处理,keyword,service_unavailable.md,service_unavailable,easy
ERR_002,API 网关大量报 502 Bad Gateway 是什么原因，下游进程挂了吗,paraphrase,service_unavailable.md,service_unavailable,medium
ERR_003,大地图突发大流量导致服务报 503 拒绝服务，怎么快速止血恢复,step,service_unavailable.md,service_unavailable,medium
ERR_004,刚上完新版本就大面积报 504 Gateway Timeout，第一步应该怎么办,step,service_unavailable.md,service_unavailable,easy
ERR_005,怎么看服务器进程是不是因为内存太大被 Linux 的 OOM Killer 强杀了,detail,service_unavailable.md,service_unavailable,hard
ERR_006,大面积报 500 错误时，怎么去应用日志里排查没捕获的全局空指针异常,detail,service_unavailable.md,service_unavailable,medium
DSK_001,DiskHighUsage 磁盘使用率告警怎么清理,keyword,disk_high_usage.md,disk,easy
DSK_002,磁盘空间提示 No space left on device，但 df -h 看还有剩余是怎么回事,paraphrase,disk_high_usage.md,disk,hard
DSK_003,怎么查 Linux 系统里到底是哪个目录占用的磁盘空间最大,step,disk_high_usage.md,disk,medium
DSK_004,磁盘 io 利用率百分百（util 很高），怎么看是哪个进程在疯狂读写,detail,disk_high_usage.md,disk,hard
DSK_005,我用 rm 删除了好几个 GB 的大日志文件，但磁盘空间还是没释放怎么解决,detail,disk_high_usage.md,disk,hard
DSK_006,因为产生了几百万个临时小文件导致 Inode 耗尽，怎么安全删除它们,detail,disk_high_usage.md,disk,hard
```

---

## 22. 对这份 Query 集的说明

这套 Query 设计里有几个很好的实验亮点：

### 22.1 混淆型 Hard Query

例如：

- `DSK_002`
- `DSK_006`

这些题都和“磁盘满”高度相关，但真实答案更偏向 `disk_inode_full.md` 这类干扰文档。它们非常适合拿来验证：

- 仅 Milvus 粗排是否会误命中核心文档
- Rerank 是否能把更精确的干扰文档提到前面

### 22.2 跨语言栈支持

题集中同时包含：

- Java：`jstack`、OOM Dump
- Go：`pprof`

这可以检验分片策略是否合理，例如是否把不同语言栈的解决方案分散到不同 chunk，从而提升检索粒度。

### 22.3 步骤型问题的可操作性

例如：

- `ERR_004`：刚发版后出现大量 504，第一步是否应该先回滚

这种问题不是测纯知识点，而是在测检索结果是否具有真正的运维指导意义。

---

## 23. 后续建议

当前已经有：

- 一套清晰的数据扩充方法
- 一批可直接落地的变体文档与干扰文档
- 一份可直接运行的 Mini Eval Query 集

下一步可以继续做：

1. 整理 `labels/mini_eval_labels.csv`
2. 编写评测脚本，批量调用检索接口
3. 输出 Hit@1、Hit@3、MRR、重复率、延迟等指标
4. 对比：
   - `Milvus top3`
   - `Milvus top12 -> top3`
   - `Milvus top12 -> rerank -> per-doc-cap -> top3`
5. 再决定后续是否调：
   - chunk size / overlap
   - recall top-k
   - per-doc-cap
   - nprobe
   - rerank 模型与策略

---

## 24. 当前结论

对这个项目来说，最合理的路径不是先硬讲一个“85% 命中率”，而是先把下面这件事做扎实：

> 用一套可复现的小规模离线评测，把文档数据扩充、Query 设计、指标体系和实验分组全部定清楚。

只要这套方法站得住，后面的数字无论是 80%、85% 还是 88%，都能讲得稳。
