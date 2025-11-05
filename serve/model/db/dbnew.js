const mysql = require('mysql');
const config = require('../../config/default');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');

// -------------------------- 关键优化：使用绝对路径存储标记文件（避免路径问题）--------------------------
const baseMarkPath = path.resolve(__dirname, '../'); // 标记文件存储在 model 目录下
const markFilePath = path.join(baseMarkPath, '.db_initialized'); // 数据库初始化完成标记
const mockDataMarkPath = path.join(baseMarkPath, '.mock_data_inserted'); // 模拟数据插入标记

// 初始化状态标记与锁
let isInited = false;
let initPromise = null;
let pool = null; // 连接池全局变量

// -------------------------- 工具函数 --------------------------
/**
 * 检查数据库是否已初始化（表已创建）
 */
async function checkPersistMark() {
  try {
    await fs.access(markFilePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 写入数据库初始化完成标记
 */
async function writePersistMark() {
  try {
    await fs.writeFile(markFilePath, `Initialized at: ${new Date().toISOString()}`);
    console.log('[DB] 已写入数据库初始化标记文件');
  } catch (err) {
    console.warn('[DB] 标记文件写入失败（不影响功能，但下次启动可能重复初始化）：', err);
  }
}

/**
 * 检查模拟数据是否已插入
 */
async function checkMockDataInserted() {
  try {
    await fs.access(mockDataMarkPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 单连接查询方法（仅首次初始化用）
 */
const createConn = mysql.createConnection({
  host: config.database.HOST,
  user: config.database.USER,
  password: config.database.PASSWORD,
  charset: 'utf8mb4'
});

const baseQuery = (sql, values = []) => {
  return new Promise((resolve, reject) => {
    createConn.query(sql, values, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

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

// -------------------------- 数据库与表结构SQL（仅首次执行）--------------------------
const createDbSql = `
  CREATE DATABASE IF NOT EXISTS linlog 
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
    imgurl VARCHAR(255) COMMENT '头像地址',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '账号状态：1-正常，0-禁用',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    last_login_at DATETIME COMMENT '最后登录时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_mail (mail),
    UNIQUE KEY uk_username (username),
    INDEX idx_user_type (user_type),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';`,

  subset: `CREATE TABLE IF NOT EXISTS subset(
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类ID',
    subset_name VARCHAR(50) NOT NULL COMMENT '分类名称',
    classify ENUM('article', 'image', 'resource') NOT NULL COMMENT '分类类型：文章/图片/资源',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-启用，0-禁用',
    sort INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序权重（越大越靠前）',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_subset_classify (subset_name, classify),
    INDEX idx_classify (classify),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资源分类表';`,

  file: `CREATE TABLE IF NOT EXISTS file(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文件ID',
    file_name VARCHAR(100) NOT NULL COMMENT '文件名称',
    format VARCHAR(32) NOT NULL COMMENT '文件格式（如jpg、pdf）',
    size INT UNSIGNED COMMENT '文件大小（字节）',
    url VARCHAR(255) NOT NULL COMMENT '文件存储地址',
    subset_id INT UNSIGNED COMMENT '所属分类ID',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-删除',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
    PRIMARY KEY (id),
    FOREIGN KEY (subset_id) REFERENCES subset(id) ON DELETE SET NULL,
    INDEX idx_subset (subset_id),
    INDEX idx_format (format),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文件存储表';`,

  article: `CREATE TABLE IF NOT EXISTS article(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文章ID',
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
    FOREIGN KEY (subset_id) REFERENCES subset(id) ON DELETE SET NULL,
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
    content VARCHAR(512) NOT NULL COMMENT '评论内容',
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
    title VARCHAR(100) NOT NULL COMMENT '日记标题',
    content TEXT NOT NULL COMMENT '日记内容',
    picture VARCHAR(512) COMMENT '图片地址（多个用逗号分隔）',
    weather_id INT UNSIGNED COMMENT '天气ID',
    mood ENUM('happy', 'sad', 'angry', 'calm', 'excited', 'tired') DEFAULT 'calm' COMMENT '心情状态',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-已删除',
    created_at DATE NOT NULL COMMENT '记录日期（YYYY-MM-DD）',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    FOREIGN KEY (weather_id) REFERENCES weather(id) ON DELETE SET NULL,
    INDEX idx_created_at (created_at),
    INDEX idx_mood (mood)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='个人日记表';`,

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
};

// -------------------------- 模拟数据插入（仅首次执行）--------------------------
async function insertMockData() {
  try {
    console.log('[DB] 开始插入模拟数据...');

    const passwordHash = await bcrypt.hash('123456', 10);

    // 1. 插入用户数据
    const users = [
      { username: '管理员', mail: 'admin@linlog.com', password: passwordHash, user_type: 'admin', imgurl: 'https://picsum.photos/id/1/200', last_login_at: '2025-11-04 10:30:00' },
      { username: '编辑小李', mail: 'editor@linlog.com', password: passwordHash, user_type: 'editor', imgurl: 'https://picsum.photos/id/2/200', last_login_at: '2025-11-04 09:15:00' },
      { username: '普通用户张三', mail: 'user1@linlog.com', password: passwordHash, user_type: 'normal', imgurl: 'https://picsum.photos/id/3/200', last_login_at: '2025-11-03 16:45:00' },
      { username: '普通用户李四', mail: 'user2@linlog.com', password: passwordHash, user_type: 'normal', imgurl: 'https://picsum.photos/id/4/200', last_login_at: '2025-11-03 14:20:00' },
      { username: '游客', mail: 'visitor@linlog.com', password: passwordHash, user_type: 'visitor', imgurl: 'https://picsum.photos/id/5/200' }
    ];
    const userIds = [];
    for (const user of users) {
      const result = await baseQuery(`
        INSERT INTO users (username, mail, password, user_type, imgurl, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [user.username, user.mail, user.password, user.user_type, user.imgurl, user.last_login_at]);
      userIds.push(result.insertId);
    }
    console.log(`[DB] 插入 ${users.length} 条用户数据（ID：${userIds.join(', ')}）`);

    // 2. 插入分类数据
    const subsets = [
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
    }
    console.log(`[DB] 插入 ${subsets.length} 条分类数据`);

    // 3. 插入天气数据
    const weathers = [
      { weather_name: '晴', icon: 'https://picsum.photos/id/10/32' },
      { weather_name: '阴', icon: 'https://picsum.photos/id/11/32' },
      { weather_name: '雨', icon: 'https://picsum.photos/id/12/32' },
      { weather_name: '雪', icon: 'https://picsum.photos/id/13/32' },
      { weather_name: '多云', icon: 'https://picsum.photos/id/14/32' }
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
      { file_name: 'Vue官方文档.pdf', format: 'pdf', size: 2048000, url: 'https://picsum.photos/id/20/255', subset_id: subsetIds.resource[0] },
      { file_name: '风景图1.jpg', format: 'jpg', size: 512000, url: 'https://picsum.photos/id/21/255', subset_id: subsetIds.image[0] },
      { file_name: '美食图2.png', format: 'png', size: 384000, url: 'https://picsum.photos/id/22/255', subset_id: subsetIds.image[1] },
      { file_name: '学习资料.zip', format: 'zip', size: 5120000, url: 'https://picsum.photos/id/23/255', subset_id: subsetIds.resource[1] }
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
        INSERT INTO article (title, subset_id, classify, label, introduce, content, cover, views, likes, comments, state, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        article.title, article.subset_id, article.classify, article.label,
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
      { user_id: userIds[1], article_id: articleIds[0], parent_id: 1, content: '在vite.config.js中配置server.proxy即可，示例：proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } }' },
      { user_id: userIds[3], article_id: articleIds[0], parent_id: 0, content: '文章写得很详细，已经成功搭建了项目，感谢分享！' },
      { user_id: userIds[4], article_id: articleIds[1], parent_id: 0, content: '请问这个徒步路线具体在哪里呀？' },
      { user_id: userIds[2], article_id: articleIds[1], parent_id: 4, content: '是XX市的青山国家森林公园，导航直接搜就能到，门票20元～' },
      { user_id: userIds[1], article_id: articleIds[2], parent_id: 0, content: '可乐鸡翅看起来好香！请问煮的时候需要盖盖子吗？' },
      { user_id: userIds[3], article_id: articleIds[2], parent_id: 6, content: '需要盖盖子煮10分钟，最后开盖收汁，这样更入味～' }
    ];
    for (const comment of comments) {
      await baseQuery(`INSERT INTO comment (user_id, article_id, parent_id, content) VALUES (?, ?, ?, ?)`, [comment.user_id, comment.article_id, comment.parent_id, comment.content]);
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

    // 写入模拟数据标记
    await fs.writeFile(mockDataMarkPath, `Mock data inserted at: ${new Date().toISOString()}`);
    console.log('[DB] 模拟数据插入完成！');
  } catch (err) {
    console.error('[DB] 模拟数据插入失败：', err);
    throw err;
  }
}

// -------------------------- 首次初始化逻辑（仅执行一次）--------------------------
async function doInit() {
  try {
    // 1. 连接单连接（仅首次创建表用）
    await new Promise((resolve, reject) => {
      createConn.connect((err) => err ? reject(err) : resolve());
    });
    console.log('[DB] 单连接成功（首次初始化）');

    // 2. 创建数据库
    await baseQuery(createDbSql);
    console.log('[DB] 数据库 linlog 创建完成');

    // 3. 切换数据库
    await baseQuery('USE linlog;');
    console.log('[DB] 已切换到 linlog 数据库');

    // 4. 创建所有数据表
    const createOrder = ['users', 'subset', 'weather', 'label', 'file', 'article', 'praise', 'comment', 'diary', 'message', 'record'];
    for (const tableName of createOrder) {
      await baseQuery(tablesSql[tableName]);
      console.log(`[DB] 数据表 ${tableName} 创建完成`);
    }

    // 5. 插入模拟数据
    await insertMockData();

    // 6. 关闭单连接（后续不再使用）
    await new Promise((resolve, reject) => {
      createConn.end((err) => err ? reject(err) : resolve());
    });
    console.log('[DB] 单连接已关闭（首次初始化完成）');

    // 7. 写入初始化标记（关键：后续启动不再执行上述步骤）
    await writePersistMark();

    // 8. 初始化连接池（供业务使用）
    initPool();
  } catch (err) {
    console.error('[DB] 首次初始化失败：', err);
    throw err;
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
    user: config.database.USER,
    password: config.database.PASSWORD,
    database: 'linlog',
    charset: 'utf8mb4',
    connectTimeout: 15000,
    acquireTimeout: 15000,
    waitForConnections: true,
    queueLimit: 100,
    supportBigNumbers: true,
    bigNumberStrings: false,
    timeout: 30000,
  });
  pool.on('error', handlePoolError);
  console.log('[DB] 数据库连接池初始化完成（可正常提供业务查询）');
}

// -------------------------- 对外暴露的初始化函数（核心入口）--------------------------
async function initDatabase() {
  // 防止并发调用
  if (initPromise) {
    console.log('[DB] 初始化中，等待完成...');
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // 检查是否已初始化（通过标记文件）
      const hasInit = await checkPersistMark();
      if (hasInit) {
        console.log('[DB] 检测到已完成首次初始化，直接初始化连接池...');
        initPool(); // 仅初始化连接池，跳过所有创建/插入操作
        isInited = true;
        console.log('[DB] 服务启动完成（已初始化，可正常使用）');
        return;
      }

      // 未初始化：执行首次初始化（创建表+插入数据）
      console.log('[DB] 未检测到初始化标记，执行首次初始化...');
      await doInit();
      isInited = true;
      console.log('[DB] 首次初始化完成，服务启动成功！');
    } catch (err) {
      console.error('[DB] 初始化失败，服务无法启动：', err);
      throw err;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

// -------------------------- 导出方法（业务使用）--------------------------
module.exports = {
  query, // 数据库查询方法
  initDatabase, // 初始化入口（必须先调用）
  isInited: () => isInited, // 检查是否已初始化（可选）
};