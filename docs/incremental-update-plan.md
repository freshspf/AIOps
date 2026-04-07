# 知识库增量更新方案

## 1. 背景

### 现状

当前知识库更新机制仍是**文件级全量重建**：

```text
文件变化（上传 / 手动触发）
  → 按 _source 删除该文件所有旧 chunk
  → 重新读取文件
  → 重新切分
  → 对全部 chunk 重新 embedding
  → 全量写回 Milvus
```

当前实现位于 `VectorIndexService.indexSingleFile()`，整体流程与下面逻辑一致：

```java
String content = Files.readString(path);
deleteExistingData(path.toString());
List<DocumentChunk> chunks = chunkService.chunkDocument(content, path.toString());

for (DocumentChunk chunk : chunks) {
    String retrievalText = chunkService.buildEmbeddingText(chunk);
    List<Float> vector = embeddingService.generateEmbedding(retrievalText);
    Map<String, Object> metadata = buildMetadata(path.toString(), chunk, chunks.size());
    insertToMilvus(chunk.getContent(), vector, metadata, chunk.getChunkIndex());
}
```

### 当前问题

| 问题 | 影响 |
|------|------|
| 未变化 chunk 仍重复 embedding | 浪费 DashScope 调用与更新时间 |
| 全量删除后全量写回 | 中间存在该文件不可检索的空窗期 |
| 以 `source + chunkIndex` 生成 ID | 文件中部插入内容时，大量 chunk 会被误判为“全变” |
| 文档内部重复 chunk 无法稳定建模 | 如果直接改成 `source + hash`，会把同文件重复 chunk 合并掉 |

### 目标

实现**chunk 级别增量更新**，并保持当前检索语义不变：

- 继续使用 `breadcrumb + 正文` 作为 embedding 输入
- 未变化 chunk 不重复 embedding
- 同文件内重复 chunk 全部保留
- `title / breadcrumb` 变化会通过 `retrievalHash` 触发重建
- `chunkIndex / totalChunks` 仅保留为展示型 metadata，不参与重建判断
- 旧格式数据按“该文件首次增量时全量重建”迁移

---

## 2. 统一术语

后续增量更新围绕 4 个概念展开：

### 2.1 raw content

chunk 的原始正文内容，对应 Milvus 中的 `content` 字段。

用途：

- 保留原文
- 作为最终给大模型的正文内容
- 作为展示和引用来源

### 2.2 retrieval text

真正送入 embedding 模型、用于检索的文本。

当前实现不是“只对正文做 embedding”，而是：

```java
retrievalText = breadcrumb + "\n" + rawContent
```

也就是说，**当前项目的增量判断必须围绕 retrieval text，而不是只围绕 raw content**。

### 2.3 metadata

存进 Milvus JSON 字段的结构信息，当前至少包括：

- `_source`
- `_file_name`
- `_extension`
- `title`
- `breadcrumb`
- `chunkIndex`
- `totalChunks`

增量方案中还会新增：

- `retrievalHash`
- `occurrence`

### 2.4 LLM context

检索命中后，组装给大模型的上下文。它通常由：

- 标题 / breadcrumb
- 来源文件名
- 正文内容

共同组成。

这里和 retrieval text 不同：LLM context 服务的是生成阶段，不是召回阶段。

---

## 3. 核心设计

### 3.1 chunk 稳定标识：`retrievalHash + occurrence`

当前 ID 生成方式是：

```java
UUID.nameUUIDFromBytes((source + "_" + chunkIndex).getBytes())
```

这个方式的问题是：

- `chunkIndex` 不稳定
- 文件中间插入内容后，后续大量 chunk 都会被误判为“新 chunk”

本方案改为两层标识：

1. `retrievalHash`

```java
retrievalHash = md5(buildEmbeddingText(chunk))
```

含义：

- 只要 retrieval text 不变，hash 就不变
- 因为 retrieval text 包含 breadcrumb，所以标题层级变化会触发重建
- 这与当前检索语义保持一致

2. `occurrence`

同一文件内，相同 `retrievalHash` 的出现序号，从 `0` 开始递增。

示例：

```text
chunkA retrievalHash = h1, 第一次出现 → occurrence = 0
chunkB retrievalHash = h1, 第二次出现 → occurrence = 1
```

3. `chunkKey`

```java
chunkKey = source + ":" + retrievalHash + ":" + occurrence
```

这样可以保证：

- 当前 retrieval text 不变时，chunk 能稳定识别
- 同文件内重复 chunk 不会互相覆盖
- breadcrumb / title 变化会触发重建，符合当前 embedding 逻辑

### 3.2 零操作条件

当前方案下，一个 chunk 只有同时满足以下条件，才算 `unchanged`：

- `retrievalHash` 一致
- `occurrence` 一致

否则都进入重建路径。

这意味着：

- 文件尾部追加内容时，前面未受影响 chunk 可以保持 `unchanged`
- `chunkIndex / totalChunks` 变化不会单独触发重建
- 当前版本只围绕检索语义做增量判断，不做 metadata-only update

---

## 4. 增量更新流程

### 4.1 整体流程

```text
文件变化触发
    ↓
① 读取文件，重新切分
    ↓
② 为每个新 chunk 计算 retrievalHash、occurrence
    ↓
③ 查询 Milvus 中该 _source 下的已有 chunk：id + metadata
    ↓
④ 如果旧 chunk 缺少 retrievalHash / occurrence
   → 判定为旧格式数据
   → 对该文件执行一次全量重建
    ↓
⑤ 否则计算差异：
   unchanged = retrievalHash + occurrence 全一致
   toDelete = 旧有新无
   toInsert = 新有旧无
    ↓
⑥ 先按主键删除 toDelete
    ↓
⑦ 仅对 toInsert 做 embedding 并写入 Milvus
    ↓
⑧ 记录统计日志
```

### 4.2 差异判断示例

```text
旧文件:
  cpu > 常见原因 > “慢 SQL 可能导致 CPU 升高”   hash=h1 occ=0
  cpu > 常见原因 > “线程池打满也可能导致 CPU 升高” hash=h2 occ=0

新文件:
  cpu > 常见原因 > “慢 SQL 可能导致 CPU 升高”   hash=h1 occ=0
  cpu > 紧急处理 > “线程池打满也可能导致 CPU 升高” hash=h3 occ=0

结果:
  第一块 unchanged
  第二块 breadcrumb 变化 → retrievalHash 变化 → delete + insert
```

### 4.3 重复 chunk 示例

同一文件中有两个完全相同的 chunk：

```text
chunk1 retrievalHash = h1, occurrence = 0
chunk2 retrievalHash = h1, occurrence = 1
```

二者都会保留，不会因为 `source + hash` 相同而互相覆盖。

---

## 5. 实现改动

### 5.1 服务接口设计

文档里的接口统一收敛为以下形式：

- `indexSingleFile(filePath)`
  - 保留为全量重建入口
- `incrementalIndex(filePath)`
  - 新增增量更新入口
- `queryExistingChunks(filePath)`
  - 查询该文件已有 chunk，返回 `id + metadata`
- `buildChunkDescriptor(chunk, normalizedPath, occurrence, totalChunks)`
  - 统一生成 `retrievalHash / chunkKey`
- `insertToMilvus(id, content, vector, metadata)`
  - 由调用方显式传入最终主键
- `batchDeleteByIds(ids)`
  - 按主键批量删除

### 5.2 关键实现要点

1. `indexSingleFile(filePath)` 保持现有语义不变

- 仍是兜底全量重建
- 用于首次导入和旧格式迁移

2. `incrementalIndex(filePath)` 负责增量逻辑

- 重新切分文件
- 生成新 chunk 描述集合
- 查询旧 chunk 描述集合
- 判断是否是旧格式数据
- 计算 `unchanged / toDelete / toInsert`
- 只对 `toInsert` 做 embedding

3. `insertToMilvus(...)` 不再内部生成 ID

旧逻辑：

```java
id = UUID(source + "_" + chunkIndex)
```

新逻辑：

- ID 在增量流程中由 `chunkKey` 明确生成
- `insertToMilvus` 只负责执行插入

4. 新增 metadata 字段

所有新写入 chunk 都要带上：

- `retrievalHash`
- `occurrence`

当前不新增 schema 字段，这些值都放进 `metadata` JSON。  
`chunkIndex / totalChunks` 仍然会继续写入 metadata，但只用于展示、调试和排序。

### 5.3 旧数据迁移

旧格式数据没有：

- `retrievalHash`
- `occurrence`

因此迁移策略不是“全库统一重建”，而是：

1. 某文件第一次走 `incrementalIndex(filePath)` 时
2. 如果查询到该文件已有 chunk，但 metadata 中缺少上述字段
3. 就判定该文件仍是旧格式
4. 对该文件执行一次：
   - `deleteExistingData(filePath)`
   - 全量重新切分
   - 全量写入新格式 chunk
5. 之后该文件才进入真正的增量更新路径

这个策略的好处是：

- 不依赖新增 collection
- 不要求一次性全库迁移
- 可以随文件更新逐步完成迁移

### 5.4 不再假设存在公共重建 API

当前文档不再引用 `/api/rebuild-index` 这类不存在的接口。

迁移阶段默认通过现有文件上传流程或后续 service 调用触发单文件重建。  
如果未来需要手动重建入口，再单独设计 controller 或命令行入口。

---

## 6. 验收标准

实现完成后，至少验证以下场景：

| 场景 | 预期结果 |
|------|---------|
| 文件完全不变 | `delete=0, insert=0, rebuild=0` |
| 文末追加新段落 | 仅新增尾部 chunk，不删除未受影响 chunk |
| 修改某个 chunk 正文 | 只重建该 chunk 及受切分连带影响的 chunk |
| 只改标题 / breadcrumb | 在当前策略下，相关 chunk 会重建 |
| 同文件出现两个相同正文 chunk | 两者都被保留，并可被检索 |
| 旧格式数据首次增量 | 自动降级为该文件全量重建，之后再走增量 |

---

## 7. 边界与限制

### 7.1 切分策略变化

如果 `maxSize`、`overlap` 或分片策略变化：

- chunk 边界会整体漂移
- `retrievalHash` 可能大面积变化
- 实际效果会退化为接近全量重建

这是当前设计下的预期行为。

### 7.2 embedding 模型变化

如果 embedding 模型本身更换，但 retrieval text 没变：

- 逻辑上 chunk 没变
- 但向量语义已经失效

因此后续如支持模型切换，应额外记录模型版本，并将“模型版本变化”也视为重建条件。  
这不是本次增量更新首版范围。

### 7.3 当前不做 metadata-only update

本方案首版不做“只更新 metadata、不重 embedding”的路径。

原因是：

- 当前 retrieval text 本身依赖 breadcrumb
- 先保证检索语义层面的增量正确，比先追求 metadata 强一致更重要
- `chunkIndex / totalChunks` 这类字段更适合作为展示型 metadata，而不是强重建条件

---

## 8. 预期收益

| 指标 | 当前全量重建 | 增量更新首版 |
|------|-------------|-------------|
| 小幅修改的 embedding 调用量 | 全部 chunk | 仅新增 / 重建 chunk |
| 文件不可检索空窗期 | 整文件全量删后重建 | 限制在受影响 chunk 范围 |
| 文中插入新段后重建范围 | 往往整文件 | 受影响 chunk 为主 |
| 同文件重复 chunk | 现有 ID 不稳定 | 可稳定保留 |
| 迁移复杂度 | 无迁移概念 | 按文件首更迁移 |

首版目标不是做到“最少字节级更新”，而是做到：

- 与当前检索逻辑一致
- 规则清晰
- 可逐步迁移
- 后续还能继续演进为更细粒度的 metadata-only update
