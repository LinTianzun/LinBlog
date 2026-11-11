# LinBlog 数据库文档

> 最后核对：2026-11-12  
> 对应代码：`serve/model/db/dbnew.js`  
> 当前结构：30 张业务表 + `schema_migrations`

## 一、基础信息

| 项目 | 当前值 |
| --- | --- |
| 数据库 | MySQL 8.x |
| 默认库名 | `linlog`，可用 `LINBLOG_DB_NAME` 覆盖 |
| 字符集 | `utf8mb4` |
| 表结构入口 | `serve/model/db/dbnew.js` |
| 初始化方式 | 启动时幂等建库、建表并执行未登记的迁移 |
| 演示数据 | 不自动写入；显式执行 `npm run db:seed` |
| 连接池 | 默认 20 连接，可用 `LINBLOG_DB_CONNECTION_LIMIT` 调整 |

服务启动时执行：

1. `CREATE DATABASE IF NOT EXISTS`
2. 按依赖顺序创建业务表
3. 创建 `schema_migrations`
4. 执行尚未登记的增量迁移
5. 初始化连接池

迁移只追加、不重写历史。迁移版本号是内部顺序标识，不应当作业务日期使用。

## 二、表结构总览

### 用户与权限

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `users` | 用户账号 | `user_type`、`is_super_admin`、`status`、`token_version` |
| `role_permission` | 角色权限矩阵 | `role_key + permission_key` 主键、`allowed` |
| `password_reset_token` | 一次性密码重置令牌 | `token_hash`、`expires_at`、`token_version`、`used_at` |

### 内容

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `subset` | 文章、图库、资源分类 | `subset_name`、`classify`、`status`、`sort` |
| `article` | 文章与摄影图库共用主表 | `classify`、`state`、`scheduled_at`、`draft_*`、`ai_assist_*` |
| `article_version` | 内容版本快照 | `article_id + revision` 唯一、`source` |
| `image` | 内容图片二进制 | `filename`、`checksum`、`data`、`status` |
| `file` | 本地文件与内容图片聚合行 | `url`、`subset_id`、`deleted_at`、`source_image_id` |

### 互动

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `praise` | 文章点赞 | `user_id + article_id` 唯一 |
| `comment` | 文章/图库评论 | `parent_id`、`reply_to_*`、`likes`、`complaint` |
| `diary` | 随笔 | `weather_id`、`mood`、`views`、`ai_assist_*` |
| `diary_praise` | 随笔点赞 | `user_id + diary_id` 唯一 |
| `diary_comment` | 随笔评论 | `parent_id`、`reply_to_*`、`likes` |
| `comment_praise` | 评论点赞 | `target_type + comment_id + user_id` 唯一 |
| `comment_report` | 评论举报 | `reason`、`detail`、`status`、`handle_note` |

### 消息、字典与统计

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `message` | 系统消息、私信、通知 | `sender_id`、`receiver_id`、`type`、`channel` |
| `label` | 标签字典 | `label_name` 唯一 |
| `weather` | 天气字典 | `weather_name` 唯一 |
| `record` | 访问记录 | `ip`、`path`、`device`、`browser`、`os` |
| `view_log` | 浏览量去重 | `target_type + target_id + identifier + created_at` |
| `system_log` | 系统操作审计 | `action`、`module`、`target_*`、`detail`、`ip` |
| `db_backup_log` | 数据库备份与演练记录 | `kind`、`filename`、`checksum`、`status` |

### AI

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `ai_model` | 接入模型 | `base_url`、加密 `api_key`、文本/配图模型、模型级限额 |
| `ai_setting` | 单行 AI 策略 | 配额、超管豁免、去标识策略、文本/配图模型路由 |
| `ai_usage_log` | AI 调用记录 | `feature`、`model_name`、`status`、耗时与 token |
| `ai_pending_image` | 待确认 AI 图片 | `token`、`user_id`、`data`、`expires_at` |
| `ai_model_health` | 模型健康快照 | 成功率、平均耗时、连续失败次数、最近错误 |
| `ai_prompt_template` | 提示词模板 | `template_key`、`feature_key`、`content`、`enabled` |
| `ai_prompt_binding` | 功能当前选用的模板 | `feature_key` 主键、`template_key` |
| `ai_prompt_history` | 提示词修改历史 | `template_key`、`operator_id`、`created_at` |

## 三、核心表说明

### `users`

- `is_super_admin` 标记唯一超级管理员；`super_admin_slot` 生成列保证全库最多一个超管。
- `token_version` 在改密、重置密码后递增，旧 JWT 随即失效。
- 管理员、编辑、普通用户、游客四种 `user_type` 仍保留；细粒度能力以 `role_permission` 为准。

### `article`

- `classify=article` 为博客文章，`classify=image` 为摄影图库。
- `state` 支持 `draft / published / rejected / deleted`。
- 已发布内容的编辑工作稿存放在 `draft_content` 与 `draft_payload`，`draft_revision` 作为乐观锁。
- `scheduled_at` 保存定时发布时间；`article_version` 保存可回滚快照。
- `ai_assisted`、`ai_assist_features`、`ai_assisted_at` 记录作者实际采用的 AI 辅助环节。

### `image` 与 `file`

- 文章封面、正文图片、随笔配图、头像的二进制本体在 `image.data`。
- `file` 同时承载磁盘文件元数据与内容图片聚合行；`source_image_id` 指向 `image.id`。
- 删除磁盘文件时实体移入非公开备份区；内容图片通过 `image.status` 逻辑删除。
- 仍被文章、图库、随笔或头像引用的图片不允许彻底删除。

### 评论与互动

- 文章评论与随笔评论分表存储，但点赞、举报共用 `comment_praise` / `comment_report`。
- `parent_id=0` 表示一级评论；二级回复同时记录 `reply_to_comment_id` 与 `reply_to_user_id`。
- `likes`、`complaint`、`comments` 是冗余计数，写入时与明细表在同一事务中维护。

### `system_log`

- 记录登录、登出、创建、更新、删除、发布、撤回、AI 调用与系统维护操作。
- `module` 用于后台筛选，`detail` 最长 500 字。
- 默认保留 365 天，每天自动清理一次；可用 `LINBLOG_SYSTEM_LOG_RETENTION_DAYS` 调整，最低 30 天。
- 支持按关键词、模块、动作、时间范围筛选与 CSV 导出。

## 四、AI 数据链路

### 模型调用

1. `ai_setting` 决定全局配额、超管豁免、文本/配图模型路由与去标识策略。
2. `ai_model` 提供实际接口地址、加密密钥与模型级限额。
3. 每次调用写 `ai_usage_log`，同时写 `system_log`。
4. 连通性测试与定时巡检更新 `ai_model_health`。

### 图片确认

AI 封面、配图与图片试跑先生成到 `ai_pending_image`，令牌与生成者绑定，
默认 10 分钟过期。作者确认后才写入 `image`，再通过 `file.source_image_id`
出现在素材库；未确认的候选由后台定时清理。

### 提示词管理

- `ai_prompt_template` 保存内置与自定义模板。
- `ai_prompt_binding` 保存每个功能当前选用的模板。
- `ai_prompt_history` 在每次保存前留存旧版本，可查看并回滚。

## 五、关系与删除规则

```text
users
├── 1:N article
├── 1:N diary
├── 1:N comment / diary_comment
├── 1:N message
└── 1:N record / system_log

article
├── 1:N comment
├── 1:N praise
├── 1:N article_version
└── N:1 subset

diary
├── 1:N diary_comment
├── 1:N diary_praise
└── N:1 weather

image
└── 1:1 file.source_image_id（内容图片聚合）
```

| 关系 | 删除规则 |
| --- | --- |
| `article.user_id → users.id` | `SET NULL`，保留内容 |
| `article.subset_id → subset.id` | `SET NULL` |
| `article_version.article_id → article.id` | `CASCADE` |
| `comment.article_id → article.id` | `CASCADE` |
| `praise.article_id → article.id` | `CASCADE` |
| `diary.weather_id → weather.id` | `SET NULL` |
| `diary_comment.diary_id → diary.id` | `CASCADE` |
| `message.sender_id / receiver_id → users.id` | `CASCADE` |
| `role_permission.updated_by → users.id` | `SET NULL` |
| `ai_model_health.model_id → ai_model.id` | `CASCADE` |

## 六、常用命令

```bash
cd serve

npm run db:migrate   # 只执行迁移，不插入演示数据
npm run db:seed      # 空库插入演示数据
npm run db:backup    # 手动数据库备份
npm run db:restore -- <备份文件> --drill
npm test             # 包含迁移与数据模型测试
```

真实数据库集成测试需要显式指定隔离库：

```bash
LINBLOG_INTEGRATION_DB=linlog_integration_test npm run test:integration
```

## 七、维护建议

- 修改表结构时新增迁移，不直接改历史迁移。
- 迁移、备份、恢复演练都应在隔离环境先验证。
- 图片 BLOB 会显著增加数据库体积，生产环境必须配置数据库备份与容量告警。
- `system_log`、`record`、`view_log` 都会滚动清理，排查问题时先确认保留期。
- API Key 必须由后台 AI 管理或环境变量导入，不要写入代码或文档。

## 八、文档更新记录

| 日期 | 内容 |
| --- | --- |
| 2026-11-12 | 按当前 DDL 重写：30 张业务表、AI 管理/健康/提示词历史、系统日志保留与导出、角色模板与内容工作流 |
