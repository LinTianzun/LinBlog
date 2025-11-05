//  第二版数据库 缺少关键一些字段
const mysql = require('mysql');
const config = require('../../config/default');
const fs = require('fs').promises;
const path = require('path');

// 初始化状态标记与锁
let isInited = false;
let initPromise = null; // 并发控制锁
const markFilePath = path.join(__dirname, '../.db_initialized'); // 持久化标记文件

// 1. 单连接：仅用于初始化（创建库和表）
const createConn = mysql.createConnection({
    host: config.database.HOST,
    user: config.database.USER,
    password: config.database.PASSWORD,
    charset: 'utf8'
});

// 2. 单连接查询方法（仅初始化用）
const baseQuery = (sql, values = []) => {
    return new Promise((resolve, reject) => {
        createConn.query(sql, values, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

// 3. 连接池：延迟初始化，确保数据库存在后创建
let pool = null;

// 4. 连接池查询方法（导出给业务使用）
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
                conn.release(); // 释放连接
            });
        });
    });
};

// 5. 连接池错误监听与自动重连
const handlePoolError = (err) => {
    console.error('连接池错误：', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        pool = mysql.createPool(pool.config);
        pool.on('error', handlePoolError); // 重新绑定监听
        console.log('连接池已自动重连');
    }
};

// 6. 数据库创建SQL（幂等性）
const createDbSql = 'CREATE DATABASE IF NOT EXISTS linlog DEFAULT CHARSET utf8 COLLATE utf8_general_ci;';

// 7. 数据表SQL（带外键约束和优化）
const tablesSql = {
    users: `CREATE TABLE IF NOT EXISTS users(
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '用户名',
    mail VARCHAR(100) NOT NULL UNIQUE COMMENT '邮箱',
    password VARCHAR(100) NOT NULL COMMENT '密码',
    moment TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    imgurl VARCHAR(255) COMMENT '头像地址',
    PRIMARY KEY (id),
    INDEX idx_mail (mail)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

    subset: `CREATE TABLE IF NOT EXISTS subset(
    id INT NOT NULL AUTO_INCREMENT,
    subset_name VARCHAR(100) NOT NULL COMMENT '分类名称',
    classify ENUM('0','1','2') NOT NULL COMMENT '类型0文章,1图片,2资源',
    moment TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

    file: `CREATE TABLE IF NOT EXISTS file(
    id INT NOT NULL AUTO_INCREMENT,
    url VARCHAR(255) NOT NULL COMMENT '地址',
    file_name VARCHAR(100) NOT NULL COMMENT '名称',
    format VARCHAR(32) NOT NULL COMMENT '格式',
    subset_id INT COMMENT '所属分类',
    moment TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    FOREIGN KEY (subset_id) REFERENCES subset(id) ON DELETE SET NULL,
    INDEX idx_subset (subset_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

    article: `CREATE TABLE IF NOT EXISTS article(
    id INT NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL COMMENT '标题',
    subset_id INT COMMENT '所属分类',
    classify ENUM('0','1') NOT NULL COMMENT '类型0文章,1图片',
    label VARCHAR(200) COMMENT '标签',
    introduce VARCHAR(1000) COMMENT '简介',
    content TEXT NOT NULL COMMENT '内容',
    cover VARCHAR(255) COMMENT '封面地址',
    views INT UNSIGNED DEFAULT 0 COMMENT '查看次数',
    state INT DEFAULT 0 COMMENT '文章状态',
    moment TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    FOREIGN KEY (subset_id) REFERENCES subset(id) ON DELETE SET NULL,
    INDEX idx_subset (subset_id),
    INDEX idx_classify (classify)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

    praise: `CREATE TABLE IF NOT EXISTS praise(
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '用户ID',
    user_type INT NOT NULL COMMENT '用户类型',
    article_id INT NOT NULL COMMENT '所属文章ID',
    moment TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
    PRIMARY KEY (id),
    FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_article (user_id, article_id) -- 避免重复点赞
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

    comment: `CREATE TABLE IF NOT EXISTS comment(
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '用户ID',
    user_type INT NOT NULL COMMENT '用户类型',
    user_name VARCHAR(100) NOT NULL COMMENT '用户名',
    article_id INT NOT NULL COMMENT '所属文章ID',
    moment TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评论时间',
    content VARCHAR(1000) NOT NULL COMMENT '内容',
    complaint INT UNSIGNED DEFAULT 0 COMMENT '举报次数',
    isread INT DEFAULT 0 COMMENT '是否已读',
    PRIMARY KEY (id),
    FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE,
    INDEX idx_article (article_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

    label: `CREATE TABLE IF NOT EXISTS label(
    id INT NOT NULL AUTO_INCREMENT,
    label_name VARCHAR(100) NOT NULL UNIQUE COMMENT '标签名称',
    moment TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

    diary: `CREATE TABLE IF NOT EXISTS diary(
    id INT NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL COMMENT '标题',
    content TEXT NOT NULL COMMENT '内容',
    picture VARCHAR(500) COMMENT '图片地址',
    weather_id INT COMMENT '天气ID',
    mood INT DEFAULT 0 COMMENT '心情',
    moment TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

    weather: `CREATE TABLE IF NOT EXISTS weather(
    id INT NOT NULL AUTO_INCREMENT,
    weather_name VARCHAR(32) NOT NULL UNIQUE COMMENT '天气名称',
    icon VARCHAR(255) COMMENT '图标地址',
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

    message: `CREATE TABLE IF NOT EXISTS message(
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '用户ID',
    user_type INT NOT NULL COMMENT '用户类型',
    user_name VARCHAR(100) NOT NULL COMMENT '用户名',
    moment TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
    content VARCHAR(1000) NOT NULL COMMENT '内容',
    isread INT DEFAULT 0 COMMENT '是否已读',
    PRIMARY KEY (id),
    INDEX idx_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

    record: `CREATE TABLE IF NOT EXISTS record(
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '用户ID',
    user_type INT NOT NULL COMMENT '用户类型',
    position VARCHAR(100) COMMENT '访问位置',
    device VARCHAR(100) DEFAULT '' COMMENT '设备信息',
    moment TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '访问时间',
    PRIMARY KEY (id),
    INDEX idx_user (user_id),
    INDEX idx_moment (moment)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`
};

// 8. 持久化标记检查
async function checkPersistMark() {
    try {
        await fs.access(markFilePath);
        return true;
    } catch {
        return false;
    }
}

// 9. 写入持久化标记
async function writePersistMark() {
    try {
        await fs.writeFile(markFilePath, `Initialized at: ${new Date().toISOString()}`);
        console.log('[DB] 已写入初始化标记文件');
    } catch (err) {
        console.warn('[DB] 标记文件写入失败（不影响功能，但可能重复初始化）：', err);
    }
}

// 10. 实际初始化逻辑（创建库和表）
async function doInit() {
    // 连接单连接
    await new Promise((resolve, reject) => {
        createConn.connect((err) => err ? reject(err) : resolve());
    });
    console.log('[DB] 单连接成功');

    // 创建数据库
    await baseQuery(createDbSql);
    console.log('[DB] 数据库 linlog 处理完成');

    // 切换数据库
    await baseQuery('USE linlog;');
    console.log('[DB] 已切换到 linlog 数据库');

    // 创建数据表（按依赖顺序）
    const createOrder = ['users', 'subset', 'weather', 'label', 'file', 'article', 'praise', 'comment', 'diary', 'message', 'record'];
    for (const tableName of createOrder) {
        await baseQuery(tablesSql[tableName]); // 用单连接创建表
        console.log(`[DB] 数据表 ${tableName} 处理完成`);
    }

    // 关闭单连接
    await new Promise((resolve, reject) => {
        createConn.end((err) => err ? reject(err) : resolve());
    });
    console.log('[DB] 单连接已关闭');

    // 初始化连接池
    pool = mysql.createPool({
        connectionLimit: 10,
        host: config.database.HOST,
        user: config.database.USER,
        password: config.database.PASSWORD,
        database: 'linlog',
        charset: 'utf8',
        connectTimeout: 10000,
        acquireTimeout: 10000,
        waitForConnections: true
    });
    pool.on('error', handlePoolError);
    console.log('[DB] 连接池初始化完成');
}

// 11. 核心初始化函数（带双重锁和幂等性保障）
async function initDatabase() {
    // 已初始化直接返回
    if (isInited) {
        console.log('[DB] 已初始化，无需重复执行');
        return Promise.resolve();
    }

    // 正在初始化，等待结果
    if (initPromise) {
        console.log('[DB] 初始化中，等待完成...');
        return initPromise;
    }

    // 执行初始化（用锁包裹）
    initPromise = (async () => {
        try {
            // 检查持久化标记
            const hasInit = await checkPersistMark();
            if (hasInit) {
                console.log('[DB] 检测到历史初始化记录');
                // 初始化连接池（如果未初始化）
                if (!pool) {
                    pool = mysql.createPool({
                        connectionLimit: 10,
                        host: config.database.HOST,
                        user: config.database.USER,
                        password: config.database.PASSWORD,
                        database: 'linlog',
                        charset: 'utf8'
                    });
                    pool.on('error', handlePoolError);
                }
                isInited = true;
                return;
            }

            // 执行实际初始化
            await doInit();

            // 写入标记
            await writePersistMark();

            isInited = true;
            console.log('[DB] 首次初始化完成');
        } catch (err) {
            console.error('[DB] 初始化失败：', err);
            throw err; // 向外抛出错误
        } finally {
            initPromise = null; // 释放锁
        }
    })();

    return initPromise;
}

// 12. 导出方法
module.exports = {
    query,
    initDatabase
};