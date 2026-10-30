const mysql = require('mysql2');
const config = require('../../config/default');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// 初始化状态标记与锁
let isInited = false;
let initPromise = null;
let pool = null; // 连接池全局变量

// -------------------------- 工具函数 --------------------------
const execute = (connection, sql, values = []) => {
  return new Promise((resolve, reject) => {
    connection.query(sql, values, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

const getPoolConnection = () => {
  return new Promise((resolve, reject) => {
    if (!pool) {
      reject(new Error('数据库连接池未初始化，请先调用 initDatabase'));
      return;
    }

    pool.getConnection((err, connection) => {
      if (err) reject(err);
      else resolve(connection);
    });
  });
};

async function withTransaction(callback) {
  const connection = await getPoolConnection();

  try {
    await execute(connection, 'START TRANSACTION');
    const result = await callback(connection);
    await execute(connection, 'COMMIT');
    return result;
  } catch (err) {
    try {
      await execute(connection, 'ROLLBACK');
    } catch (rollbackError) {
      console.error('[DB] 事务回滚失败：', rollbackError);
    }
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * 连接池查询方法（对外暴露，业务使用）
 */
const query = (sql, values = []) => {
  return new Promise((resolve, reject) => {
    if (!pool) {
      return reject(new Error('数据库连接池未初始化，请先调用 initDatabase'));
    }
    pool.getConnection((err, conn) => {
      if (err) {
        reject(err);
        return;
      }
      conn.query(sql, values, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
        conn.release();
      });
    });
  });
};

/**
 * 连接池错误监听
 */
const handlePoolError = (err) => {
  console.error('连接池错误：', err);
  if ([`PROTOCOL_CONNECTION_LOST`, `ECONNRESET`, `ETIMEDOUT`].includes(err.code)) {
    console.log('连接池异常，正在重新创建...');
    pool = mysql.createPool(pool.config);
    pool.on('error', handlePoolError);
    console.log('连接池已重新初始化');
  }
};

const databaseName = config.database.DB;
const databaseIdentifier = `\`${databaseName.replace(/`/g, '``')}\``;

// -------------------------- 数据库与表结构SQL --------------------------
const createDbSql = `
  CREATE DATABASE IF NOT EXISTS ${databaseIdentifier}
  DEFAULT CHARACTER SET utf8mb4 
  DEFAULT COLLATE utf8mb4_unicode_ci;
`;

const tablesSql = {
  users: `CREATE TABLE IF NOT EXISTS users(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID（雪花算法兼容）',
    username VARCHAR(50) NOT NULL COMMENT '用户名（唯一）',
    mail VARCHAR(100) NOT NULL COMMENT '邮箱（登录账号）',
    password VARCHAR(255) NOT NULL COMMENT '密码（bcrypt哈希存储）',
    user_type ENUM('admin', 'editor', 'normal', 'visitor') NOT NULL DEFAULT 'normal' COMMENT '用户类型：管理员/编辑/普通用户/游客',
    is_super_admin TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为唯一超级管理员',
    super_admin_slot TINYINT GENERATED ALWAYS AS (IF(is_super_admin = 1, 1, NULL)) STORED COMMENT '超级管理员唯一槽位',
    imgurl VARCHAR(255) COMMENT '头像地址',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '账号状态：1-正常，0-禁用',
    token_version INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '登录令牌版本（改密后递增）',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    last_login_at DATETIME COMMENT '最后登录时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_mail (mail),
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_single_super_admin (super_admin_slot),
    INDEX idx_user_type (user_type),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';`,

  role_permission: `CREATE TABLE IF NOT EXISTS role_permission(
    role_key ENUM('admin', 'editor', 'normal', 'visitor') NOT NULL COMMENT '可编辑角色',
    permission_key VARCHAR(64) NOT NULL COMMENT '权限标识',
    allowed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许',
    updated_by BIGINT UNSIGNED NULL COMMENT '最后修改人',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (role_key, permission_key),
    INDEX idx_role_permission_updated_by (updated_by),
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色权限矩阵';`,

  subset: `CREATE TABLE IF NOT EXISTS subset(
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类ID',
    subset_name VARCHAR(50) NOT NULL COMMENT '分类名称',
    classify ENUM('article', 'image', 'resource') NOT NULL COMMENT '分类类型：文章/图片/资源',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-启用，0-禁用',
    sort INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序权重（越大越靠前）',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    INDEX idx_subset_classify (subset_name, classify),
    INDEX idx_classify (classify),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资源分类表';`,

  image: `CREATE TABLE IF NOT EXISTS image(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '图片ID',
    filename VARCHAR(100) NOT NULL COMMENT '图片文件名（访问路径唯一标识）',
    mime_type VARCHAR(32) NOT NULL COMMENT '图片 MIME 类型',
    size INT UNSIGNED NOT NULL COMMENT '图片大小（字节）',
    checksum CHAR(64) NOT NULL COMMENT 'SHA-256 内容哈希',
    data MEDIUMBLOB NOT NULL COMMENT '图片二进制内容（最大 16MB）',
    user_id BIGINT UNSIGNED NULL COMMENT '上传用户ID',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-已删除',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_filename (filename),
    INDEX idx_checksum (checksum),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_image_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='图片存储表';`,

  file: `CREATE TABLE IF NOT EXISTS file(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文件ID',
    file_name VARCHAR(100) NOT NULL COMMENT '文件名称',
    format VARCHAR(32) NOT NULL COMMENT '文件格式（如jpg、pdf）',
    size INT UNSIGNED COMMENT '文件大小（字节）',
    url VARCHAR(255) NOT NULL COMMENT '文件存储地址',
    subset_id INT UNSIGNED COMMENT '所属分类ID',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-删除',
    deleted_at DATETIME NULL COMMENT '移入备份区的时间',
    backup_deleted_at DATETIME NULL COMMENT '备份内容清理时间',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
    PRIMARY KEY (id),
    FOREIGN KEY (subset_id) REFERENCES subset(id) ON DELETE SET NULL,
    INDEX idx_subset (subset_id),
    INDEX idx_format (format),
    INDEX idx_status (status),
    INDEX idx_file_deleted_at (status, deleted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文件存储表';`,

  article: `CREATE TABLE IF NOT EXISTS article(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文章ID',
    user_id BIGINT UNSIGNED NULL COMMENT '作者ID',
    title VARCHAR(150) NOT NULL COMMENT '文章标题',
    subset_id INT UNSIGNED COMMENT '所属分类ID',
    classify ENUM('article', 'image') NOT NULL COMMENT '内容类型：文章/图片集',
    label VARCHAR(100) COMMENT '标签（多个用逗号分隔）',
    introduce VARCHAR(512) COMMENT '简介（不超过512字）',
    content LONGTEXT NOT NULL COMMENT '文章内容',
    cover VARCHAR(255) COMMENT '封面图片地址',
    views INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '查看次数',
    likes INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '点赞数（冗余字段）',
    comments INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '评论数（冗余字段）',
    state ENUM('draft', 'published', 'rejected', 'deleted') NOT NULL DEFAULT 'draft' COMMENT '状态：草稿/已发布/已驳回/已删除',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    published_at DATETIME COMMENT '发布时间',
    PRIMARY KEY (id),
    CONSTRAINT fk_article_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (subset_id) REFERENCES subset(id) ON DELETE SET NULL,
    INDEX idx_article_user (user_id),
    INDEX idx_subset (subset_id),
    INDEX idx_classify (classify),
    INDEX idx_state (state),
    INDEX idx_created_at (created_at),
    FULLTEXT INDEX ft_title_intro (title, introduce)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章/图片集表';`,

  praise: `CREATE TABLE IF NOT EXISTS praise(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '点赞ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '点赞用户ID',
    article_id BIGINT UNSIGNED NOT NULL COMMENT '关联文章ID',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_article (user_id, article_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='点赞表';`,

  comment: `CREATE TABLE IF NOT EXISTS comment(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '评论ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '评论用户ID',
    article_id BIGINT UNSIGNED NOT NULL COMMENT '关联文章ID',
    parent_id BIGINT UNSIGNED DEFAULT 0 COMMENT '父评论ID（0表示一级评论）',
    reply_to_comment_id BIGINT UNSIGNED NULL COMMENT '实际回复的评论ID',
    reply_to_user_id BIGINT UNSIGNED NULL COMMENT '实际回复的用户ID',
    content VARCHAR(512) NOT NULL COMMENT '评论内容',
    likes INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '点赞数',
    complaint INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '举报次数',
    is_read TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已读：1-是，0-否',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-已删除',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评论时间',
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE,
    INDEX idx_article (article_id),
    INDEX idx_user (user_id),
    INDEX idx_parent (parent_id),
    INDEX idx_reply_to_comment (reply_to_comment_id),
    INDEX idx_reply_to_user (reply_to_user_id),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论表';`,

  label: `CREATE TABLE IF NOT EXISTS label(
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '标签ID',
    label_name VARCHAR(30) NOT NULL COMMENT '标签名称',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_label_name (label_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='标签字典表';`,

  diary: `CREATE TABLE IF NOT EXISTS diary(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '日记ID',
    user_id BIGINT UNSIGNED NULL COMMENT '作者ID（NULL 表示迁移前的历史随笔）',
    title VARCHAR(100) NOT NULL COMMENT '日记标题',
    content TEXT NOT NULL COMMENT '日记内容',
    picture VARCHAR(2000) COMMENT '图片地址（多个用逗号分隔）',
    weather_id INT UNSIGNED COMMENT '天气ID',
    mood ENUM('happy', 'sad', 'angry', 'calm', 'excited', 'tired') DEFAULT 'calm' COMMENT '心情状态',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-已删除',
    views INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '查看次数',
    created_at DATE NOT NULL COMMENT '记录日期（YYYY-MM-DD）',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    FOREIGN KEY (weather_id) REFERENCES weather(id) ON DELETE SET NULL,
    CONSTRAINT fk_diary_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_created_at (created_at),
    INDEX idx_diary_user (user_id),
    INDEX idx_mood (mood)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='个人日记表';`,

  // 随笔点赞/评论独立建表：diary 与 article 是两张业务表，
  // 不能直接复用 praise/comment 的外键（它们 REFERENCES article）。
  diary_praise: `CREATE TABLE IF NOT EXISTS diary_praise(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '点赞ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '点赞用户ID',
    diary_id BIGINT UNSIGNED NOT NULL COMMENT '关联随笔ID',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (diary_id) REFERENCES diary(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_diary (user_id, diary_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='随笔点赞表';`,

  diary_comment: `CREATE TABLE IF NOT EXISTS diary_comment(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '评论ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '评论用户ID',
    diary_id BIGINT UNSIGNED NOT NULL COMMENT '关联随笔ID',
    parent_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '根评论ID（0表示一级评论）',
    reply_to_comment_id BIGINT UNSIGNED NULL COMMENT '实际回复的评论ID',
    reply_to_user_id BIGINT UNSIGNED NULL COMMENT '实际回复的用户ID',
    content VARCHAR(512) NOT NULL COMMENT '评论内容',
    likes INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '点赞数',
    complaint INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '举报次数',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-已删除',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评论时间',
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (diary_id) REFERENCES diary(id) ON DELETE CASCADE,
    INDEX idx_diary (diary_id),
    INDEX idx_user (user_id),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='随笔评论表';`,

  // 评论点赞/举报：文章评论与随笔评论共用一套表，用 target_type 区分来源
  comment_praise: `CREATE TABLE IF NOT EXISTS comment_praise(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
    target_type ENUM('article','diary') NOT NULL COMMENT '评论所属内容类型',
    comment_id BIGINT UNSIGNED NOT NULL COMMENT '评论ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '点赞用户ID',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_comment (target_type, comment_id, user_id),
    INDEX idx_comment (target_type, comment_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论点赞表';`,

  comment_report: `CREATE TABLE IF NOT EXISTS comment_report(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
    target_type ENUM('article','diary') NOT NULL COMMENT '评论所属内容类型',
    comment_id BIGINT UNSIGNED NOT NULL COMMENT '评论ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '举报用户ID',
    reason VARCHAR(32) NOT NULL DEFAULT 'other' COMMENT '举报原因',
    detail VARCHAR(200) NULL COMMENT '补充说明',
    status TINYINT(1) NOT NULL DEFAULT 0 COMMENT '处理状态：0-待处理，1-已处理，2-已忽略',
    handled_by BIGINT UNSIGNED NULL COMMENT '处理人ID',
    handled_at TIMESTAMP NULL COMMENT '处理时间',
    handle_note VARCHAR(200) NULL COMMENT '处理备注',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '举报时间',
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_comment (target_type, comment_id, user_id),
    INDEX idx_comment (target_type, comment_id),
    INDEX idx_report_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论举报表';`,

  weather: `CREATE TABLE IF NOT EXISTS weather(
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '天气ID',
    weather_name VARCHAR(20) NOT NULL COMMENT '天气名称（如：晴、雨、雪）',
    icon VARCHAR(255) COMMENT '天气图标地址',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_weather_name (weather_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='天气字典表';`,

  message: `CREATE TABLE IF NOT EXISTS message(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '消息ID',
    sender_id BIGINT UNSIGNED NOT NULL COMMENT '发送者ID',
    receiver_id BIGINT UNSIGNED NOT NULL COMMENT '接收者ID',
    content VARCHAR(512) NOT NULL COMMENT '消息内容',
    is_read TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已读：1-是，0-否',
    type ENUM('system', 'private', 'notice') NOT NULL DEFAULT 'notice' COMMENT '消息类型',
    channel ENUM('direct', 'wall') NOT NULL DEFAULT 'direct' COMMENT '私信来源：direct-私信会话，wall-门户留言墙',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
    PRIMARY KEY (id),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_receiver (receiver_id),
    INDEX idx_is_read (is_read),
    INDEX idx_type (type),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息表';`,

  record: `CREATE TABLE IF NOT EXISTS record(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '访问记录ID',
    user_id BIGINT UNSIGNED COMMENT '访问用户ID（游客为NULL）',
    ip VARCHAR(64) NOT NULL COMMENT '访问IP地址',
    position VARCHAR(100) COMMENT '访问地理位置',
    device VARCHAR(100) COMMENT '设备信息（UA解析）',
    browser VARCHAR(50) COMMENT '浏览器类型',
    os VARCHAR(50) COMMENT '操作系统',
    path VARCHAR(255) NOT NULL COMMENT '访问路径',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '访问时间',
    PRIMARY KEY (id),
    INDEX idx_user (user_id),
    INDEX idx_created_at (created_at),
    INDEX idx_ip (ip),
    INDEX idx_path (path)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='访问记录表';`

  ,view_log: `CREATE TABLE IF NOT EXISTS view_log(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '浏览记录ID',
    target_type VARCHAR(20) NOT NULL COMMENT '目标类型（article/image/diary）',
    target_id BIGINT UNSIGNED NOT NULL COMMENT '目标ID',
    identifier VARCHAR(120) NOT NULL COMMENT '访客标识（登录用户 u:{id}，游客为 IP+UA 哈希）',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '浏览时间',
    PRIMARY KEY (id),
    INDEX idx_view_target (target_type, target_id, identifier, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浏览量去重记录表';`

  ,system_log: `CREATE TABLE IF NOT EXISTS system_log(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '日志ID',
    user_id BIGINT UNSIGNED COMMENT '操作用户ID（系统操作为NULL）',
    action VARCHAR(50) NOT NULL COMMENT '动作（login/logout/create/update/delete/publish/revoke/status）',
    module VARCHAR(50) NOT NULL COMMENT '模块（user/article/gallery/diary/file/comment/message/subset/label/system）',
    target_type VARCHAR(50) COMMENT '目标类型（article/diary/user/file等）',
    target_id BIGINT UNSIGNED COMMENT '目标ID',
    detail VARCHAR(500) COMMENT '操作详情（动作描述或关键参数）',
    ip VARCHAR(64) COMMENT '操作IP',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    PRIMARY KEY (id),
    INDEX idx_system_log_user (user_id),
    INDEX idx_system_log_created (created_at),
    INDEX idx_system_log_module (module),
    INDEX idx_system_log_action (action)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统操作日志表';`

  ,password_reset_token: `CREATE TABLE IF NOT EXISTS password_reset_token(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '重置令牌ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    token_hash CHAR(64) NOT NULL COMMENT '令牌SHA-256哈希',
    requested_ip VARCHAR(64) COMMENT '请求IP',
    expires_at DATETIME NOT NULL COMMENT '过期时间',
    token_version INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '签发时的登录令牌版本',
    used_at DATETIME NULL COMMENT '使用时间',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_password_reset_token_hash (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_password_reset_user (user_id, created_at),
    INDEX idx_password_reset_expires (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='密码重置令牌表';`

  ,db_backup_log: `CREATE TABLE IF NOT EXISTS db_backup_log(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '记录ID',
    kind ENUM('backup', 'drill') NOT NULL DEFAULT 'backup' COMMENT '类型：备份/恢复演练',
    filename VARCHAR(150) NOT NULL COMMENT '备份文件名',
    target_database VARCHAR(64) NULL COMMENT '恢复演练的目标库',
    size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '备份文件大小（字节）',
    checksum CHAR(64) NULL COMMENT '备份文件 SHA-256',
    table_count INT UNSIGNED NULL COMMENT '表数量',
    row_count BIGINT UNSIGNED NULL COMMENT '数据行数',
    duration_ms INT UNSIGNED NULL COMMENT '耗时（毫秒）',
    trigger_type ENUM('scheduled', 'manual') NOT NULL DEFAULT 'manual' COMMENT '触发方式',
    status ENUM('success', 'failed') NOT NULL DEFAULT 'success' COMMENT '执行结果',
    error_message VARCHAR(500) NULL COMMENT '失败原因',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    PRIMARY KEY (id),
    INDEX idx_db_backup_kind_status (kind, status),
    INDEX idx_db_backup_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据库备份与演练历史';`
};

// -------------------------- 显式、事务化演示数据 --------------------------
async function seedDemoData() {
  return withTransaction(async (connection) => {
    const baseQuery = (sql, values = []) => execute(connection, sql, values);
    const [existingUsers] = await baseQuery('SELECT COUNT(*) AS total FROM users');

    if (Number(existingUsers.total) > 0) {
      console.log('[DB] users 表已有数据，跳过演示数据插入');
      return { seeded: false };
    }

    console.log('[DB] 开始插入演示数据...');

    const passwordHash = await bcrypt.hash('123456', 10);

    // 1. 插入用户数据
    const users = [
      { username: '管理员', mail: 'admin@linlog.com', password: passwordHash, user_type: 'admin', is_super_admin: 1, imgurl: 'https://picsum.photos/id/1/200', last_login_at: '2025-11-04 10:30:00' },
      { username: '编辑小李', mail: 'editor@linlog.com', password: passwordHash, user_type: 'editor', imgurl: 'https://picsum.photos/id/2/200', last_login_at: '2025-11-04 09:15:00' },
      { username: '普通用户张三', mail: 'user1@linlog.com', password: passwordHash, user_type: 'normal', imgurl: 'https://picsum.photos/id/3/200', last_login_at: '2025-11-03 16:45:00' },
      { username: '普通用户李四', mail: 'user2@linlog.com', password: passwordHash, user_type: 'normal', imgurl: 'https://picsum.photos/id/4/200', last_login_at: '2025-11-03 14:20:00' },
      { username: '游客', mail: 'visitor@linlog.com', password: passwordHash, user_type: 'visitor', imgurl: 'https://picsum.photos/id/5/200' }
    ];
    const userIds = [];
    for (const user of users) {
      const result = await baseQuery(`
        INSERT INTO users (username, mail, password, user_type, is_super_admin, imgurl, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [user.username, user.mail, user.password, user.user_type, user.is_super_admin || 0, user.imgurl, user.last_login_at]);
      userIds.push(result.insertId);
    }
    console.log(`[DB] 插入 ${users.length} 条用户数据（ID：${userIds.join(', ')}）`);

    // 2. 插入分类数据
    const subsets = [
      { subset_name: '图片', classify: 'resource', sort: 100 },
      { subset_name: '文件', classify: 'resource', sort: 99 },
      { subset_name: '视频', classify: 'resource', sort: 98 },
      { subset_name: '压缩包', classify: 'resource', sort: 97 },
      { subset_name: '技术博客', classify: 'article', sort: 10 },
      { subset_name: '生活随笔', classify: 'article', sort: 9 },
      { subset_name: '读书分享', classify: 'article', sort: 8 },
      { subset_name: '风景摄影', classify: 'image', sort: 10 },
      { subset_name: '美食记录', classify: 'image', sort: 9 },
      { subset_name: '软件工具', classify: 'resource', sort: 10 },
      { subset_name: '学习资料', classify: 'resource', sort: 9 }
    ];
    const subsetIds = {};
    for (const subset of subsets) {
      const result = await baseQuery(`
        INSERT INTO subset (subset_name, classify, sort)
        VALUES (?, ?, ?)
      `, [subset.subset_name, subset.classify, subset.sort]);
      if (!subsetIds[subset.classify]) subsetIds[subset.classify] = [];
      subsetIds[subset.classify].push(result.insertId);
      //  按下标取分组容易随插入顺序错位，名称映射更稳妥
      subsetIds[subset.subset_name] = result.insertId;
    }
    console.log(`[DB] 插入 ${subsets.length} 条分类数据`);

    // 3. 插入天气数据
    // 名称与前端 src/utils/weather.ts 保持一致，图标路径对齐 src/assets/weather
    const weathers = [
      { weather_name: '晴天', icon: '/src/assets/weather/qing.svg' },
      { weather_name: '多云', icon: '/src/assets/weather/duoyun.svg' },
      { weather_name: '大雪', icon: '/src/assets/weather/daxue.svg' },
      { weather_name: '大雨', icon: '/src/assets/weather/dayu.svg' },
      { weather_name: '阵风', icon: '/src/assets/weather/feng.svg' },
      { weather_name: '雷雨', icon: '/src/assets/weather/leiyujiaojia.svg' },
      { weather_name: '雾霾', icon: '/src/assets/weather/wu.svg' },
      { weather_name: '夜晚', icon: '/src/assets/weather/yueliang.svg' }
    ];
    const weatherIds = [];
    for (const weather of weathers) {
      const result = await baseQuery(`
        INSERT INTO weather (weather_name, icon)
        VALUES (?, ?)
      `, [weather.weather_name, weather.icon]);
      weatherIds.push(result.insertId);
    }
    console.log(`[DB] 插入 ${weathers.length} 条天气数据`);

    // 4. 插入标签数据
    const labels = ['JavaScript', 'Vue', 'React', '旅行', '美食', '读书', '效率工具', '生活技巧'];
    const labelIds = [];
    for (const labelName of labels) {
      const result = await baseQuery(`
        INSERT INTO label (label_name)
        VALUES (?)
      `, [labelName]);
      labelIds.push(result.insertId);
    }
    console.log(`[DB] 插入 ${labels.length} 条标签数据`);

    // 5. 插入文件数据
    const files = [
      { file_name: 'Vue官方文档.pdf', format: 'pdf', size: 2048000, url: 'https://picsum.photos/id/20/255', subset_id: subsetIds['文件'] },
      { file_name: '风景图1.jpg', format: 'jpg', size: 512000, url: 'https://picsum.photos/id/21/255', subset_id: subsetIds['图片'] },
      { file_name: '美食图2.png', format: 'png', size: 384000, url: 'https://picsum.photos/id/22/255', subset_id: subsetIds['图片'] },
      { file_name: '学习资料.zip', format: 'zip', size: 5120000, url: 'https://picsum.photos/id/23/255', subset_id: subsetIds['压缩包'] }
    ];
    const fileIds = [];
    for (const file of files) {
      const result = await baseQuery(`
        INSERT INTO file (file_name, format, size, url, subset_id)
        VALUES (?, ?, ?, ?, ?)
      `, [file.file_name, file.format, file.size, file.url, file.subset_id]);
      fileIds.push(result.insertId);
    }
    console.log(`[DB] 插入 ${files.length} 条文件数据`);

    // 6. 插入文章数据
    const articles = [
      {
        title: 'Vue3 + Vite 项目搭建实战',
        user_id: userIds[1],
        subset_id: subsetIds.article[0],
        classify: 'article',
        label: 'Vue,JavaScript',
        introduce: '详细介绍Vue3+Vite的项目搭建流程，包括路由、状态管理、UI库集成等核心步骤，适合前端初学者和进阶开发者。',
        content: `<h3>一、环境准备</h3><p>1. 安装Node.js（建议16+版本）</p><p>2. 全局安装Vite：npm install -g create-vite</p><h3>二、创建项目</h3><p>执行命令：npm create vite@latest my-vue3-project -- --template vue</p><p>进入项目：cd my-vue3-project && npm install</p><h3>三、集成路由</h3><p>安装vue-router：npm install vue-router@4</p><p>创建路由配置文件，配置首页、列表页等路由规则。</p>`,
        cover: 'https://picsum.photos/id/30/800',
        views: 1256,
        likes: 89,
        comments: 23,
        state: 'published',
        published_at: '2025-10-28 15:30:00'
      },
      {
        title: '周末徒步旅行：感受大自然的治愈',
        user_id: userIds[2],
        subset_id: subsetIds.article[1],
        classify: 'article',
        label: '旅行,生活',
        introduce: '周末和朋友一起去郊外徒步，远离城市喧嚣，感受山林间的清新空气和自然美景，分享一些徒步小技巧和拍照心得。',
        content: `<p>周末难得的好天气，约上3个朋友一起去了近郊的青山徒步。早上8点出发，车程1.5小时，到达山脚时已经是阳光明媚。</p><p>徒步路线难度适中，全程约8公里，沿途有溪流、竹林、山顶观景台。建议穿舒适的徒步鞋，带足饮用水和少量零食。</p><p>山顶的风景超美，可以俯瞰整个城市的全貌，我们在这里拍了很多照片，用相机记录下这美好的瞬间。</p><p>徒步不仅能锻炼身体，还能放松心情，推荐大家在周末多走出户外，感受大自然的治愈力～</p>`,
        cover: 'https://picsum.photos/id/31/800',
        views: 892,
        likes: 67,
        comments: 18,
        state: 'published',
        published_at: '2025-10-25 10:15:00'
      },
      {
        title: '自制家庭美食合集',
        user_id: userIds[3],
        subset_id: subsetIds.image[1],
        classify: 'image',
        label: '美食,烹饪',
        introduce: '周末在家尝试做的几道家常菜：番茄牛腩、可乐鸡翅、蒜蓉油麦菜，步骤简单，味道超赞，附详细做法和成品图。',
        content: `<p>1. 番茄牛腩：牛腩焯水后加姜片炖煮1小时，加入番茄继续煮30分钟，加盐、生抽调味即可。</p><p>2. 可乐鸡翅：鸡翅焯水，煎至两面金黄，加入可乐、生抽、姜片，煮15分钟收汁。</p><p>3. 蒜蓉油麦菜：油麦菜洗净，蒜蓉爆香，加入油麦菜翻炒2分钟，加盐调味出锅。</p>`,
        cover: 'https://picsum.photos/id/32/800',
        views: 654,
        likes: 53,
        comments: 12,
        state: 'published',
        published_at: '2025-10-22 14:40:00'
      }
    ];
    const articleIds = [];
    for (const article of articles) {
      const result = await baseQuery(`
        INSERT INTO article (user_id, title, subset_id, classify, label, introduce, content, cover, views, likes, comments, state, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        article.user_id, article.title, article.subset_id, article.classify, article.label,
        article.introduce, article.content, article.cover, article.views,
        article.likes, article.comments, article.state, article.published_at
      ]);
      articleIds.push(result.insertId);
    }
    console.log(`[DB] 插入 ${articles.length} 条文章数据（ID：${articleIds.join(', ')}）`);

    // 7. 插入点赞数据
    const praises = [
      { user_id: userIds[0], article_id: articleIds[0] },
      { user_id: userIds[1], article_id: articleIds[0] },
      { user_id: userIds[2], article_id: articleIds[1] },
      { user_id: userIds[3], article_id: articleIds[1] },
      { user_id: userIds[4], article_id: articleIds[2] }
    ];
    for (const praise of praises) {
      await baseQuery(`INSERT IGNORE INTO praise (user_id, article_id) VALUES (?, ?)`, [praise.user_id, praise.article_id]);
    }
    console.log(`[DB] 插入 ${praises.length} 条点赞数据`);

    // 8. 插入评论数据
    const comments = [
      { user_id: userIds[2], article_id: articleIds[0], parent_id: 0, content: '请问Vite怎么配置跨域呀？' },
      { user_id: userIds[1], article_id: articleIds[0], reply_to_index: 0, content: '在vite.config.js中配置server.proxy即可，示例：proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } }' },
      { user_id: userIds[3], article_id: articleIds[0], parent_id: 0, content: '文章写得很详细，已经成功搭建了项目，感谢分享！' },
      { user_id: userIds[4], article_id: articleIds[1], parent_id: 0, content: '请问这个徒步路线具体在哪里呀？' },
      { user_id: userIds[2], article_id: articleIds[1], reply_to_index: 3, content: '是XX市的青山国家森林公园，导航直接搜就能到，门票20元～' },
      { user_id: userIds[1], article_id: articleIds[2], parent_id: 0, content: '可乐鸡翅看起来好香！请问煮的时候需要盖盖子吗？' },
      { user_id: userIds[3], article_id: articleIds[2], reply_to_index: 5, content: '需要盖盖子煮10分钟，最后开盖收汁，这样更入味～' }
    ];
    const commentIds = [];
    for (const comment of comments) {
      const parentId = comment.reply_to_index === undefined
        ? (comment.parent_id || 0)
        : commentIds[comment.reply_to_index];
      const result = await baseQuery(
        `INSERT INTO comment (user_id, article_id, parent_id, content) VALUES (?, ?, ?, ?)`,
        [comment.user_id, comment.article_id, parentId, comment.content]
      );
      commentIds.push(result.insertId);
    }
    console.log(`[DB] 插入 ${comments.length} 条评论数据（含回复）`);

    // 9. 插入日记数据
    const diaries = [
      {
        title: '周一的工作日常',
        content: '今天是周一，早上9点上班，处理了上周遗留的bug，下午开了项目需求会，晚上加了1小时班。虽然有点累，但完成了既定目标，很充实～',
        picture: 'https://picsum.photos/id/40/512',
        weather_id: weatherIds[0],
        mood: 'calm',
        created_at: '2025-11-03'
      },
      {
        title: '周末在家看电影',
        content: '周末在家重温了《阿甘正传》，每次看都有新的感悟。阿甘的坚持和善良真的很打动我，生活就像一盒巧克力，你永远不知道下一块是什么味道～',
        picture: 'https://picsum.photos/id/41/512',
        weather_id: weatherIds[1],
        mood: 'happy',
        created_at: '2025-11-02'
      },
      {
        title: '今天有点小失落',
        content: '项目上线遇到了一些问题，被领导批评了，有点小失落。不过没关系，总结经验教训，下次做得更好！晚上吃了顿好的，心情好多了～',
        picture: '',
        weather_id: weatherIds[2],
        mood: 'sad',
        created_at: '2025-10-31'
      }
    ];
    for (const diary of diaries) {
      await baseQuery(`INSERT INTO diary (title, content, picture, weather_id, mood, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [diary.title, diary.content, diary.picture, diary.weather_id, diary.mood, diary.created_at]);
    }
    console.log(`[DB] 插入 ${diaries.length} 条日记数据`);

    // 10. 插入消息数据
    const messages = [
      { sender_id: userIds[0], receiver_id: userIds[2], type: 'system', content: '您的文章《周末徒步旅行》已被推荐至首页，获得更多曝光～' },
      { sender_id: userIds[0], receiver_id: userIds[3], type: 'system', content: '欢迎加入Linlog，完成个人资料可获得50积分～' },
      { sender_id: userIds[2], receiver_id: userIds[3], type: 'private', content: '李四，周末要不要一起去徒步呀？' },
      { sender_id: userIds[3], receiver_id: userIds[2], type: 'private', content: '好呀！具体时间和地点再敲定一下～' },
      { sender_id: userIds[1], receiver_id: userIds[2], type: 'notice', content: '您的评论收到了新的回复，请查看～' }
    ];
    for (const message of messages) {
      await baseQuery(`INSERT INTO message (sender_id, receiver_id, type, content) VALUES (?, ?, ?, ?)`, [message.sender_id, message.receiver_id, message.type, message.content]);
    }
    console.log(`[DB] 插入 ${messages.length} 条消息数据`);

    // 11. 插入访问记录数据
    const records = [
      { user_id: userIds[2], ip: '192.168.1.100', position: '北京市', device: 'iPhone 15', browser: 'Safari', os: 'iOS 17', path: '/article/1' },
      { user_id: userIds[3], ip: '192.168.1.101', position: '上海市', device: 'Xiaomi 14', browser: 'Chrome', os: 'Android 14', path: '/article/2' },
      { user_id: null, ip: '192.168.1.102', position: '广州市', device: 'MacBook Pro', browser: 'Firefox', os: 'macOS Sonoma', path: '/image/3' },
      { user_id: userIds[4], ip: '192.168.1.103', position: '深圳市', device: 'Windows PC', browser: 'Edge', os: 'Windows 11', path: '/resource' },
      { user_id: userIds[1], ip: '192.168.1.104', position: '杭州市', device: 'iPad Pro', browser: 'Safari', os: 'iPadOS 17', path: '/admin/dashboard' }
    ];
    const now = new Date();
    for (let i = 0; i < records.length; i++) {
      const recordTime = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      await baseQuery(`
        INSERT INTO record (user_id, ip, position, device, browser, os, path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        records[i].user_id, records[i].ip, records[i].position, records[i].device,
        records[i].browser, records[i].os, records[i].path, recordTime
      ]);
    }
    console.log(`[DB] 插入 ${records.length} 条访问记录数据`);

    console.log('[DB] 演示数据插入完成');
    return { seeded: true };
  });
}

// -------------------------- 幂等建表与版本化迁移 --------------------------
const migrationTableSql = `CREATE TABLE IF NOT EXISTS schema_migrations(
  version VARCHAR(100) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据库迁移记录';`;

// -------------------------- 补充演示数据（可重复执行） --------------------------
// 为评论/私信/图库/文章补足演示量；达到目标量则跳过，便于在已有数据的库上执行。
async function seedRichDemoData() {
  return withTransaction(async (connection) => {
    const baseQuery = (sql, values = []) => execute(connection, sql, values);
    const pic = (id) => `https://picsum.photos/id/${id}/800`;

    const userRows = await baseQuery('SELECT id, username, user_type FROM users ORDER BY id ASC');
    if (userRows.length === 0) {
      throw new Error('users 表为空，请先执行 npm run db:seed 插入基础演示数据');
    }
    const admin = userRows.find(u => u.user_type === 'admin') || userRows[0];
    const others = userRows.filter(u => u.id !== admin.id);
    const pickUser = (i) => (others.length > 0 ? others[i % others.length] : admin).id;

    const articleRows = await baseQuery(
      "SELECT id, classify FROM article WHERE state != 'deleted' ORDER BY id ASC"
    );
    const articleIds = articleRows.filter(a => a.classify === 'article').map(a => a.id);
    const galleryCount = articleRows.filter(a => a.classify === 'image').length;
    // 图库与随笔的行：后续补演示评论与举报明细时要用
    const galleryRows = articleRows.filter(a => a.classify === 'image');

    const result = { comments: 0, messages: 0, galleries: 0, articles: 0, reports: 0 };

    // 1. 评论：带举报数、已读/未读，挂在现有文章上
    if (articleIds.length > 0) {
      const existingComments = await baseQuery('SELECT COUNT(*) AS total FROM comment');
      if (Number(existingComments[0].total) < 15) {
        const commentSeeds = [
          { content: '这篇教程太及时了，正好项目中要用到！', complaint: 0, isRead: 1 },
          { content: '请问后续会出进阶篇吗？想看状态管理的部分。', complaint: 0, isRead: 1 },
          { content: '收藏了，写得很系统。', complaint: 0, isRead: 0 },
          { content: '图片挂了，能补一下吗？', complaint: 0, isRead: 0 },
          { content: '广告贴，举报了。', complaint: 3, isRead: 1 },
          { content: '跟着做了一遍，一步都没问题，感谢博主！', complaint: 0, isRead: 1 },
          { content: '求源码，已经私信博主了。', complaint: 1, isRead: 0 },
          { content: '写得很清楚，比官方文档还易懂。', complaint: 0, isRead: 0 },
          { content: '这个方案在生产环境验证过吗？', complaint: 0, isRead: 1 },
          { content: '内容空洞，纯凑字数的。', complaint: 5, isRead: 1 },
          { content: '排版很舒服，学到了不少。', complaint: 0, isRead: 0 },
          { content: '请问移动端适配有什么建议？', complaint: 0, isRead: 0 },
          { content: '已经推荐给同事了。', complaint: 0, isRead: 1 },
          { content: '博主可以加个友链吗？', complaint: 0, isRead: 0 },
          { content: '违规引流内容，已举报。', complaint: 8, isRead: 1 }
        ];

        for (let i = 0; i < commentSeeds.length; i++) {
          const seed = commentSeeds[i];
          const articleId = articleIds[i % articleIds.length];
          await baseQuery(
            `INSERT INTO comment (user_id, article_id, parent_id, content, complaint, is_read, created_at)
             VALUES (?, ?, 0, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
            [pickUser(i), articleId, seed.content, seed.complaint, seed.isRead, i * 5 + 1]
          );
          result.comments++;

          await baseQuery(
            'UPDATE article SET comments = comments + 1 WHERE id = ?',
            [articleId]
          );
        }
      }
    }

    // 2. 私信：发给管理员（大部分未读，红点由此而来）
    const existingPrivate = await baseQuery(
      'SELECT COUNT(*) AS total FROM message WHERE receiver_id = ? AND type = ?',
      [admin.id, 'private']
    );
    if (Number(existingPrivate[0].total) < 10) {
      const messageSeeds = [
        { content: '博主你好，想转载你那篇 Vue3 的文章，会注明出处～', isRead: 0 },
        { content: '请问网站主题是自己写的吗？很好看！', isRead: 0 },
        { content: '你好，想和你交换友情链接，我的站是摄影主题的。', isRead: 0 },
        { content: '上次的建议采纳了，评论功能好用多了！', isRead: 1 },
        { content: '你们网站的加载速度优化是怎么做的？', isRead: 0 },
        { content: '周末有个技术沙龙，想邀请你参加分享～', isRead: 0 },
        { content: '看到你图库里的照片了，拍得真美，用什么相机？', isRead: 1 },
        { content: '博主，网站地图页面好像打不开了。', isRead: 0 },
        { content: '感谢你的教程，帮了大忙！', isRead: 1 },
        { content: '想请教一下你的博客部署架构。', isRead: 0 },
        { content: '下个月一起搞个联名活动怎么样？', isRead: 0 },
        { content: '已经把你的博客推荐给整个部门了。', isRead: 1 }
      ];

      for (let i = 0; i < messageSeeds.length; i++) {
        const seed = messageSeeds[i];
        await baseQuery(
          `INSERT INTO message (sender_id, receiver_id, type, content, is_read, created_at)
           VALUES (?, ?, 'private', ?, ?, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
          [pickUser(i), admin.id, seed.content, seed.isRead, i * 3 + 1]
        );
        result.messages++;
      }
    }

    // 3. 图库作品：classify=image，content 存图片 URL 数组 JSON
    if (galleryCount < 12) {
      const gallerySeeds = [
        { title: '城市黄昏漫步', ids: [1011, 1015, 1016], intro: '傍晚的城市天际线，随手拍都有味道。' },
        { title: '山间清晨', ids: [1018, 1019, 1020], intro: '凌晨五点上山，等一场云海日出。' },
        { title: '咖啡与书桌', ids: [1060, 1062, 1063], intro: '安静的午后，一杯手冲的时间。' },
        { title: '海边日落合集', ids: [1069, 1070, 1071], intro: '海边除了风浪，还有温柔的落日。' },
        { title: '老街烟火气', ids: [1074, 1075, 1076], intro: '老街的招牌、叫卖与炊烟。' },
        { title: '雨后玻璃窗', ids: [1077, 1078, 1079], intro: '雨滴在玻璃上画出的抽象画。' },
        { title: '夜市光影', ids: [1080, 1081, 1082], intro: '霓虹灯下的夜市，人间烟火。' },
        { title: '森系野餐', ids: [1084, 1083], intro: '树荫、野餐垫和微风。' },
        { title: '冬日暖阳', ids: [1085, 1086, 1087], intro: '冬天里最珍贵的一缕阳光。' },
        { title: '街角咖啡馆', ids: [1088, 1089, 1090], intro: '转角遇到的那家小店。' },
        { title: '列车窗外的风景', ids: [1011, 1013, 1014], intro: '旅途中的窗外即景。' },
        { title: '猫咪的午后', ids: [40, 41, 42], intro: '打盹的猫和移动的光斑。' }
      ];

      for (let i = 0; i < gallerySeeds.length; i++) {
        const seed = gallerySeeds[i];
        const photos = seed.ids.map(pic);
        await baseQuery(
          `INSERT INTO article (user_id, title, subset_id, classify, label, introduce, content, cover, views, likes, comments, state, published_at, created_at)
           VALUES (?, ?, NULL, 'image', ?, ?, ?, ?, ?, ?, 0, 'published', NOW(), DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [
            pickUser(i), seed.title,
            i % 3 === 0 ? '摄影,风景' : i % 3 === 1 ? '记录,生活' : '光影',
            seed.intro, JSON.stringify(photos), photos[0],
            100 + i * 37, 8 + i * 3, i + 1, i + 1
          ]
        );
        result.galleries++;
      }
    }

    // 4. 博客文章：classify=article，补充到 10 篇以上
    if (articleIds.length > 0 && articleIds.length < 10) {
      const articleSeeds = [
        { title: '从零搭建一个组件库：工程化篇', intro: '目录结构、构建工具、按需加载与文档站，一步步搭起组件库的骨架。', label: '工程化,组件库' },
        { title: 'MySQL 索引失效的那些坑', intro: '隐式转换、函数包裹、最左匹配……整理了索引失效的常见场景与规避方法。', label: 'MySQL,数据库' },
        { title: '前端监控：从错误捕获到上报', intro: 'window.onerror、unhandledrejection 与 Performance API 的组合拳。', label: '监控,前端' },
        { title: '一次接口慢查询的排查记录', intro: '从慢日志到 EXPLAIN，定位一条 12 秒 SQL 的全过程。', label: 'MySQL,性能' },
        { title: 'CSS 容器查询实战', intro: '告别媒体查询的组件级响应式方案，附三个实用例子。', label: 'CSS,前端' },
        { title: '写好 Commit Message 的五个原则', intro: '约定式提交不只是格式，更是团队协作的沟通语言。', label: '规范,协作' },
        { title: 'Node.js 流式处理大文件', intro: '用 Stream 处理 2GB 日志文件，内存占用从 4GB 降到 80MB。', label: 'Node.js,后端' },
        { title: '自动化部署：从手动到一条命令', intro: 'GitHub Actions + SSH 的轻量级前端部署方案。', label: 'DevOps,部署' },
        { title: 'TypeScript 类型体操入门', intro: '从 Partial 到条件类型，慢慢看懂那些开源库的类型定义。', label: 'TypeScript,前端' },
        { title: '组件设计：Table 的通用化之路', intro: '插槽、渲染器与配置化，平衡灵活性和易用性。', label: '组件设计,前端' }
      ];

      for (let i = 0; i < articleSeeds.length; i++) {
        const seed = articleSeeds[i];
        const isDraft = i % 4 === 3;
        await baseQuery(
          `INSERT INTO article (user_id, title, subset_id, classify, label, introduce, content, cover, views, likes, comments, state, published_at, created_at)
           VALUES (?, ?, NULL, 'article', ?, ?, ?, ?, ?, ?, 0, ?, ${isDraft ? 'NULL' : 'NOW()'}, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [
            pickUser(i + 1), seed.title,
            seed.label,
            seed.intro,
            `<h3>${seed.title}</h3><p>${seed.intro}</p><p>本文先讲清原理，再给出可落地的示例代码，最后总结常见的踩坑点，希望能帮你少走弯路。</p><h3>小结</h3><p>实践出真知，欢迎在评论区交流讨论。</p>`,
            pic(180 + i),
            200 + i * 53, 12 + i * 5,
            isDraft ? 'draft' : 'published',
            i + 1
          ]
        );
        result.articles++;
      }
    }

    // 5. 举报明细：demo 数据只写了 comment.complaint 计数，没有 comment_report 行，
    //    后台举报处理页此前只能看到用户真实举报的那一条。这里为高投诉评论补上明细，
    //    覆盖三种来源（文章 / 图库 / 随笔）与全部六类原因，并让一部分进入已处理/已忽略。
    const diaryRows = await baseQuery(
      'SELECT id FROM diary WHERE status = 1 ORDER BY id ASC LIMIT 4'
    );
    await seedSourceComments(baseQuery, pickUser, galleryRows, diaryRows, result)
    result.reports = await seedReportSeeds(baseQuery, admin);

    return result;
  });
}

/**
 * 为图库与随笔补上带投诉计数的演示评论。
 * 图库评论就是 classify=image 文章下的 comment 行；随笔评论独立落在 diary_comment。
 * 没有这两类评论时，举报页的来源筛选永远只有「博客文章」一项。
 */
async function seedSourceComments(baseQuery, pickUser, galleryRows, diaryRows, result) {
  const gallerySeeds = [
    { content: '第二张的构图太好了，请问用的什么镜头？', complaint: 0 },
    { content: '这套图疑似转载没标出处，已举报。', complaint: 4 },
    { content: '色调很喜欢，收藏学习一下。', complaint: 0 },
    { content: '图片带水印引流，举报了。', complaint: 2 },
  ]
  const diarySeeds = [
    { content: '同款天气，今天也是阴天。', complaint: 0 },
    { content: '这条评论在刷广告，举报一下。', complaint: 3 },
    { content: '写得很有画面感，喜欢。', complaint: 0 },
    { content: '误导信息，数据完全是编的。', complaint: 5 },
  ]

  // 图库评论：挂在 classify=image 的文章上，comment.comments 同步自增
  for (let i = 0; i < galleryRows.length && i < gallerySeeds.length; i += 1) {
    const seed = gallerySeeds[i]
    const [duplicated] = await baseQuery(
      'SELECT id FROM comment WHERE article_id = ? AND content = ? LIMIT 1',
      [galleryRows[i].id, seed.content]
    )
    if (duplicated) continue

    await baseQuery(
      `INSERT INTO comment (user_id, article_id, parent_id, content, complaint, is_read, created_at)
       VALUES (?, ?, 0, ?, ?, 1, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
      [pickUser(i + 2), galleryRows[i].id, seed.content, seed.complaint, i * 6 + 3]
    )
    await baseQuery('UPDATE article SET comments = comments + 1 WHERE id = ?', [galleryRows[i].id])
    result.comments += 1
  }

  // 随笔评论：独立表，diary.comments 同步自增
  for (let i = 0; i < diaryRows.length && i < diarySeeds.length; i += 1) {
    const seed = diarySeeds[i]
    const [duplicated] = await baseQuery(
      'SELECT id FROM diary_comment WHERE diary_id = ? AND content = ? LIMIT 1',
      [diaryRows[i].id, seed.content]
    )
    if (duplicated) continue

    await baseQuery(
      `INSERT INTO diary_comment (user_id, diary_id, parent_id, content, complaint, status, created_at)
       VALUES (?, ?, 0, ?, ?, 1, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
      [pickUser(i + 3), diaryRows[i].id, seed.content, seed.complaint, i * 6 + 4]
    )
    await baseQuery('UPDATE diary SET comments = comments + 1 WHERE id = ?', [diaryRows[i].id])
    result.comments += 1
  }
}

/**
 * 补写举报明细（幂等：comment_report 已有数据时整体跳过）。
 * 举报人必须不是评论作者，否则 report() 会按「举报本人」拒绝，与线上行为不一致。
 */
async function seedReportSeeds(baseQuery, admin) {
  const [existing] = await baseQuery('SELECT COUNT(*) AS total FROM comment_report');
  if (Number(existing.total) >= 10) return 0;

  // 取带投诉计数的文章评论与随笔评论，按投诉数从高到低排列
  const articleComments = await baseQuery(
    `SELECT c.id, c.user_id, c.article_id, c.complaint, c.content, a.classify
     FROM comment c
     LEFT JOIN article a ON a.id = c.article_id
     WHERE c.status = 1 AND c.complaint > 0
     ORDER BY c.complaint DESC, c.id ASC`
  );
  const diaryComments = await baseQuery(
    `SELECT c.id, c.user_id, c.diary_id, c.complaint, c.content
     FROM diary_comment c
     WHERE c.status = 1
     ORDER BY c.complaint DESC, c.id ASC`
  );

  // 图库评论与文章评论同为 target_type='article'，靠 classify=image 区分来源
  const galleryComments = articleComments.filter(item => item.classify === 'image');
  const articleOnly = articleComments.filter(item => item.classify !== 'image');

  const users = await baseQuery('SELECT id FROM users ORDER BY id ASC');
  if (users.length === 0) return 0;

  const reasonPool = ['spam', 'abuse', 'porn', 'illegal', 'misinformation', 'other']
  const detailPool = {
    spam: '评论区刷二维码引流，和正文完全无关。',
    abuse: '直接人身攻击，用词很难听。',
    porn: '配图不适宜，建议下架。',
    illegal: '疑似诈骗链接，点进去会跳外部站点。',
    misinformation: '数据没有出处，和官方文档对不上。',
    other: '内容明显与主题无关。',
  }
  // 状态分布：前 4 条待处理，之后交替已处理 / 已忽略
  const statusPool = [0, 0, 0, 0, 1, 2, 0, 1, 2, 1]

  const seeds = []
  const push = (row, targetType, sourceId) => {
    if (!row || !sourceId) return
    const wanted = Math.min(Number(row.complaint || 1), 3)
    for (let i = 0; i < wanted; i += 1) {
      seeds.push({ row, targetType, sourceId })
    }
  }

  // 覆盖三种来源：文章取投诉最多的 4 条，图库取 2 条，随笔取 3 条
  articleOnly.slice(0, 4).forEach(row => push(row, 'article', row.article_id))
  galleryComments.slice(0, 2).forEach(row => push(row, 'article', row.article_id))
  diaryComments.slice(0, 3).forEach(row => push(row, 'diary', row.diary_id))

  let inserted = 0
  for (let i = 0; i < seeds.length; i += 1) {
    const seed = seeds[i]
    const reason = reasonPool[i % reasonPool.length]
    const status = statusPool[i % statusPool.length]
    // 举报人不能是评论作者，也不能是管理员（模拟真实访客举报）
    const reporter = users.find(user => user.id !== seed.row.user_id && user.id !== admin.id)
      || users.find(user => user.id !== seed.row.user_id)
    if (!reporter) continue

    const duplicated = await baseQuery(
      'SELECT id FROM comment_report WHERE target_type = ? AND comment_id = ? AND user_id = ? LIMIT 1',
      [seed.targetType, seed.row.id, reporter.id]
    )
    if (duplicated.length > 0) continue

    await baseQuery(
      `INSERT INTO comment_report
       (target_type, comment_id, user_id, reason, detail, status, handled_by, handled_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
      [
        seed.targetType, seed.row.id, reporter.id, reason,
        detailPool[reason], status,
        status === 0 ? null : admin.id,
        status === 0 ? null : new Date(Date.now() - i * 1800 * 1000),
        i * 7 + 2
      ]
    )
    inserted += 1
  }

  return inserted
}

async function initializeSchema() {
  const connection = mysql.createConnection({
    host: config.database.HOST,
    port: config.database.PORT,
    user: config.database.USER,
    password: config.database.PASSWORD,
    charset: 'utf8mb4'
  });
  const exec = (sql, values = []) => execute(connection, sql, values);
  let connected = false;

  try {
    await new Promise((resolve, reject) => {
      connection.connect((err) => err ? reject(err) : resolve());
    });
    connected = true;
    console.log('[DB] 数据库连接成功，开始检查结构');

    await exec(createDbSql);
    await exec(`USE ${databaseIdentifier}`);

    const createOrder = ['users', 'role_permission', 'password_reset_token', 'subset', 'weather', 'label', 'image', 'file', 'article', 'praise', 'comment', 'diary', 'diary_praise', 'diary_comment', 'comment_praise', 'comment_report', 'message', 'record', 'view_log', 'system_log', 'db_backup_log'];
    for (const tableName of createOrder) {
      await exec(tablesSql[tableName]);
    }

    await exec(migrationTableSql);
    await runMigrations(exec);
    console.log('[DB] 数据表结构检查完成');
  } finally {
    if (connected) {
      await new Promise((resolve) => {
        connection.end((err) => {
          if (err) {
            console.warn('[DB] 初始化连接关闭失败：', err);
          }
          resolve();
        });
      });
    }
  }
}

// -------------------------- 连接池初始化（每次启动都执行）--------------------------
function initPool() {
  if (pool) {
    console.log('[DB] 连接池已存在，无需重复初始化');
    return;
  }
  pool = mysql.createPool({
    connectionLimit: 20,
    host: config.database.HOST,
    port: config.database.PORT,
    user: config.database.USER,
    password: config.database.PASSWORD,
    database: databaseName,
    charset: 'utf8mb4',
    connectTimeout: 15000,
    waitForConnections: true,
    queueLimit: 100,
    supportBigNumbers: true,
    bigNumberStrings: false,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
  pool.on('error', handlePoolError);
  console.log('[DB] 数据库连接池初始化完成（可正常提供业务查询）');
}

async function ensureArticleOwnerSchema(exec = query) {
  const [ownerColumn] = await exec(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'article'
      AND COLUMN_NAME = 'user_id'
  `);
  if (!ownerColumn) {
    await exec(`
      ALTER TABLE article
      ADD COLUMN user_id BIGINT UNSIGNED NULL COMMENT '作者ID' AFTER id
    `);
  }

  const [ownerIndex] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'article'
      AND INDEX_NAME = 'idx_article_user'
      AND COLUMN_NAME = 'user_id'
      AND SEQ_IN_INDEX = 1
  `);
  if (!ownerIndex) {
    await exec('ALTER TABLE article ADD INDEX idx_article_user (user_id)');
  }

  const [ownerConstraint] = await exec(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'article'
      AND COLUMN_NAME = 'user_id'
      AND REFERENCED_TABLE_NAME = 'users'
      AND REFERENCED_COLUMN_NAME = 'id'
  `);
  if (!ownerConstraint) {
    await exec(`
      ALTER TABLE article
      ADD CONSTRAINT fk_article_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    `);
  }
}

async function ensureImageStorageSchema(exec = query) {
  const [tableExists] = await exec(`
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'image'
  `)

  if (!tableExists) {
    await exec(tablesSql.image)
    return
  }

  const columns = await exec(`
    SELECT COLUMN_NAME, COLUMN_TYPE
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'image'
  `)
  const columnTypes = new Map(
    columns.map((column) => [column.COLUMN_NAME, column.COLUMN_TYPE])
  )

  if (!columnTypes.has('id')) {
    await exec(`
      ALTER TABLE image
      ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY
    `)
  }

  const requiredColumns = [
    ['filename', "VARCHAR(100) NOT NULL COMMENT '图片文件名（访问路径唯一标识）'"],
    ['mime_type', "VARCHAR(32) NOT NULL COMMENT '图片 MIME 类型'"],
    ['size', "INT UNSIGNED NOT NULL COMMENT '图片大小（字节）'"],
    ['checksum', "CHAR(64) NOT NULL COMMENT 'SHA-256 内容哈希'"],
    ['data', "MEDIUMBLOB NOT NULL COMMENT '图片二进制内容（最大 16MB）'"],
    ['user_id', "BIGINT UNSIGNED NULL COMMENT '上传用户ID'"],
    ['status', "TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-已删除'"],
    ['created_at', "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间'"]
  ]

  for (const [name, definition] of requiredColumns) {
    if (!columnTypes.has(name)) {
      await exec(`ALTER TABLE image ADD COLUMN ${name} ${definition}`)
    }
  }

  if (columnTypes.has('data') && columnTypes.get('data') !== 'mediumblob') {
    await exec(`
      ALTER TABLE image
      MODIFY COLUMN data MEDIUMBLOB NOT NULL COMMENT '图片二进制内容（最大 16MB）'
    `)
  }

  const [filenameIndex] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'image'
      AND INDEX_NAME = 'uk_filename'
      AND COLUMN_NAME = 'filename'
      AND SEQ_IN_INDEX = 1
  `)
  if (!filenameIndex) {
    await exec('ALTER TABLE image ADD UNIQUE KEY uk_filename (filename)')
  }

  const [checksumIndex] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'image'
      AND INDEX_NAME = 'idx_checksum'
      AND COLUMN_NAME = 'checksum'
      AND SEQ_IN_INDEX = 1
  `)
  if (!checksumIndex) {
    await exec('ALTER TABLE image ADD INDEX idx_checksum (checksum)')
  }

  const [statusIndex] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'image'
      AND INDEX_NAME = 'idx_status'
      AND COLUMN_NAME = 'status'
      AND SEQ_IN_INDEX = 1
  `)
  if (!statusIndex) {
    await exec('ALTER TABLE image ADD INDEX idx_status (status)')
  }

  const [createdAtIndex] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'image'
      AND INDEX_NAME = 'idx_created_at'
      AND COLUMN_NAME = 'created_at'
      AND SEQ_IN_INDEX = 1
  `)
  if (!createdAtIndex) {
    await exec('ALTER TABLE image ADD INDEX idx_created_at (created_at)')
  }

  const [userConstraint] = await exec(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'image'
      AND COLUMN_NAME = 'user_id'
      AND REFERENCED_TABLE_NAME = 'users'
      AND REFERENCED_COLUMN_NAME = 'id'
  `)
  if (!userConstraint) {
    await exec(`
      ALTER TABLE image
      ADD CONSTRAINT fk_image_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    `)
  }

  const [userIndex] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'image'
      AND INDEX_NAME = 'idx_image_user'
      AND COLUMN_NAME = 'user_id'
      AND SEQ_IN_INDEX = 1
  `)
  if (!userIndex) {
    await exec('ALTER TABLE image ADD INDEX idx_image_user (user_id)')
  }

  await importLegacyImageFiles(exec)
}

async function ensureSubsetSoftDeleteSchema(exec = query) {
  // 软删分类仍占用唯一键会导致同名分类无法重建，唯一性改由应用层保证。
  const [uniqueIndex] = await exec(`
    SELECT NON_UNIQUE
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'subset'
      AND INDEX_NAME = 'uk_subset_classify'
    LIMIT 1
  `);
  if (uniqueIndex && Number(uniqueIndex.NON_UNIQUE) === 0) {
    await exec('ALTER TABLE subset DROP INDEX uk_subset_classify');
  }

  const [normalIndex] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'subset'
      AND INDEX_NAME = 'idx_subset_classify'
    LIMIT 1
  `);
  if (!normalIndex) {
    await exec('ALTER TABLE subset ADD INDEX idx_subset_classify (subset_name, classify)');
  }
}

async function importLegacyImageFiles(exec = query) {
  // 历史封面保存在 serve/data/img，迁移时一次性导入 image 表，保持 /api/uploads URL 可用。
  const legacyDir = path.join(__dirname, '..', '..', 'data', 'img')
  const mimeByExtension = new Map([
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.webp', 'image/webp'],
    ['.gif', 'image/gif']
  ])

  let entries
  try {
    entries = fs.readdirSync(legacyDir)
  } catch {
    return
  }

  for (const filename of entries) {
    const mimeType = mimeByExtension.get(path.extname(filename).toLowerCase())
    if (!mimeType) {
      continue
    }

    const existingRows = await exec(
      'SELECT id FROM image WHERE filename = ? LIMIT 1',
      [filename]
    )
    if (existingRows && existingRows.length > 0) {
      continue
    }

    let buffer
    try {
      buffer = fs.readFileSync(path.join(legacyDir, filename))
    } catch (err) {
      console.warn(`[DB] 读取历史图片失败，跳过 ${filename}：`, err.message)
      continue
    }

    const checksum = crypto.createHash('sha256').update(buffer).digest('hex')
    await exec(
      `INSERT INTO image
          (filename, mime_type, size, checksum, data, user_id)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [filename, mimeType, buffer.length, checksum, buffer]
    )
    console.log(`[DB] 已导入历史图片 ${filename}`)
  }
}

// 列级幂等补全：不存在则 ADD COLUMN，已存在直接跳过（存量库升级用）。
async function ensureColumn(exec, tableName, columnName, { definition, comment }) {
  const [column] = await exec(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
  `, [tableName, columnName]);
  if (column) return false;

  await exec(
    `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition} COMMENT ?`,
    [comment]
  );
  return true;
}

// 浏览量统计：view_log 去重记录表 + article/diary 的 views 计数列。
// 建表语句已在 createOrder 中覆盖新库，这里只负责存量库的补全。
async function ensureViewStatsSchema(exec = query) {
  await exec(tablesSql.view_log);

  await ensureColumn(exec, 'diary', 'views', {
    definition: 'INT UNSIGNED NOT NULL DEFAULT 0',
    comment: '查看次数'
  });
  await ensureColumn(exec, 'article', 'views', {
    definition: 'INT UNSIGNED NOT NULL DEFAULT 0',
    comment: '查看次数'
  });
}

async function ensureFileLifecycleSchema(exec = query) {
  await ensureColumn(exec, 'file', 'deleted_at', {
    definition: 'DATETIME NULL',
    comment: '移入备份区的时间'
  });
  await ensureColumn(exec, 'file', 'backup_deleted_at', {
    definition: 'DATETIME NULL',
    comment: '备份内容清理时间'
  });

  const [lifecycleIndex] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'file'
      AND INDEX_NAME = 'idx_file_deleted_at'
      AND SEQ_IN_INDEX = 1
  `);
  if (!lifecycleIndex) {
    await exec('ALTER TABLE file ADD INDEX idx_file_deleted_at (status, deleted_at)');
  }

  // 存量软删记录缺少删除时间，从升级时开始计算备份保留期。
  await exec('UPDATE file SET deleted_at = NOW() WHERE status = 0 AND deleted_at IS NULL');
}

// 随笔互动：点赞/评论表 + diary 上的冗余计数列。
// 建表语句已覆盖新库，这里只负责存量库补全。
async function ensureDiaryInteractionSchema(exec = query) {
  await exec(tablesSql.diary_praise);
  await exec(tablesSql.diary_comment);

  await ensureColumn(exec, 'diary', 'likes', {
    definition: 'INT UNSIGNED NOT NULL DEFAULT 0',
    comment: '点赞数'
  });
  await ensureColumn(exec, 'diary', 'comments', {
    definition: 'INT UNSIGNED NOT NULL DEFAULT 0',
    comment: '评论数'
  });
}

// 评论互动：点赞/举报表 + 两张评论表上的冗余计数列。
// 建表语句已覆盖新库，这里只负责存量库补全。
async function ensureCommentInteractionSchema(exec = query) {
  await exec(tablesSql.comment_praise);
  await exec(tablesSql.comment_report);

  await ensureColumn(exec, 'comment', 'likes', {
    definition: 'INT UNSIGNED NOT NULL DEFAULT 0',
    comment: '点赞数'
  });
  await ensureColumn(exec, 'diary_comment', 'likes', {
    definition: 'INT UNSIGNED NOT NULL DEFAULT 0',
    comment: '点赞数'
  });
  await ensureColumn(exec, 'diary_comment', 'complaint', {
    definition: 'INT UNSIGNED NOT NULL DEFAULT 0',
    comment: '举报次数'
  });
}

// 举报原因：新表已在建表语句中覆盖，这里只为存量库补字段。
async function ensureCommentReportReasonSchema(exec = query) {
  await ensureColumn(exec, 'comment_report', 'reason', {
    definition: "VARCHAR(32) NOT NULL DEFAULT 'other'",
    comment: '举报原因'
  });
  await ensureColumn(exec, 'comment_report', 'detail', {
    definition: 'VARCHAR(200) NULL',
    comment: '补充说明'
  });
}

// 举报处理：给存量库补处理状态、处理人与处理时间，供后台举报处理页使用。
async function ensureCommentReportHandlingSchema(exec = query) {
  await ensureColumn(exec, 'comment_report', 'status', {
    definition: 'TINYINT(1) NOT NULL DEFAULT 0',
    comment: '处理状态：0-待处理，1-已处理，2-已忽略'
  });
  await ensureColumn(exec, 'comment_report', 'handled_by', {
    definition: 'BIGINT UNSIGNED NULL',
    comment: '处理人ID'
  });
  await ensureColumn(exec, 'comment_report', 'handled_at', {
    definition: 'TIMESTAMP NULL',
    comment: '处理时间'
  });

  const [index] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'comment_report'
      AND INDEX_NAME = 'idx_report_status'
    LIMIT 1
  `);
  if (!index) {
    await exec('ALTER TABLE comment_report ADD INDEX idx_report_status (status)');
  }
}

// 举报处理备注：后台批量/单条处理时可以留下处置说明，便于后续复盘。
async function ensureCommentReportNoteSchema(exec = query) {
  await ensureColumn(exec, 'comment_report', 'handle_note', {
    definition: 'VARCHAR(200) NULL',
    comment: '处理备注'
  });
}

// 数据库备份历史：备份与恢复演练共用一张运行记录表，只存元数据，备份本体在磁盘。
async function ensureDbBackupLogSchema(exec = query) {
  await exec(tablesSql.db_backup_log);
}

// message 表同时承载私信会话与门户留言，用 channel 记录来源。
// 门户展示按发送者只取第一条私信，后续聊天不会因此再次公开。
async function ensureMessageChannelSchema(exec = query) {
  await ensureColumn(exec, 'message', 'channel', {
    definition: "ENUM('direct', 'wall') NOT NULL DEFAULT 'direct'",
    comment: '私信来源：direct-私信会话，wall-门户留言墙'
  });
}

// 两级评论仍统一挂在根评论下，另外记录“实际回复的是哪条评论/哪位用户”，
// 用于二级回复之间继续回复且不产生三级嵌套。
async function ensureCommentReplyTargetSchema(exec = query) {
  await ensureColumn(exec, 'comment', 'reply_to_comment_id', {
    definition: 'BIGINT UNSIGNED NULL',
    comment: '实际回复的评论ID'
  });
  await ensureColumn(exec, 'comment', 'reply_to_user_id', {
    definition: 'BIGINT UNSIGNED NULL',
    comment: '实际回复的用户ID'
  });
}

// 随笔评论与文章评论对齐：统一两级结构，回复二级评论时归一到根评论，
// 并记录实际回复目标用于前端展示「回复 @某人」。
async function ensureDiaryCommentReplySchema(exec = query) {
  await ensureColumn(exec, 'diary_comment', 'parent_id', {
    definition: 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
    comment: '根评论ID（0表示一级评论）'
  });
  await ensureColumn(exec, 'diary_comment', 'reply_to_comment_id', {
    definition: 'BIGINT UNSIGNED NULL',
    comment: '实际回复的评论ID'
  });
  await ensureColumn(exec, 'diary_comment', 'reply_to_user_id', {
    definition: 'BIGINT UNSIGNED NULL',
    comment: '实际回复的用户ID'
  });
}

// 密码重置：令牌只存哈希，并给登录 JWT 增加可失效的版本号。
async function ensurePasswordResetSchema(exec = query) {
  await ensureColumn(exec, 'users', 'token_version', {
    definition: 'INT UNSIGNED NOT NULL DEFAULT 0',
    comment: '登录令牌版本（改密后递增）'
  });
  await exec(tablesSql.password_reset_token);
}

async function ensurePasswordResetVersionGuardSchema(exec = query) {
  await ensureColumn(exec, 'password_reset_token', 'token_version', {
    definition: 'INT UNSIGNED NOT NULL DEFAULT 0',
    comment: '签发时的登录令牌版本'
  });
}

async function ensureAccessControlSchema(exec = query) {
  await ensureColumn(exec, 'users', 'is_super_admin', {
    definition: 'TINYINT(1) NOT NULL DEFAULT 0',
    comment: '是否为唯一超级管理员'
  })
  await ensureColumn(exec, 'users', 'super_admin_slot', {
    definition: 'TINYINT GENERATED ALWAYS AS (IF(is_super_admin = 1, 1, NULL)) STORED',
    comment: '超级管理员唯一槽位'
  })

  const [superAdminIndex] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'uk_single_super_admin'
    LIMIT 1
  `)
  if (!superAdminIndex) {
    await exec('ALTER TABLE users ADD UNIQUE KEY uk_single_super_admin (super_admin_slot)')
  }

  await exec(tablesSql.role_permission)

  // 固定账号只做提升，不自动创建账号或重置密码。
  await exec(
    "UPDATE users SET is_super_admin = 1 WHERE LOWER(TRIM(mail)) = LOWER(TRIM(?)) LIMIT 1",
    ['admin@linlog.com']
  )
}

// 随笔归属：新随笔按作者隔离，历史随笔统一归到最早的管理员名下，
// 否则非管理员登录后会看到别人（主账号）的随笔。
async function ensureDiaryOwnerSchema(exec = query) {
  await ensureColumn(exec, 'diary', 'user_id', {
    definition: 'BIGINT UNSIGNED NULL',
    comment: '作者ID（NULL 表示迁移前的历史随笔）'
  });

  const [ownerIndex] = await exec(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'diary'
      AND INDEX_NAME = 'idx_diary_user'
      AND COLUMN_NAME = 'user_id'
      AND SEQ_IN_INDEX = 1
  `);
  if (!ownerIndex) {
    await exec('ALTER TABLE diary ADD INDEX idx_diary_user (user_id)');
  }

  const [ownerConstraint] = await exec(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'diary'
      AND COLUMN_NAME = 'user_id'
      AND REFERENCED_TABLE_NAME = 'users'
      AND REFERENCED_COLUMN_NAME = 'id'
  `);
  if (!ownerConstraint) {
    await exec(`
      ALTER TABLE diary
      ADD CONSTRAINT fk_diary_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    `);
  }

  const [fallbackOwner] = await exec(`
    SELECT id FROM users
    WHERE user_type = 'admin' AND status = 1
    ORDER BY id ASC
    LIMIT 1
  `);
  const [anyOwner] = fallbackOwner ? [fallbackOwner] : await exec(
    'SELECT id FROM users ORDER BY id ASC LIMIT 1'
  );

  // 没有可归属的用户时保持 NULL，等用户创建后再手动认领，不臆造归属
  if (!anyOwner) return;

  await exec('UPDATE diary SET user_id = ? WHERE user_id IS NULL', [anyOwner.id]);
}

const migrations = [
  {
    version: '20261023_article_owner',
    up: ensureArticleOwnerSchema
  },
  {
    version: '20261024_image_storage',
    up: ensureImageStorageSchema
  },
  {
    version: '20261024_subset_soft_delete',
    up: ensureSubsetSoftDeleteSchema
  },
  {
    version: '20261025_system_log',
    up: async (exec = query) => {
      await exec(tablesSql.system_log);
    }
  },
  {
    version: '20261026_view_stats',
    up: ensureViewStatsSchema
  },
  {
    version: '20261027_file_lifecycle',
    up: ensureFileLifecycleSchema
  },
  {
    version: '20261027_diary_interaction',
    up: ensureDiaryInteractionSchema
  },
  {
    version: '20261027_comment_interaction',
    up: ensureCommentInteractionSchema
  },
  {
    version: '20261027_comment_reply_target',
    up: ensureCommentReplyTargetSchema
  },
  {
    version: '20261028_diary_comment_reply',
    up: ensureDiaryCommentReplySchema
  },
  {
    version: '20261028_password_reset',
    up: ensurePasswordResetSchema
  },
  {
    version: '20261028_password_reset_version_guard',
    up: ensurePasswordResetVersionGuardSchema
  },
  {
    version: '20261028_diary_owner',
    up: ensureDiaryOwnerSchema
  },
  {
    version: '20261028_access_control',
    up: ensureAccessControlSchema
  },
  {
    version: '20261029_comment_report_reason',
    up: ensureCommentReportReasonSchema
  },
  {
    version: '20261029_comment_report_handling',
    up: ensureCommentReportHandlingSchema
  },
  {
    version: '20261029_message_channel',
    up: ensureMessageChannelSchema
  },
  {
    version: '20261029_comment_report_note',
    up: ensureCommentReportNoteSchema
  },
  {
    version: '20261030_db_backup',
    up: ensureDbBackupLogSchema
  }
];

async function runMigrations(exec = query) {
  await exec(migrationTableSql);

  const appliedRows = await exec('SELECT version FROM schema_migrations');
  const appliedVersions = new Set(appliedRows.map((row) => row.version));
  let appliedCount = 0;

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    await migration.up(exec);
    await exec(
      'INSERT INTO schema_migrations (version) VALUES (?)',
      [migration.version]
    );
    appliedCount += 1;
    console.log(`[DB] 已应用迁移 ${migration.version}`);
  }

  return { appliedCount };
}

// -------------------------- 对外暴露的初始化函数（核心入口）--------------------------
async function initDatabase() {
  if (initPromise) {
    console.log('[DB] 初始化中，等待完成...');
    return initPromise;
  }

  if (isInited && pool) {
    return;
  }

  initPromise = (async () => {
    try {
      await initializeSchema();
      initPool();
      isInited = true;
      console.log('[DB] 数据库结构检查完成，服务启动成功！');
    } catch (err) {
      console.error('[DB] 初始化失败，服务无法启动：', err);
      throw err;
    }
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

async function closeDatabase() {
  if (initPromise) {
    await initPromise;
  }

  if (!pool) {
    isInited = false;
    return;
  }

  const closingPool = pool;
  pool = null;
  isInited = false;

  await new Promise((resolve, reject) => {
    closingPool.end((err) => err ? reject(err) : resolve());
  });
}

// -------------------------- 导出方法（业务使用）--------------------------
module.exports = {
  query, // 数据库查询方法
  initDatabase, // 初始化入口（必须先调用）
  seedDemoData,
  runMigrations,
  withTransaction,
  closeDatabase,
  seedRichDemoData,
  isInited: () => isInited, // 检查是否已初始化（可选）
};
