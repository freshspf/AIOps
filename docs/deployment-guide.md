# SuperBizAgent 部署指南

> 更新时间：2026-04-07  
> 状态：已提供容器化部署骨架（含宝塔轻量部署版本）

## 1. 目标

这份文档对应当前项目的第一版上线方案，目标是：

- 后端、前端、Redis、Milvus 可以一套容器编排启动
- 不依赖本地未提交的 `application.yml`
- 前端通过 Nginx 提供静态页面，并反向代理 `/api` 和 `/milvus`
- 上线步骤尽量简单，适合个人项目演示或面试项目部署
- 对 `2C4G + 宝塔` 这类轻量服务器，优先支持“前后端先上、Redis 复用现有实例、Milvus 外部化”的部署方式

## 2. 当前部署拓扑

### 2.1 完整容器版

```text
浏览器
  -> Nginx (web, 80)
     -> /            -> 前端静态资源
     -> /api         -> Spring Boot backend
     -> /milvus      -> Spring Boot backend

Spring Boot backend
  -> Redis
  -> Milvus (standalone + etcd + minio)
  -> DashScope API
```

说明：

- Prometheus / CLS 当前仍可走 mock 模式，因此生产骨架里不强制部署 Prometheus
- 如果后续要接真实监控或日志平台，再单独扩容依赖即可

### 2.2 宝塔轻量版（推荐给 2C4G）

```text
浏览器
  -> 宝塔 Nginx / 反向代理
  -> 127.0.0.1:8080 (web 容器)
     -> /            -> 前端静态资源
     -> /api         -> app 容器
     -> /milvus      -> app 容器

Spring Boot backend
  -> 现有 Redis
  -> 外部 Milvus
  -> DashScope API
```

这套更适合你的当前环境：

- 服务器只承载 `web + app`
- Redis 直接复用宝塔上现成实例
- Milvus 不放在 `2C4G` 机器上

## 3. 新增部署文件

- `Dockerfile`：后端镜像，多阶段 Maven 构建
- `web-ui/Dockerfile`：前端镜像，构建 Vite 并交给 Nginx 提供
- `deploy/nginx.conf`：前端 SPA 路由和后端反代配置
- `deploy/application-docker.yml`：容器内后端默认配置
- `docker-compose.prod.yml`：生产部署编排
- `docker-compose.bt.yml`：宝塔轻量部署编排（仅 web + app）
- `.env.production.example`：部署时需要复制并填写的环境变量模板
- `.env.bt.example`：宝塔轻量部署环境变量模板
- `.dockerignore`
- `web-ui/.dockerignore`

## 4. 环境变量

至少需要配置：

- `DASHSCOPE_API_KEY`

可选覆盖：

- `SPRING_SERVER_PORT`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `MILVUS_HOST`
- `MILVUS_PORT`
- `PROMETHEUS_URL`
- `PROMETHEUS_MOCK_ENABLED`
- `CLS_MOCK_ENABLED`

在默认容器编排下：

- `REDIS_HOST=redis`
- `MILVUS_HOST=standalone`
- `REDIS_PORT=6379`
- `MILVUS_PORT=19530`

在宝塔轻量版下：

- `REDIS_HOST`：填写宝塔 Redis 的可达地址
- `MILVUS_HOST`：填写外部 Milvus 地址
- `web` 容器默认暴露在 `8080`，交给宝塔 Nginx 反向代理

## 5. 上线步骤

### 5.1 宝塔轻量版（推荐）

#### 准备环境变量

```bash
cp .env.bt.example .env.bt
```

至少填入：

```bash
DASHSCOPE_API_KEY=your-real-key
REDIS_HOST=你的Redis地址
MILVUS_HOST=你的外部Milvus地址
```

说明：

- 如果 Redis 就在这台服务器上，不要默认写 `localhost`，优先写服务器实际可达的内网 IP
- 后端当前启动时仍依赖可访问的 Milvus，因此 `MILVUS_HOST` 不能留空

#### 启动

```bash
docker compose --env-file .env.bt -f docker-compose.bt.yml up -d --build
```

#### 宝塔反向代理

在宝塔里把域名反代到：

- `http://127.0.0.1:8080`

这样：

- `/` 走前端
- `/api`、`/milvus` 会继续由容器内 Nginx 转发给后端

#### 验证

```bash
curl http://127.0.0.1:8080/
curl http://127.0.0.1:8080/milvus/health
```

### 5.2 完整容器版

#### 准备环境变量

```bash
cp .env.production.example .env.production
```

至少填入：

```bash
DASHSCOPE_API_KEY=your-real-key
```

#### 构建并启动

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

#### 验证

```bash
curl http://localhost/            # 前端首页
curl http://localhost/milvus/health
curl http://localhost/api/chat/sessions
```

## 6. 设计取舍

### 为什么前端用 Nginx 单独部署

因为当前前端是独立的 Vite 项目，单独构建后交给 Nginx：

- 部署边界更清晰
- `/api` 和 `/milvus` 可以统一走反代
- 不需要继续依赖 `src/main/resources/static/` 下那套旧静态页面

### 为什么后端单独带一份容器配置

因为仓库里真正提交的是 `application.yml.template`，不能直接拿你本地忽略掉的 `application.yml` 进容器。  
所以当前方案把容器运行配置放在 `deploy/application-docker.yml`，通过环境变量覆盖关键项。

### 为什么生产编排先保留 mock 监控配置

因为这个项目的核心演示价值在：

- RAG
- 会话管理
- 多 Agent 分析流程

Prometheus / CLS 当前可以继续走 mock 模式，不阻塞第一版上线。后面如果要接真实监控，再扩容。

### 为什么宝塔轻量版不内置 Redis / Milvus

因为你的目标是先把应用层上线，而且服务器资源只有 `2C4G`：

- Redis 你已经有现成实例，没必要再重复起一个
- Milvus 资源开销明显更高，不适合和 Java 后端同机塞在 `2C4G` 上

所以宝塔轻量版的重点是：

- 先把前端和后端稳定跑起来
- 后端连外部依赖

## 7. 当前限制

- 还没有 HTTPS、域名、证书自动化配置
- 还没有 CI/CD 自动发布流程
- 前端构建产物体积偏大，Vite 仍有 chunk size 警告
- Milvus 当前采用 standalone，适合个人项目和演示，不是高可用生产方案
- 宝塔轻量版仍然要求后端能访问一个外部 Milvus，否则应用无法完整启动

## 8. 后续建议

- 接入域名和 HTTPS
- 给 `docker-compose.prod.yml` 增加资源限制与健康检查细化
- 把发布流程接到 GitHub Actions 或你自己的脚本里
- 根据线上访问量考虑是否拆出对象存储、外部 Redis 或托管向量库
