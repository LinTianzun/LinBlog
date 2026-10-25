# LinBlog
LinBlog 是一个尚在开发中的个人博客管理项目，采用 Vue 3 + TypeScript 前端和 Express + MySQL 后端。文章、摄影图库、本地文件、日记、评论/私信、总览统计等模块已完成前后端联调；文章支持列表、新建、编辑、搜索、发布、撤回、删除及当前页详情弹窗，日记支持天气图标与最多 6 张图片，图库分组与文章分组共用同一套分类数据。总览页的统计卡片、访问量折线图与设备/系统分布饼图均走真实接口，访问数据由后端中间件写入 `record` 表积累。

## 项目结构与当前状态

| 目录/模块 | 当前实现 |
| --- | --- |
| `lin_blog/` | Vue 3、TypeScript、Vite、Pinia、Vue Router、Yike Design；包含总览、用户管理、文章、图库、文件、日记及编辑页面。文章封面使用 `yk-upload`，详情 HTML 使用 DOMPurify 清洗。 |
| `serve/` | Express 5 API、JWT 认证、MySQL 数据模型；路由覆盖用户、文章、评论、消息、日记、文件、图片上传、分类、标签和总览统计。 |
| `Documentation/` | 开发进度及数据库设计文档。 |
| 用户管理 | 管理员用户列表/搜索/分页、创建、编辑、删除和启用/禁用已联调；统计卡（用户总数/管理员/编辑与普通用户/封禁用户）支持点击筛选与选中高亮，除总数外只统计启用用户。 |
| 文章 | 已完成列表、筛选、搜索、新建、编辑、发布、撤回、删除及当前页详情弹窗联调；新建入口位于总览/Gather 页面。图片上传到本地目录，文章 `cover` 字段保存访问 URL。 |
| 评论、消息 | 已接入真实 API：评论列表/回复/删除、举报数展示、私信收发、一键已读、未读红点提示均可用。 |
| 文件 | 本地文件已接入数据库：上传（多选、单文件 20MB 上限）、图片/文件/视频/压缩包分组、批量移动与删除、下载与缩略图。 |
| 图库 | 摄影图库已接入数据库：图片集创建/编辑/发布/撤回、瀑布流展示、分组与文章分组共用（分组仅在文章页维护）。 |
| 日记 | 随笔随记已接入数据库：天气图标字典与前端对齐（8 种）、图片上限 6 张、按天记录。 |
| 总览 | 四张统计卡片（文件总大小、文章、图库、日记数量）走聚合接口 `GET /api/overview/summary`；访问量折线图与设备/系统分布饼图走 `GET /api/overview/visitStats`，近一周/近一月切换相互独立。 |

### 本地开发命令

前端在 `lin_blog/` 目录安装项目依赖后，可使用：

```sh
npm run dev
npm run build
```

`build` 会先执行 `vue-tsc -b` 类型检查，再运行 Vite 构建。2026-10-25 本地验证构建通过；MockJS 已移除，`eval` 警告消失，仍余单个 500 KB 以上的打包 chunk 警告，详见 [Documentation/开发进度.md](Documentation/开发进度.md)。

后端在 `serve/` 目录执行：

```sh
npm test
npm run db:migrate
npm run db:seed
npm start
```

`serve/.env.example` 提供 JWT、数据库连接、CORS 和 JSON 请求体限制的配置模板；`serve/linlog.js` 会通过 Node.js 的 `loadEnvFile` 加载 `.env`。`LINBLOG_JWT_SECRET` 至少需要 32 个字符。前端 Vite 开发服务器将 `/api` 代理到 `http://localhost:3030`。

#### CORS 跨域配置

`LINBLOG_ALLOWED_ORIGINS` 必须列出实际访问前端的完整来源（协议、域名和可选端口），多个来源用英文逗号分隔，例如 `http://localhost:5173,https://blog.example.com`。不要配置路径、尾部斜杠或通配符；来源格式无效或变量缺失时，服务会在启动配置阶段给出明确错误并退出。后端允许 `Authorization` 请求头以及 `GET/POST/PUT/PATCH/DELETE` 等实际使用的方法，`OPTIONS` 预检由 CORS 中间件在路由前处理。生产部署应只填写可信前端来源，并通过部署平台的环境变量管理密钥。

**数据库安全提示：** 后端启动会幂等创建数据库和表，并执行 `schema_migrations` 中尚未应用的增量迁移，但不会自动插入演示数据。需要演示数据时显式执行 `npm run db:seed`；该脚本在 `users` 表已有数据时跳过。对有价值的数据仍应先备份并在隔离环境验证迁移。

### 已注册的后端 API

| 模块 | 路由 | 认证/说明 |
| --- | --- | --- |
| 用户管理 | `PUT /api/user/updateUser/:id`、`DELETE /api/user/deleteUser/:id`、`PUT /api/user/updateUserStatus/:id` | 管理员操作，需要认证。 |
| 用户 | `GET /api/user/isRegistered`、`POST /api/user/register`、`POST /api/user/login` | 注册和登录公开。 |
| 用户 | `POST /api/user/userInfo`、`POST /api/user/allUser`、`POST /api/user/createUser` | 需要 Bearer Token；用户列表和管理员创建用户仅管理员可操作。 |
| 文章 | `POST/GET /api/article`、`GET/PUT/DELETE /api/article/:id`、`PATCH /api/article/:id/status` | 需要 Bearer Token；列表支持分页、状态、类型和分类筛选。 |
| 公开只读 | `GET /api/public/article`、`GET /api/public/article/:id`、`GET /api/public/comment?articleId=...` | 无需登录；访客仅能读取已发布文章与对应正常评论，携带 Token 时按登录角色放宽可见范围。 |
| 图片上传 | `POST /api/upload/image?token=...`、`GET /api/uploads/:filename` | 上传需要认证，支持 JPG、PNG、WebP、GIF，单文件不超过 8 MB；返回的 URL 可通过静态路由公开访问。 |
| 评论 | `GET/POST /api/comment`、`DELETE /api/comment/:id`、`GET /api/comment/my` | 需要 Bearer Token。 |
| 消息 | `POST /api/message`、`GET /api/message/inbox`、`GET /api/message/outbox`、`PATCH /api/message/read`、`DELETE /api/message/:id`、`GET /api/message/unread/count` | 需要 Bearer Token。 |
| 日记 | `GET/POST /api/diary`、`GET/PUT/DELETE /api/diary/:id` | 需要 Bearer Token；天气按名称匹配前端字典，图片最多 6 张。 |
| 文件 | `GET /api/file`、`GET /api/file/summary`、`POST /api/file/upload?token=...`、`PATCH /api/file/move`、`DELETE /api/file`、`GET /api/file/:id/download` | 上传需要认证（query token）；下载公开，缩略图加 `?inline=true`。 |
| 分类 | `GET /api/subset?classify=...`、`POST /api/subset`、`PUT /api/subset/:id`、`DELETE /api/subset/:id` | 需要认证；图库（`classify=image`）复用文章分组，仅计数口径不同。 |
| 标签 | `GET/POST /api/label`、`DELETE /api/label/:id` | 需要认证；标签被文章引用时禁止删除。 |
| 总览统计 | `GET /api/overview/summary`、`GET /api/overview/visitStats?period=week\|moon` | 需要 Bearer Token；summary 聚合文件总大小、文章/图库/日记数量、评论数与私信未读数，visitStats 返回每日访问量与设备/系统分布。 |
| 系统日志 | `GET /api/systemLog` | 仅管理员；记录登录与各模块写操作（创建/更新/删除、目标类型与 IP），支持分页与关键词搜索。 |

用户管理的前端请求封装位于 `lin_blog/src/api/user.ts`。登录、注册页面使用 `/api/user/login` 和 `/api/user/register`；认证请求从 `localStorage` 读取令牌并添加认证头。文章 API 封装在 `lin_blog/src/api/article.ts`，文章列表、编辑器和详情弹窗已调用真实接口。

图片以二进制保存于数据库 `image` 表（MEDIUMBLOB，单张上限 8 MB），`GET /api/uploads/:filename` 直接从数据库读取并返回；历史磁盘图片已通过迁移 `20261024_image_storage` 一次性导入。文章封面被替换或文章被删除时，后端会检查旧封面图片的引用（文章封面/正文、日记图片、用户头像），无引用则软删对应 `image` 行，`/api/uploads` 访问随之失效。`yk-upload` 通过查询参数携带 Token，因为其上传请求不能附加自定义认证头；上传失败也以 HTTP 200 返回，并通过 `error` 字段传递原因。

### 当前限制与待办

* 用户管理 CRUD 和账号启停用已联调；统计卡除“用户总数”外只统计启用用户，“编辑与普通用户”不含游客（后端 `staff` 过滤口径一致）。公开注册已同时检查邮箱与用户名重复（重复返回 400），并发唯一键冲突仍落入通用 500 待补测。
* 前端构建目前通过，MockJS `eval` 警告已消失，但 OverView / EditArticle 等 chunk 仍超过 500 KB；需评估按页面或编辑器拆包，不应只提高警告阈值。
* 文章、图库、文件、日记、评论/消息、分类/标签和总览统计（含访问量/数据监测图表）已完成真实 API 联调。访问数据由中间件从功能上线起写入 `record` 表，历史数据为空；`position` 字段暂未接 IP 地理解析，饼图来源维度使用操作系统分布。
* 文章模型依赖 `article.user_id` 保存作者及执行权限过滤；迁移版本 `20261023_article_owner` 已在本地测试库执行验证。历史文章作者列允许为 `NULL`。
* JWT 密钥由 `LINBLOG_JWT_SECRET` 提供并要求至少 32 字符，`.env` 会由后端入口加载。认证中间件已区分 Token 错误（401）与数据库故障（503）。
* CORS 允许来源可通过 `LINBLOG_ALLOWED_ORIGINS` 配置，并已允许 `Authorization` 请求头和 `PATCH` 方法。Vite 同源代理开发路径不代表所有跨域部署均已完成验证。
* 文章/评论图片保存于 `image` 表并有引用清理；文件模块的磁盘文件在逻辑删除后保留以便恢复，暂无定期清理、备份或云存储同步机制。
* 后端 `npm test` 当前 `95/95` 通过，覆盖配置校验、文章、评论（安全与两级边界）、用户权限、消息角色、认证中间件（含禁用账号与数据库故障）、封面引用清理、迁移幂等、请求体归一化、图片存储、文件/分类/标签/日记控制器、天气字典、访问统计、系统日志等；测试使用模块替身。真实 MySQL 集成测试见 `serve/test/integration.realDb.test.js`，需设置 `LINBLOG_INTEGRATION_DB` 指向独立验证库才会运行（自动建库迁移、跑完删除，禁止指向默认业务库）。

### 当前验证状态

* 2026-10-25：前端 `vue-tsc` 类型检查和 Vite 生产构建通过，后端测试 `95/95` 通过；另在隔离 MySQL 验证库完成 8 项真实集成测试（迁移幂等、角色过滤、文章权限、图片二进制读写、封面引用清理、评论边界、账号启停用），验证库用后即删。
* 文章、图库、文件、日记、评论/消息、总览统计卡片、访问量/数据监测图表均已在本地环境完成端到端验证；图库与文章分组的共用关系已实测（分组计数按内容类型隔离，删除保护生效）。
* 天气字典已与前端 8 种图标对齐，旧字典行（晴/阴/雨/雪）已清理，日记引用无悬挂。

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

系统共设计 12 张数据表，按业务模块分类如下：

- 用户模块：`users`（用户表）
- 资源分类模块：`subset`（资源分类表）
- 内容模块：`article`（文章 / 图片集表）、`file`（文件存储表）
- 互动模块：`praise`（点赞表）、`comment`（评论表）
- 字典模块：`label`（标签字典表）、`weather`（天气字典表）
- 个人模块：`diary`（个人日记表）
- 通知模块：`message`（消息表）
- 统计模块：`record`（访问记录表）、`system_log`（系统日志表）

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

每次启动都会执行幂等结构检查：

1. 创建数据库（`CREATE DATABASE IF NOT EXISTS`）。
2. 切换数据库并按依赖顺序创建 11 张表（`CREATE TABLE IF NOT EXISTS`）。
3. 创建 `schema_migrations` 并执行尚未登记的迁移。
4. 初始化业务连接池。

演示数据不随服务启动自动写入，需显式执行 `npm run db:seed`。

### 模拟数据说明

执行 `npm run db:seed` 时插入测试数据，方便开发调试：

- **用户数据**：5 个测试账号（管理员 / 编辑 / 普通用户 / 游客），默认密码 `123456`。
- **分类数据**：7 个分类（技术博客 / 生活随笔 / 风景摄影等）。
- **内容数据**：3 篇文章 / 图片集、4 个文件、8 个标签。
- **互动数据**：5 条点赞、7 条评论（含回复）。
- **个人数据**：3 条日记、8 条天气字典记录（名称与前端 `src/utils/weather.ts` 完全对齐）。
- **通知数据**：5 条消息（系统消息 / 私信 / 通知）。
- **统计数据**：5 条访问记录（含游客访问）。
- 播种过程在事务中执行，并以 `users` 表是否已有记录作为幂等判断；不再依赖文件标记。

### 连接池配置

| 配置项           | 配置值       | 说明                                  |
|------------------|--------------|---------------------------------------|
| connectionLimit  | 20           | 最大并发连接数                        |
| host             | 从config读取 | 数据库服务器地址                      |
| user             | 从config读取 | 数据库登录账号                        |
| password         | 从config读取 | 数据库登录密码                        |
| database         | 从config读取 | 目标数据库名（`LINBLOG_DB_NAME`）     |
| charset          | utf8mb4      | 字符集                                |
| connectTimeout   | 15000ms      | 连接超时时间                          |
| waitForConnections| true        | 连接耗尽时等待（而非直接报错）        |
| queueLimit       | 100          | 等待队列上限                          |
| supportBigNumbers| true         | 支持 BIGINT 等大数字类型              |
| bigNumberStrings | false        | 大数字返回 Number 类型（而非字符串）  |
| enableKeepAlive  | true         | 启用 TCP Keep-Alive                   |

---

## 数据库使用方法

### 模块引入与初始化

```javascript
//	引入数据库模块
const db = require('./model/db/dbnew')

// 项目启动时初始化数据库（必须先执行）
async function bootstrap() {
  try {
    // 等待数据库结构检查和迁移完成
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

当需要重新初始化数据库时，先备份并确认目标为本地/隔离测试库，然后执行：

1. 手动删除目标数据库，例如 `DROP DATABASE IF EXISTS linlog;`。
2. 在 `serve/` 执行 `npm run db:migrate` 重建库表并应用迁移。
3. 如需演示数据，执行 `npm run db:seed`。

### 常见问题排查

| 问题现象                              | 可能原因                              |
| :------------------------------------ | ------------------------------------- |
| 初始化失败，提示“数据库连接超时”      | MySQL服务未启动/端口占用/配置参数错误 |
| 插入数据时提示“外键约束失败”          | 关联的主表记录不存在                  |
| 查询无结果但数据存在                  | 字符集不匹配/索引失效                 |
| 连接池报错 “PROTOCOL_CONNECTION_LOST” | MySQL 服务断开连接                    |
