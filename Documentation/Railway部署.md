# LinBlog Railway 部署

> 最后核对：2026-11-12

本项目使用一个 Railway 服务同时托管 Vue 前端、Express API 和静态上传文件；MySQL 使用 Railway 独立数据库服务。部署完成后 Railway 会提供 HTTPS 二级域名，不需要先购买服务器或域名。

## 1. 创建项目

1. 在 Railway 新建 Project。
2. 添加 `MySQL` 服务。
3. 添加 `Empty Service`，连接本项目 GitHub 仓库，或在本地使用 `railway up`。
4. Railway 会自动识别根目录 `Dockerfile`，构建前端和后端。

## 2. 配置环境变量

在应用服务的 Variables 中配置：

```text
LINBLOG_JWT_SECRET=<至少 32 字符的随机值>
LINBLOG_ALLOWED_ORIGINS=https://<Railway 生成的公开域名>
LINBLOG_PUBLIC_URL=https://<Railway 生成的公开域名>
LINBLOG_TRUST_PROXY=1

LINBLOG_DB_HOST=${{MySQL.MYSQLHOST}}
LINBLOG_DB_PORT=${{MySQL.MYSQLPORT}}
LINBLOG_DB_USER=${{MySQL.MYSQLUSER}}
LINBLOG_DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
LINBLOG_DB_NAME=${{MySQL.MYSQLDATABASE}}

LINBLOG_FILE_STORAGE_DIR=/data/files
LINBLOG_FILE_BACKUP_DIR=/data/file-backups
LINBLOG_DB_BACKUP_DIR=/data/db-backups

# 可选：系统日志与访问记录保留期
LINBLOG_RECORD_RETENTION_DAYS=90
LINBLOG_SYSTEM_LOG_RETENTION_DAYS=365

# 可选：连接池调优（默认 20 连接，获取超时 10 秒）
# LINBLOG_DB_CONNECTION_LIMIT=20
# LINBLOG_DB_ACQUIRE_TIMEOUT_MS=10000

# 可选：密码重置邮件
# LINBLOG_SMTP_HOST=smtp.example.com
# LINBLOG_SMTP_PORT=587
# LINBLOG_SMTP_SECURE=false
# LINBLOG_SMTP_USER=no-reply@example.com
# LINBLOG_SMTP_PASSWORD=
# LINBLOG_SMTP_FROM=LinBlog <no-reply@example.com>

# 可选：AI 服务商（OpenAI 兼容接口，智谱 / 魔搭等）
# LINBLOG_AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
# LINBLOG_AI_API_KEY=
# LINBLOG_AI_MODEL=glm-4-flash
# LINBLOG_AI_IMAGE_MODEL=cogview-3-flash
# LINBLOG_AI_IMAGE_SIZE=1344x768
```

如果应用服务能够读取到 Railway 自动注入的 `MYSQLHOST`、`MYSQLPORT`、`MYSQLUSER`、`MYSQLPASSWORD`、`MYSQLDATABASE`，也可以省略对应的 `LINBLOG_DB_*` 配置。`RAILWAY_PUBLIC_DOMAIN` 存在时，`LINBLOG_ALLOWED_ORIGINS` 也可省略。

生成 JWT 密钥：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## 3. 挂载持久化磁盘

在应用服务中添加 Volume，并挂载到：

```text
/data
```

文件模块、删除文件备份与数据库逻辑备份都会写入该目录。若使用 S3 兼容对象存储，也可以按 `serve/.env.example` 配置 `LINBLOG_S3_*`。

Railway 的容器文件系统是临时的，至少应挂载：

```text
/data/files
/data/file-backups
/data/db-backups
```

## 4. 生成公开域名

在应用服务的 Networking 中生成公开域名，然后把完整 HTTPS 来源写到：

```text
LINBLOG_ALLOWED_ORIGINS=https://<生成域名>
LINBLOG_PUBLIC_URL=https://<生成域名>
```

不要添加路径或尾部斜杠。修改环境变量后重新部署。

## 5. 数据库初始化

容器启动时会自动创建数据库、表并执行 `schema_migrations` 中尚未应用的迁移。默认不会写入演示数据。

环境变量中的 `LINBLOG_AI_*` 会在迁移时幂等导入为默认 AI 模型；之后可以在
后台「AI 管理」中继续添加模型、设置文本/配图分工、次数限制与健康巡检。
API Key 在数据库中使用加密存储，后台只显示掩码。

如需演示数据，在 Railway Shell 或本地连接 Railway MySQL 后执行：

```sh
npm --prefix serve run db:seed
```

只会向空数据库插入演示数据；已有用户时会跳过。

## 6. 验证

部署完成后检查：

```text
https://<域名>/healthz（存活：进程正常即 200）
https://<域名>/readyz（就绪：数据库连通才 200，未就绪 503）
https://<域名>/portal
https://<域名>/loginRegister
https://<域名>/sitemap.xml
```

`/healthz` 返回 `{"status":"ok"}` 表示容器进程正常；`/readyz` 返回 `{"status":"ready"}` 表示数据库连通、可以接流量。 Railway 等平台的存活探针应指向 `/healthz`（DB 抖动不会触发容器重启），就绪探针指向 `/readyz`。登录管理员可访问 `/api/health/runtime` 查看内存、运行时间与连接池占用。

建议再检查：

- `/portal` 与 `/portal/gallery` 的门户图片是否正常加载
- 后台「AI 管理」是否能完成一次连通性测试
- 系统设置中的数据库备份容量是否指向 `/data/db-backups`
- 系统日志能否按模块筛选并导出 CSV

## 常见问题

- 启动提示 `LINBLOG_ALLOWED_ORIGINS` 无效：必须填写完整来源，例如 `https://xxx.up.railway.app`，不能带路径或尾部斜杠。
- 登录后刷新 404：确认使用的是本仓库根目录 `Dockerfile`，Express 会在找不到静态资源时回退到 `index.html`。
- 文件重启后丢失：没有挂载 `/data`，或没有配置 `LINBLOG_FILE_STORAGE_DIR`、`LINBLOG_FILE_BACKUP_DIR`。
- 数据库连接失败：确认应用服务与 MySQL 在同一 Railway Project，并检查 `LINBLOG_DB_*` 引用变量。
- AI 入口不显示或接口 503：确认 `LINBLOG_AI_*` 已配置，或在后台「AI 管理」中接入并启用模型。
- 数据库备份不可用：没有挂载 `/data`，或没有配置 `LINBLOG_DB_BACKUP_DIR`。
