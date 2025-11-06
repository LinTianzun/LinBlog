# LinBlog
个人博客

# LinBlog后端接口



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
   - 检查是否存在 `/.db_initialized` 标记文件，不存在则执行初始化。
   - 步骤：创建数据库 → 切换数据库 → 按顺序创建 11 张表 → 插入模拟数据 → 写入初始化标记 → 初始化连接池。
2. 后续启动：
   - 检测到标记文件，直接初始化连接池，跳过表创建和模拟数据插入。

### 模拟数据说明

初始化时自动插入测试数据，方便开发调试：

- **用户数据**：5 个测试账号（管理员 / 编辑 / 普通用户 / 游客），默认密码 `123456`。
- **分类数据**：7 个分类（技术博客 / 生活随笔 / 风景摄影等）。
- **内容数据**：3 篇文章 / 图片集、4 个文件、8 个标签。
- **互动数据**：5 条点赞、7 条评论（含回复）。
- **个人数据**：3 条日记、5 条天气字典记录。
- **通知数据**：5 条消息（系统消息 / 私信 / 通知）。
- **统计数据**：5 条访问记录（含游客访问）。
- 模拟数据标记：`.mock_data_inserted`（避免重复插入）。

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

1. 删除 `model` 目录下的两个标记文件：`.db_initialized` 和 `.mock_data_inserted`。
2. （可选）手动删除 MySQL 中的 `linlog` 数据库（`DROP DATABASE IF EXISTS linlog;`）。
3. 重启项目，系统会重新执行 “创建库表 + 插入模拟数据” 流程。

### 常见问题排查

| 问题现象                              | 可能原因                              |
| :------------------------------------ | ------------------------------------- |
| 初始化失败，提示“数据库连接超时”      | MySQL服务未启动/端口占用/配置参数错误 |
| 插入数据时提示“外键约束失败”          | 关联的主表记录不存在                  |
| 查询无结果但数据存在                  | 字符集不匹配/索引失效                 |
| 连接池报错 “PROTOCOL_CONNECTION_LOST” | MySQL 服务断开连接                    |

