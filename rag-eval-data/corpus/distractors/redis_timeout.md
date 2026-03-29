# 干扰分析：Redis 访问超时与慢查询排查

在分布式系统中，服务整体的 Slow Response 往往不是计算层的问题，而是存储层阻塞导致的。Redis 访问超时是最常见的导火索之一。

## 现象特征
业务网关报出大量的 HTTP 500 或 504 错误，应用日志中出现大量类似 `Redis command timed out` 或 `lettuce/redigo read timeout` 的异常堆栈。此时应用服务器本身的 CPU 和内存可能都处于极低的空闲状态。

## 排查步骤
1. **查网络**：排查应用服务器到 Redis 集群之间的网络延迟是否有尖刺（Network Latency Spike）。
2. **查慢日志**：在 Redis 执行 `SLOWLOG GET`，检查是否有 `KEYS *`、`HGETALL` 超大 Hash 结构等阻塞性命令。
3. **查 BigKey**：使用 `redis-cli --bigkeys` 扫描集群。如果某个玩家的数据或战报被塞在了一个巨型的 List 或 String 中，单线程的 Redis 处理该 Key 时会阻塞所有其他操作。
