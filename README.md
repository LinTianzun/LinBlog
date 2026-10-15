# LinBlog
个人博客管理项目，采用 Vue 3 + TypeScript 前端与 Express + MySQL 后端。项目已有页面、部分后端接口和数据库模型，仍在开发中；多个内容页面目前使用 Mock 数据，尚不能视为完整可用的博客系统。

## 项目结构与当前状态

| 目录/模块 | 当前实现 |
| --- | --- |
| `lin_blog/` | Vue 3、TypeScript、Vite、Pinia、Vue Router；包含总览、用户管理、文章、图库、文件、日记及编辑页面。 |
| `serve/` | Express 5 API、JWT 认证、MySQL 数据模型；当前有用户、文章、评论和消息路由。 |
| `Documentation/` | 开发进度及数据库设计文档。 |
| 用户管理 | 管理员可以查看、搜索、分页用户并创建用户；编辑弹窗目前只有表单界面，没有保存逻辑或对应后端更新接口。 |
| 文章、评论、消息 | 后端已有部分 API；前端多数对应界面仍依赖 Mock，尚未完成端到端联调。 |
| 其他内容模块 | 分类、标签、文件上传、图库、日记、天气、访问统计等页面/组件仍有 Mock 数据，后端接口尚未齐备。 |

### 本地开发命令

前端在 `lin_blog/` 目录安装项目依赖后，可使用：

```sh
npm run dev
npm run build
```

`build` 会先执行 `vue-tsc -b` 类型检查，再运行 Vite 构建。当前构建检查尚有 TypeScript 错误；请先查看本文件“当前限制与待办”和 `Documentation/开发进度.md`，不要将失败构建视为可发布产物。

后端依赖由 `serve/pnpm-lock.yaml` 管理。在 `serve/` 目录准备依赖后，可用 `node linlog.js` 启动；后端 `package.json` 当前没有 `start`、`dev` 或 `test` 脚本。数据库连接配置在 `serve/config/default.js`，数据库密码可通过 `LINBLOG_DB_PASSWORD` 环境变量提供。前端 Vite 开发服务器将 `/api` 请求代理到 `http://localhost:3030`。

**数据库安全提示：** 后端启动会调用数据库初始化逻辑。首次初始化可建库、建表并插入演示数据；已有初始化标记时仍会检查并可能为 `article` 表增加作者列、索引或外键。只应在已确认的本地/隔离开发数据库中启动，使用有价值的数据前先审查迁移并做好备份。本次未执行后端启动或数据库操作。

### 已注册的后端 API

| 模块 | 路由 | 认证/说明 |
| --- | --- | --- |
| 用户 | `GET /api/user/isRegistered`、`POST /api/user/register`、`POST /api/user/login` | 注册和登录公开。 |
| 用户 | `POST /api/user/userInfo`、`POST /api/user/allUser`、`POST /api/user/createUser` | 需要 Bearer Token；用户列表和管理员创建用户仅管理员可操作。 |
| 文章 | `POST/GET /api/article`、`GET/PUT/DELETE /api/article/:id`、`PATCH /api/article/:id/status` | 需要 Bearer Token；列表支持分页、状态、类型和分类筛选。 |
| 评论 | `GET/POST /api/comment`、`DELETE /api/comment/:id`、`GET /api/comment/my` | 需要 Bearer Token。 |
| 消息 | `POST /api/message`、`GET /api/message/inbox`、`GET /api/message/outbox`、`PATCH /api/message/read`、`DELETE /api/message/:id`、`GET /api/message/unread/count` | 需要 Bearer Token。 |

前端用户管理 API 位于 `lin_blog/src/api/user.ts`：列表通过 `POST /api/user/allUser` 传递分页和关键词，创建用户调用 `POST /api/user/createUser`。登录、注册页面使用 `/api/user/login` 和 `/api/user/register`；请求拦截器从 `localStorage` 读取令牌并添加认证头。

### 当前限制与待办

* 前端 `npm run build` 在 Vue/TypeScript 检查阶段失败。已看到的问题包括多处既有组件类型错误，以及 `UserManagement.vue` 将 Axios 响应按业务响应对象读取、`countByRole` 未使用等诊断；当前页面和用户 API 的类型契约需统一。
* 用户管理页的“编辑/保存修改”尚未接入更新 API；“编辑与普通用户”统计使用“总用户数减管理员数”，会把游客也计入该项。
* 用户登录、注册和用户管理已有部分前后端调用，但文章、评论、消息等其他页面仍未全面接入真实 API。
* 文章模型依赖 `article.user_id` 保存作者及执行权限过滤；新表定义和启动时增量迁移代码已加入，但现有数据库迁移、历史数据兼容和实际 MySQL 行为尚未验证。历史文章作者列允许为 `NULL`。
* 认证逻辑、JWT 密钥配置及 CORS 来源还需进一步复核；不要把前端路由守卫视为后端接口授权的替代。
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
