# FAQ: 内存使用率告警与 OOM 问答

**Q1: 为什么容器监控显示内存使用率已经 95% 了，但进程还没 OOM？**
A: 容器（Pod）的内存监控通常包含 `Working Set` 内存和 `Cache`（如 Linux Page Cache）。系统会在真正需要时回收 Cache 内存，所以只要业务进程的 RSS（常驻内存集）没超 limit，就不会触发 OOM Killer。重点关注 `container_memory_working_set_bytes` 这个指标。

**Q2: Java 服务发生 OOM (OutOfMemoryError) 后怎么查？**
A: 确保 JVM 启动参数配置了 `-XX:+HeapDumpOnOutOfMemoryError`。OOM 发生时会自动生成 `.hprof` 文件。把 dump 文件拉到本地，用 MAT (Memory Analyzer Tool) 或 JProfiler 打开，查看 Dominator Tree，通常一眼就能看出是哪个大对象或集合（如长生命周期的 Map）泄漏了。

**Q3: Go 服务内存一直在涨，怎么区分是内存泄漏还是正常的缓存堆积？**
A: 使用 pprof 查看堆内存：`go tool pprof -inuse_space http://.../debug/pprof/heap`。
1. 如果是全局变量、缓存大对象（如存了大量玩家战报数据且没设置 TTL），说明是业务层"伪泄漏"。
2. 如果是某个特定 goroutine 处理完逻辑后，关联的对象被强引用无法被 GC，或者是底层 CGO 调用的非托管内存没释放，那就是真泄漏。
