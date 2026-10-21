# LinBlog
LinBlog 是一个尚在开发中的个人博客管理项目，采用 Vue 3 + TypeScript 前端和 Express + MySQL 后端。当前已有用户管理及若干内容 API，但文章、评论等多个前端页面仍使用 Mock 数据，不能视为完整可用的博客系统。

## 项目结构与当前状态

| 目录/模块 | 当前实现 |
| --- | --- |
| `lin_blog/` | Vue 3、TypeScript、Vite、Pinia、Vue Router；包含总览、用户管理、文章、图库、文件、日记及编辑页面。 |
| `serve/` | Express 5 API、JWT 认证、MySQL 数据模型；当前有用户、文章、评论和消息路由。 |
| `Documentation/` | 开发进度及数据库设计文档。 |
| 用户管理 | 管理员用户列表/搜索/分页、创建、编辑、删除和启用/禁用已有前后端实现；“编辑与普通用户”统计会把游客也计入。 |
| 文章、评论、消息 | 后端已有 API；文章列表、评论/消息展示仍使用 Mock，尚未完成端到端联调。文章 API 客户端封装存在，但页面尚未调用。 |
| 其他内容模块 | 分类、标签、文件、图库、日记、天气和访问统计等页面/组件仍使用 Mock，后端业务 API 尚未齐备。 |

### 本地开发命令

前端在 `lin_blog/` 目录安装项目依赖后，可使用：

```sh
npm run dev
npm run build
```

`build` 会先执行 `vue-tsc -b` 类型检查，再运行 Vite 构建。2026-10-21 本地验证构建通过；仍有 MockJS `eval` 警告和单个 500 KB 以上的打包 chunk 警告，详见 [Documentation/开发进度.md](Documentation/开发进度.md)。

后端依赖由 `serve/pnpm-lock.yaml` 管理。`serve/package.json` 暂无 `start`、`dev`、`test` 脚本；准备依赖并配置环境变量后，在 `serve/` 目录执行 `node linlog.js`。配置需要 `LINBLOG_JWT_SECRET`（至少 32 个字符的随机值）和 `LINBLOG_ALLOWED_ORIGINS`（逗号分隔的精确前端来源列表）；`LINBLOG_PORT`、`LINBLOG_DB_HOST`、`LINBLOG_DB_USER`、`LINBLOG_DB_NAME` 可选，数据库密码通过 `LINBLOG_DB_PASSWORD` 设置。模板见 `serve/.env.example`。当前项目没有 dotenv 加载器，单纯创建 `.env` 不会自动把变量载入进程。请在 `serve/` 目录启动时使用 Node.js 支持的环境文件方式，例如 `node --env-file=.env linlog.js`，或在进程管理器/部署平台中注入同名环境变量。缺少 JWT 密钥或允许来源配置、JWT 密钥过短、来源格式错误时，服务会在启动配置阶段给出明确错误并退出。

#### CORS 跨域配置

`LINBLOG_ALLOWED_ORIGINS` 必须列出实际访问前端的完整来源（协议、域名和可选端口），多个来源用英文逗号分隔，例如 `http://localhost:5173,https://blog.example.com`。不要配置路径、尾部斜杠或通配符。后端允许 `Authorization` 请求头以及 `GET`、`POST`、`PUT`、`PATCH`、`DELETE` 等实际使用的方法；浏览器的 `OPTIONS` 预检由 CORS 中间件在路由前处理。来源不在白名单时，响应不会包含允许该来源的 `Access-Control-Allow-Origin`，浏览器因此会阻止跨域读取。生产部署应只填写可信前端来源，并通过部署平台的环境变量管理密钥。

**数据库安全提示：** 后端启动会调用数据库初始化逻辑。首次初始化可创建数据库、表并插入演示数据；已有初始化标记时仍会检查 `article` 表，并可能执行作者列、索引或外键的增量 DDL。仅在确认的本地/隔离数据库上启动；对有价值的数据先审查迁移、备份并验证恢复流程。本文档更新期间未启动后端或执行数据库操作。

### 已注册的后端 API

| 模块 | 路由 | 认证/说明 |
| --- | --- | --- |
| 用户管理 | `PUT /api/user/updateUser/:id`、`DELETE /api/user/deleteUser/:id`、`PUT /api/user/updateUserStatus/:id` | 管理员操作，需要认证。 |
| 用户 | `GET /api/user/isRegistered`、`POST /api/user/register`、`POST /api/user/login` | 注册和登录公开。 |
| 用户 | `POST /api/user/userInfo`、`POST /api/user/allUser`、`POST /api/user/createUser` | 需要 Bearer Token；用户列表和管理员创建用户仅管理员可操作。 |
| 文章 | `POST/GET /api/article`、`GET/PUT/DELETE /api/article/:id`、`PATCH /api/article/:id/status` | 需要 Bearer Token；列表支持分页、状态、类型和分类筛选。 |
| 评论 | `GET/POST /api/comment`、`DELETE /api/comment/:id`、`GET /api/comment/my` | 需要 Bearer Token。 |
| 消息 | `POST /api/message`、`GET /api/message/inbox`、`GET /api/message/outbox`、`PATCH /api/message/read`、`DELETE /api/message/:id`、`GET /api/message/unread/count` | 需要 Bearer Token。 |

用户管理的前端请求封装位于 `lin_blog/src/api/user.ts`。登录、注册页面使用 `/api/user/login` 和 `/api/user/register`；认证请求从 `localStorage` 读取令牌并添加认证头。文章 API 封装在 `lin_blog/src/api/article.ts`，但目前没有页面调用它。

### 当前限制与待办

* 用户管理 CRUD 和账号启停用已有接口及页面处理；“编辑与普通用户”统计仍使用“总用户数减管理员数”，会将游客计入。公开注册只检查邮箱是否已注册，未显式检查用户名冲突；用户名唯一键冲突的错误处理需要补齐。
* 前端构建目前通过，但打包有 MockJS `eval` 警告和大 chunk 警告；需评估 MockJS 移除/隔离及按需拆包，不应只提高警告阈值。
* 用户登录/注册及用户管理已有前后端调用，但文章列表仍使用 Mock；评论、消息、分类/标签、文件、图库、日记、天气和统计页面也未全面接入真实 API。
* 文章模型依赖 `article.user_id` 保存作者及执行权限过滤；新表定义和启动时增量迁移代码已加入，但现有数据库迁移、历史数据兼容和实际 MySQL 行为尚未验证。历史文章作者列允许为 `NULL`。
* JWT 密钥改为环境变量 `LINBLOG_JWT_SECRET` 并要求至少 32 字符；`.env.example` 只是模板，当前项目没有自动加载 `.env` 的逻辑。登录和认证中间件都会拒绝禁用账号，但缺少这些行为的自动化接口测试。
* CORS 配置从必填环境变量 `LINBLOG_ALLOWED_ORIGINS` 读取精确来源白名单；`Authorization` 请求头、`PATCH` 方法和 `OPTIONS` 预检均已纳入配置。Vite 同源代理开发路径不代表跨域部署已验证。不要把前端路由守卫视为后端接口授权的替代。
* 后端当前没有统一的自动化测试脚本。`serve/test/articleModel.test.js` 是使用查询替身的模型隔离测试，不连接 MySQL，也不覆盖真实 HTTP 接口。

# LinBlog数据库

## 文档概述

### 文档目的

本文档用于详细说明 LinBlog 个人博客系统数据库的设计结构、初始化逻辑、使用方法及注意事项，为开发、测试及维护人员提供完整的数据库参考。

### 数据库基本信息

- 数据库名称：`linlog`
- 字符集：`utf8mb4`（支持 emoji 及特殊字符）
- 排序规则：`utf8mb4_unicode_ci`
- 连接方式：MySQL 连接池（默认最大连接数 20）
- 核心功能：支撑用户管理、文章 / 资源存储、互动（点赞 / 评论）、日记、消息通知等业务场景

## 数据库设计详情

### 表结构总览

系统共设计 11 张数据表，按业务模块分类如下：

- 用户模块：`users`（用户表）
- 资源分类模块：`subset`（资源分类表）
- 内容模块：`article`（文章 / 图片集表）、`file`（文件存储表）
- 互动模块：`praise`（点赞表）、`comment`（评论表）
- 字典模块：`label`（标签字典表）、`weather`（天气字典表）
- 个人模块：`diary`（个人日记表）
- 通知模块：`message`（消息表）
- 统计模块：`record`（访问记录表）

### 表结构详情

#### 用户表（users）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 用户ID（兼容雪花算法）                |
| username       | VARCHAR(50)                       | 非空、唯一索引（uk_username）                                               | 用户名（唯一）                        |
| mail           | VARCHAR(100)                      | 非空、唯一索引（uk_mail）                                                   | 邮箱（登录账号，唯一）                |
| password       | VARCHAR(255)                      | 非空                                                                       | 密码（bcrypt哈希存储，不可明文存储）  |
| user_type      | ENUM('admin', 'editor', 'normal', 'visitor') | 非空、默认值 `normal`                                               | 用户类型：管理员/编辑/普通用户/游客   |
| imgurl         | VARCHAR(255)                      | 可选（允许为NULL）                                                         | 头像图片URL地址                       |
| status         | TINYINT(1)                        | 非空、默认值 `1`、普通索引（idx_status）                                    | 账号状态：1-正常，0-禁用              |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 账号创建时间                          |
| updated_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`                 | 账号信息更新时间（自动触发）          |
| last_login_at  | DATETIME                          | 可选（允许为NULL）                                                         | 最后登录时间                          |

####  资源分类表（subset）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | INT UNSIGNED                      | 主键、自增                                                                 | 分类ID                                |
| subset_name    | VARCHAR(50)                       | 非空                                                                       | 分类名称                              |
| classify       | ENUM('article', 'image', 'resource') | 非空、普通索引（idx_classify）                                           | 分类类型：文章/图片/资源              |
| status         | TINYINT(1)                        | 非空、默认值 `1`、普通索引（idx_status）                                    | 状态：1-启用，0-禁用                  |
| sort           | INT UNSIGNED                      | 非空、默认值 `0`                                                           | 排序权重（数值越大，展示越靠前）      |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 创建时间                              |
| updated_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`                 | 更新时间（自动触发）                  |
| 联合约束       | ——                                | 唯一索引（uk_subset_classify：subset_name + classify）                       | 同一类型下分类名称不可重复            |

#### 文件存储表（file）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 文件ID                                |
| file_name      | VARCHAR(100)                      | 非空                                                                       | 文件原始名称（含后缀）                |
| format         | VARCHAR(32)                       | 非空、普通索引（idx_format）                                                | 文件格式（如jpg、pdf、zip）           |
| size           | INT UNSIGNED                      | 可选（允许为NULL）                                                         | 文件大小（单位：字节）                |
| url            | VARCHAR(255)                      | 非空                                                                       | 文件存储地址（本地路径或云存储URL）    |
| subset_id      | INT UNSIGNED                      | 可选（允许为NULL）、普通索引（idx_subset）、外键（关联 subset.id）           | 所属分类ID（分类删除时设为NULL）      |
| status         | TINYINT(1)                        | 非空、默认值 `1`、普通索引（idx_status）                                    | 状态：1-正常，0-已删除                |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 文件上传时间                          |
| 外键规则       | ——                                | FOREIGN KEY (subset_id) REFERENCES subset(id) ON DELETE SET NULL            | 分类删除时，关联文件的分类ID设为NULL  |

####  文章/图片集表（article）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 文章/图片集ID                         |
| user_id        | BIGINT UNSIGNED                   | 可选（允许为NULL）、普通索引（idx_article_user）、外键（关联 users.id）       | 作者ID（删除用户时设为NULL）          |
| title          | VARCHAR(150)                      | 非空                                                                       | 标题（文章/图片集名称）               |
| subset_id      | INT UNSIGNED                      | 可选（允许为NULL）、普通索引（idx_subset）、外键（关联 subset.id）           | 所属分类ID（分类删除时设为NULL）      |
| classify       | ENUM('article', 'image')          | 非空、普通索引（idx_classify）                                             | 内容类型：文章/图片集                 |
| label          | VARCHAR(100)                      | 可选（允许为NULL）                                                         | 标签（多个标签用逗号分隔，如“Vue,JavaScript”） |
| introduce      | VARCHAR(512)                      | 可选（允许为NULL）                                                         | 简介（不超过512个字符）               |
| content        | LONGTEXT                          | 非空                                                                       | 内容（文章为HTML文本，图片集为说明文本） |
| cover          | VARCHAR(255)                      | 可选（允许为NULL）                                                         | 封面图片URL地址                       |
| views          | INT UNSIGNED                      | 非空、默认值 `0`                                                           | 查看次数（冗余字段，提升查询效率）    |
| likes          | INT UNSIGNED                      | 非空、默认值 `0`                                                           | 点赞数（冗余字段）                    |
| comments       | INT UNSIGNED                      | 非空、默认值 `0`                                                           | 评论数（冗余字段）                    |
| state          | ENUM('draft', 'published', 'rejected', 'deleted') | 非空、默认值 `draft`、普通索引（idx_state）                           | 状态：草稿/已发布/已驳回/已删除       |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`、普通索引（idx_created_at）                 | 创建时间                              |
| updated_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`                 | 更新时间（自动触发）                  |
| published_at    | DATETIME                          | 可选（允许为NULL）                                                         | 发布时间（仅已发布状态有效）          |
| 索引补充       | ——                                | 全文索引（ft_title_intro：title + introduce）                               | 支持标题+简介的模糊搜索                |
| 外键规则       | ——                                | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL               | 作者删除时保留内容并清空作者ID        |
| 外键规则       | ——                                | FOREIGN KEY (subset_id) REFERENCES subset(id) ON DELETE SET NULL            | 分类删除时，关联内容的分类ID设为NULL  |

####  点赞表（praise）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 点赞记录ID                            |
| user_id        | BIGINT UNSIGNED                   | 非空、外键（关联 users.id）                                                | 点赞用户ID                            |
| article_id     | BIGINT UNSIGNED                   | 非空、外键（关联 article.id）                                              | 关联文章/图片集ID                     |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 点赞时间                              |
| 联合约束       | ——                                | 唯一索引（uk_user_article：user_id + article_id）                            | 同一用户对同一内容仅能点赞一次        |
| 外键规则       | ——                                | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE                | 用户删除时，关联点赞记录级联删除      |
| 外键规则       | ——                                | FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE           | 内容删除时，关联点赞记录级联删除      |

#### 评论表（comment）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 评论ID                                |
| user_id        | BIGINT UNSIGNED                   | 非空、普通索引（idx_user）、外键（关联 users.id）                            | 评论用户ID                            |
| article_id     | BIGINT UNSIGNED                   | 非空、普通索引（idx_article）、外键（关联 article.id）                       | 关联文章/图片集ID                     |
| parent_id      | BIGINT UNSIGNED                   | 非空、默认值 `0`、普通索引（idx_parent）                                     | 父评论ID（0表示一级评论，非0表示回复） |
| content        | VARCHAR(512)                      | 非空                                                                       | 评论内容（不超过512个字符）           |
| complaint      | INT UNSIGNED                      | 非空、默认值 `0`                                                           | 举报次数                              |
| is_read        | TINYINT(1)                        | 非空、默认值 `0`、普通索引（idx_is_read）                                    | 是否已读：1-是，0-否（针对回复通知）  |
| status         | TINYINT(1)                        | 非空、默认值 `1`                                                           | 状态：1-正常，0-已删除                |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`、普通索引（idx_created_at）                 | 评论时间                              |
| 外键规则       | ——                                | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE                | 用户删除时，关联评论级联删除          |
| 外键规则       | ——                                | FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE           | 内容删除时，关联评论级联删除          |

####  标签字典表（label）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | INT UNSIGNED                      | 主键、自增                                                                 | 标签ID                                |
| label_name     | VARCHAR(30)                       | 非空、唯一索引（uk_label_name）                                             | 标签名称（唯一，如“JavaScript”）      |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 创建时间                              |

#### 个人日记表（diary）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 日记ID                                |
| title          | VARCHAR(100)                      | 非空                                                                       | 日记标题                              |
| content        | TEXT                              | 非空                                                                       | 日记内容                              |
| picture        | VARCHAR(512)                      | 可选（允许为NULL）                                                         | 图片地址（多个图片用逗号分隔）        |
| weather_id     | INT UNSIGNED                      | 可选（允许为NULL）、外键（关联 weather.id）                                 | 天气ID（天气字典删除时设为NULL）      |
| mood           | ENUM('happy', 'sad', 'angry', 'calm', 'excited', 'tired') | 非空、默认值 `calm`、普通索引（idx_mood）                           | 心情状态                              |
| status         | TINYINT(1)                        | 非空、默认值 `1`                                                           | 状态：1-正常，0-已删除                |
| created_at     | DATE                              | 非空、普通索引（idx_created_at）                                            | 记录日期（YYYY-MM-DD格式）            |
| updated_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`                 | 更新时间（自动触发）                  |
| 外键规则       | ——                                | FOREIGN KEY (weather_id) REFERENCES weather(id) ON DELETE SET NULL          | 天气字典删除时，关联天气ID设为NULL    |

#### 天气字典表（weather）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | INT UNSIGNED                      | 主键、自增                                                                 | 天气ID                                |
| weather_name   | VARCHAR(20)                       | 非空、唯一索引（uk_weather_name）                                           | 天气名称（唯一，如“晴、雨、雪”）      |
| icon           | VARCHAR(255)                      | 可选（允许为NULL）                                                         | 天气图标URL地址                       |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 创建时间                              |

####  消息表（message）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 消息ID                                |
| sender_id      | BIGINT UNSIGNED                   | 非空、外键（关联 users.id）                                                | 发送者ID（系统消息可设为特殊用户ID）  |
| receiver_id    | BIGINT UNSIGNED                   | 非空、普通索引（idx_receiver）、外键（关联 users.id）                        | 接收者ID                              |
| content        | VARCHAR(512)                      | 非空                                                                       | 消息内容（不超过512个字符）           |
| is_read        | TINYINT(1)                        | 非空、默认值 `0`、普通索引（idx_is_read）                                    | 是否已读：1-是，0-否                  |
| type           | ENUM('system', 'private', 'notice') | 非空、普通索引（idx_type）                                               | 消息类型：系统消息/私信/通知          |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`、普通索引（idx_created_at）                 | 发送时间                              |
| 外键规则       | ——                                | FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE              | 发送者删除时，关联消息级联删除        |
| 外键规则       | ——                                | FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE            | 接收者删除时，关联消息级联删除        |

#### 访问记录表（record）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 访问记录ID                            |
| user_id        | BIGINT UNSIGNED                   | 可选（允许为NULL）、普通索引（idx_user）                                    | 访问用户ID（游客为NULL）              |
| ip             | VARCHAR(64)                       | 非空、普通索引（idx_ip）                                                   | 访问IP地址                            |
| position       | VARCHAR(100)                      | 可选（允许为NULL）                                                         | 访问地理位置（如“北京市”）            |
| device         | VARCHAR(100)                      | 可选（允许为NULL）                                                         | 设备信息（如“iPhone 15”）             |
| browser        | VARCHAR(50)                       | 可选（允许为NULL）                                                         | 浏览器类型（如“Safari”）              |
| os             | VARCHAR(50)                       | 可选（允许为NULL）                                                         | 操作系统（如“iOS 17”）                |
| path           | VARCHAR(255)                      | 非空、普通索引（idx_path）                                                 | 访问路径（如“/article/1”）            |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`、普通索引（idx_created_at）                 | 访问时间                              |

### 表关系说明

#### 核心关系图谱

```
users（用户）
├── 1:N → article（文章/图片集）：一个用户可创建多条内容
├── 1:N → comment（评论）：一个用户可发多条评论
├── 1:N → praise（点赞）：一个用户可点赞多条内容
├── 1:N → message（消息）：一个用户可发送/接收多条消息
└── 1:N → record（访问记录）：一个用户可产生多条访问记录

subset（分类）
├── 1:N → article（文章/图片集）：一个分类包含多条内容
└── 1:N → file（文件）：一个分类包含多个文件

article（文章/图片集）
├── 1:N → comment（评论）：一条内容可有多条评论
└── 1:N → praise（点赞）：一条内容可有多条点赞

weather（天气）
└── 1:N → diary（日记）：一种天气可关联多条日记

label（标签）
└── N:1 → article（文章/图片集）：多个标签可关联同一内容（通过article.label字段关联）
```

#### 外键约束规则汇总

| 从表字段         | 主表字段       | 删除规则       | 说明                                  |
|------------------|----------------|----------------|---------------------------------------|
| file.subset_id   | subset.id      | ON DELETE SET NULL | 分类删除时，文件的分类ID设为NULL      |
| article.user_id  | users.id       | ON DELETE SET NULL | 作者删除时保留内容并清空作者ID        |
| article.subset_id| subset.id      | ON DELETE SET NULL | 分类删除时，内容的分类ID设为NULL      |
| diary.weather_id | weather.id     | ON DELETE SET NULL | 天气字典删除时，日记的天气ID设为NULL  |
| praise.user_id   | users.id       | ON DELETE CASCADE  | 用户删除时，点赞记录级联删除          |
| praise.article_id| article.id     | ON DELETE CASCADE  | 内容删除时，点赞记录级联删除          |
| comment.user_id  | users.id       | ON DELETE CASCADE  | 用户删除时，评论记录级联删除          |
| comment.article_id| article.id    | ON DELETE CASCADE  | 内容删除时，评论记录级联删除          |
| message.sender_id| users.id       | ON DELETE CASCADE  | 发送者删除时，消息记录级联删除        |
| message.receiver_id| users.id     | ON DELETE CASCADE  | 接收者删除时，消息记录级联删除        |

---
## 数据库初始化逻辑

### 初始化流程

1. 首次启动：
   - 检查 `serve/model/.db_initialized` 标记文件，不存在则执行初始化。
   - 步骤：创建数据库 → 切换数据库 → 按顺序创建 11 张表 → 插入模拟数据 → 写入初始化标记 → 初始化连接池 → 检查文章作者字段。
2. 后续启动：
   - 检测到标记文件，初始化连接池并检查文章作者字段；缺少作者字段、索引或外键时执行只增加结构的兼容迁移，不重建表或删除数据。

### 模拟数据说明

初始化时自动插入测试数据，方便开发调试：

- **用户数据**：5 个测试账号（管理员 / 编辑 / 普通用户 / 游客），默认密码 `123456`。
- **分类数据**：7 个分类（技术博客 / 生活随笔 / 风景摄影等）。
- **内容数据**：3 篇文章 / 图片集、4 个文件、8 个标签。
- **互动数据**：5 条点赞、7 条评论（含回复）。
- **个人数据**：3 条日记、5 条天气字典记录。
- **通知数据**：5 条消息（系统消息 / 私信 / 通知）。
- **统计数据**：5 条访问记录（含游客访问）。
- 模拟数据标记：`.mock_data_inserted` 会在种子数据插入完成后写入；当前初始化流程实际以 `.db_initialized` 决定是否执行首次初始化，未使用该模拟数据标记进行独立的重复插入检查。

### 连接池配置

| 配置项           | 配置值       | 说明                                  |
|------------------|--------------|---------------------------------------|
| connectionLimit  | 20           | 最大并发连接数                        |
| host             | 从config读取 | 数据库服务器地址                      |
| user             | 从config读取 | 数据库登录账号                        |
| password         | 从config读取 | 数据库登录密码                        |
| database         | linlog       | 目标数据库名                          |
| charset          | utf8mb4      | 字符集                                |
| connectTimeout   | 15000ms      | 连接超时时间                          |
| acquireTimeout   | 15000ms      | 获取连接超时时间                      |
| waitForConnections| true        | 连接耗尽时等待（而非直接报错）        |
| queueLimit       | 100          | 等待队列上限                          |
| supportBigNumbers| true         | 支持 BIGINT 等大数字类型              |
| bigNumberStrings | false        | 大数字返回 Number 类型（而非字符串）  |
| timeout          | 30000ms      | 连接空闲超时时间                      |

---

## 数据库使用方法

### 模块引入与初始化

```javascript
//	引入数据库模块
const db = require('./model/db/dbnew')

// 项目启动时初始化数据库（必须先执行）
async function bootstrap() {
  try {
    // 等待数据库初始化完成（首次启动会创建库表和模拟数据）
    await db.initDatabase()
    console.log('数据库初始化成功，可正常执行查询操作')
  } catch (error) {
    console.error('数据库初始化失败：', error.message)
    process.exit(1) // 初始化失败则退出服务
  }
}

// 启动服务
bootstrap()
```

### 注意事项

- **初始化顺序**：所有数据库操作必须在 `initDatabase` 执行完成后进行，否则会报错 “连接池未初始化”。
- **参数绑定**：使用 `db.query` 时，必须通过数组传递参数（如示例中的 `[userId, 0]`），避免 SQL 注入。
- **外键约束**：操作关联表时，需确保主表存在对应记录（如新增文章时，`subset_id` 必须是 `subset` 表中存在的 ID）。
- **密码验证**：用户登录时，需用 `bcrypt.compare` 验证明文密码与数据库中存储的哈希值，不可直接比对字符串。
- **大字段处理**：`article.content` 为 LONGTEXT 类型，存储 HTML 时需注意转义特殊字符，避免 XSS 攻击。

## 维护与调试

### 重置数据库

当需要重新初始化数据库时，执行以下步骤：

1. 删除 `serve/model` 目录下的两个标记文件：`.db_initialized` 和 `.mock_data_inserted`。
2. （可选）手动删除 MySQL 中的 `linlog` 数据库（`DROP DATABASE IF EXISTS linlog;`）。
3. 重启项目，系统会重新执行 “创建库表 + 插入模拟数据” 流程。

### 常见问题排查

| 问题现象                              | 可能原因                              |
| :------------------------------------ | ------------------------------------- |
| 初始化失败，提示“数据库连接超时”      | MySQL服务未启动/端口占用/配置参数错误 |
| 插入数据时提示“外键约束失败”          | 关联的主表记录不存在                  |
| 查询无结果但数据存在                  | 字符集不匹配/索引失效                 |
| 连接池报错 “PROTOCOL_CONNECTION_LOST” | MySQL 服务断开连接                    |
