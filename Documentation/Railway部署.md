# LinBlog Railway 部署

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

文件模块和删除文件备份会写入该目录。若使用 S3 兼容对象存储，也可以按 `serve/.env.example` 配置 `LINBLOG_S3_*`。

## 4. 生成公开域名

在应用服务的 Networking 中生成公开域名，然后把完整 HTTPS 来源写到：

```text
LINBLOG_ALLOWED_ORIGINS=https://<生成域名>
LINBLOG_PUBLIC_URL=https://<生成域名>
```

不要添加路径或尾部斜杠。修改环境变量后重新部署。

## 5. 数据库初始化

容器启动时会自动创建数据库、表并执行 `schema_migrations` 中尚未应用的迁移。默认不会写入演示数据。

如需演示数据，在 Railway Shell 或本地连接 Railway MySQL 后执行：

```sh
npm --prefix serve run db:seed
```

只会向空数据库插入演示数据；已有用户时会跳过。

## 6. 验证

部署完成后检查：

```text
https://<域名>/healthz
https://<域名>/portal
https://<域名>/loginRegister
https://<域名>/sitemap.xml
```

`/healthz` 返回 `{"status":"ok"}` 表示容器和数据库均已正常启动。

## 常见问题

- 启动提示 `LINBLOG_ALLOWED_ORIGINS` 无效：必须填写完整来源，例如 `https://xxx.up.railway.app`，不能带路径或尾部斜杠。
- 登录后刷新 404：确认使用的是本仓库根目录 `Dockerfile`，Express 会在找不到静态资源时回退到 `index.html`。
- 文件重启后丢失：没有挂载 `/data`，或没有配置 `LINBLOG_FILE_STORAGE_DIR`、`LINBLOG_FILE_BACKUP_DIR`。
- 数据库连接失败：确认应用服务与 MySQL 在同一 Railway Project，并检查 `LINBLOG_DB_*` 引用变量。
