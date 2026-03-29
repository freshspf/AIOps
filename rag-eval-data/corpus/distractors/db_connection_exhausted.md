# 干扰分析：数据库连接池耗尽 (Connection Pool Exhausted)

数据库连接池耗尽是导致应用层抛出大量 500 错误和请求超时的主要原因之一。它在监控上的表现经常与 CPU 飙高或慢响应混淆。

## 核心现象
应用日志中出现大量 `Timeout waiting for connection from pool` 或 `CannotGetJdbcConnectionException`。与此同时，系统的 CPU 并不高，内存也正常，但所有需要访问数据库的接口全部卡死。

## 常见原因与排查
1. **慢 SQL 拖垮**：数据库执行极其缓慢，导致借出的连接迟迟不归还，最终耗尽连接池。
2. **事务未提交**：代码逻辑存在缺陷，开启了事务 (`@Transactional`)，但在某个分支提前 return，或者发生了未捕获的异常导致连接未正确 `close()` 或 `commit()`。
3. **并发超预期**：瞬间并发量远远大于连接池的最大容量（如 max-active=50，但瞬间涌入 500 个并发写请求）。应该在应用层使用削峰填谷（如引入消息队列 MQ）。
