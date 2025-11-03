const mysql = require('mysql') // 引入 MySQL 客户端模块
const config = require('../../config/default') // 引入数据库配置（主机、账号、密码等）

// 创建单连接
const connection = mysql.createConnection({
    host: config.database.HOST, // 数据库主机地址（如 localhost 或远程 IP）
    user: config.database.USER, // 数据库用户名
    password: config.database.PASSWORD, // 数据库密码
    // 注意：这里没有指定 database（要连接的具体数据库名）
})

// 封装查询方法（返回 Promise）
let query = (sql, values) => {
    return new Promise((resolve, reject) => {
        connection.query(sql, values, (err, result) => {
            if (err) {
                reject(err) // 出错时 reject 错误信息
            } else {
                resolve(result) // 成功时 resolve 查询结果
            }
        })
    })
}

// 创建连接池
let pool = mysql.createPool({
    connectionLimit: 10, // 最大连接数（默认 10）
    host: config.database.HOST,
    user: config.database.USER,
    password: config.database.PASSWORD,
    database: config.database.DB // 直接指定要连接的数据库名
})


let query2 = (sql, values) => {
    return new Promise((resolve, reject) => {
        // 从连接池获取一个连接
        pool.getConnection((err, connection) => {
            if (err) {
                reject(err); // 获取连接失败时直接 reject
            } else {
                // 使用获取到的连接执行查询
                connection.query(sql, values, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                    // 释放连接回池（关键操作）
                    connection.release();
                });
            }
        });
    });
};

// 连接池错误监听
pool.on('error', (err) => {
    console.error('数据库连接池错误：', err);
    // 如遇连接断开,自动重新连接
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        pool = mysql.createPool(pool.config); // 重新创建连接池
    }
});

//  数据库创建语句
let createLinblog = 'CREATE DATABASE IF NOT EXISTS linlog DEFAULT CHARSET utf8 COLLATE utf8_general_ci;'

//  创建数据库
let createDatabase = (db) => {
    return query(db, [])
}

//  数据表
//用户 
let users =
    `create table if not exists users(
     id INT NOT NULL AUTO_INCREMENT,
     name VARCHAR(100) NOT NULL COMMENT '用户名',
     mail VARCHAR(100) NOT NULL COMMENT '邮箱',
     password VARCHAR(100) NOT NULL COMMENT '密码',
     moment VARCHAR(100) NOT NULL COMMENT '时间',
     imgurl VARCHAR(100) COMMENT '头像地址',
     PRIMARY KEY ( id )
    );`

//分组
let subset =
    `create table if not exists subset(
     id INT NOT NULL AUTO_INCREMENT,
     subset_name VARCHAR(100) NOT NULL COMMENT '分类名称',
     classify INT NOT NULL COMMENT '类型0文章,1图片,2资源',
     moment VARCHAR(100) NOT NULL COMMENT '时间',
     PRIMARY KEY ( id )
    );`

//本地文件
let file =
    `create table if not exists file(
     id INT NOT NULL AUTO_INCREMENT,
     url VARCHAR(100) NOT NULL COMMENT '地址',
     file_name VARCHAR(100) NOT NULL COMMENT '名称',
     format VARCHAR(32) NOT NULL COMMENT '格式',
     subset_id INT COMMENT '所属分类',
     moment VARCHAR(100) NOT NULL COMMENT '时间',
     PRIMARY KEY ( id )
    );`

//文章
let article =
    `create table if not exists article(
     id INT NOT NULL AUTO_INCREMENT,
     title VARCHAR(200) NOT NULL COMMENT '标题',
     subset_id INT COMMENT '所属分类',
     classify INT NOT NULL COMMENT '类型0文章,1图片',
     label VARCHAR(200) COMMENT '标签',
     introduce VARCHAR(1000) COMMENT '简介',
     content VARCHAR(5000) COMMENT '内容',
     cover VARCHAR(100) COMMENT '封面地址',
     views INT DEFAULT 0 COMMENT '查看次数',
     state INT DEFAULT 0 COMMENT '文章状态',
     moment VARCHAR(100) NOT NULL COMMENT '时间',
     PRIMARY KEY ( id )
    );`

//文章点赞
let praise =
    `create table if not exists praise(
     id INT NOT NULL AUTO_INCREMENT,
     user_id VARCHAR(100) NOT NULL COMMENT '用户',
     user_type INT NOT NULL COMMENT '查看次数',
     article_id INT  NOT NULL COMMENT '所属文章',
     moment VARCHAR(100) NOT NULL COMMENT '时间',
     PRIMARY KEY ( id )
    );`

//文章评论
let comment =
    `create table if not exists comment(
     id INT NOT NULL AUTO_INCREMENT,
     user_id VARCHAR(100) NOT NULL COMMENT '用户',
     user_type INT NOT NULL COMMENT '用户类型',
     user_name VARCHAR(100) COMMENT '用户名称',
     article_id INT  NOT NULL COMMENT '所属文章',
     moment VARCHAR(100) NOT NULL COMMENT '时间',
     content VARCHAR(1000) NOT NULL COMMENT '内容',
     complaint INT DEFAULT 0 COMMENT '举报次数',
     isread INT DEFAULT 0 COMMENT '是否已读',
     PRIMARY KEY ( id )
    );`

//标签
let label =
    `create table if not exists label(
     id INT NOT NULL AUTO_INCREMENT,
     label_name VARCHAR(100) NOT NULL COMMENT '名称',
     moment VARCHAR(100) NOT NULL COMMENT '时间',
     PRIMARY KEY ( id )
    );`

//日记
let diary =
    `create table if not exists diary(
     id INT NOT NULL AUTO_INCREMENT,
     title VARCHAR(200) NOT NULL COMMENT '标题',
     content VARCHAR(5000) NOT NULL COMMENT '内容',
     picture VARCHAR(500) COMMENT '图片地址',
     weather_id INT COMMENT '天气',
     mood INT DEFAULT 0 COMMENT '心情',
     moment VARCHAR(100) NOT NULL COMMENT '时间',
     PRIMARY KEY ( id )
    );`

//天气
let weather =
    `create table if not exists weather(
     id INT NOT NULL AUTO_INCREMENT,
     weather_name VARCHAR(32) NOT NULL COMMENT '名称',
     icon VARCHAR(100) COMMENT '图标',
     PRIMARY KEY ( id )
    );`

//私信
let message =
    `create table if not exists message(
     id INT NOT NULL AUTO_INCREMENT,
     user_id VARCHAR(100) NOT NULL COMMENT '用户',
     user_type INT NOT NULL COMMENT '用户类型',
     user_name VARCHAR(100) COMMENT '用户名称',
     moment VARCHAR(100) NOT NULL COMMENT '时间',
     content VARCHAR(1000) NOT NULL COMMENT '内容',
     isread INT DEFAULT 0 COMMENT '是否已读',
     PRIMARY KEY ( id )
    );`

//埋点
let record =
    `create table if not exists record(
     id INT NOT NULL AUTO_INCREMENT,
     user_id VARCHAR(100) NOT NULL COMMENT '用户',
     user_type INT NOT NULL COMMENT '用户类型',
     position VARCHAR(100) COMMENT '位置',
     isread INT DEFAULT 0 COMMENT '设备',
     moment VARCHAR(100) NOT NULL COMMENT '时间',
     PRIMARY KEY ( id )
    );`

//创建数据表
const createTable = (sql) => {
    return query2(sql, [])
}

//先创建数据库 再创建数据表
async function create() {
    try {
        // 1. 先创建数据库（使用正确的变量名 createLinblog）
        await createDatabase(createLinblog);
        console.log('数据库 linlog 创建成功（或已存在）');

        // 2. 按依赖顺序创建数据表（添加 await 确保顺序）
        await createTable(users);
        await createTable(subset);
        await createTable(weather);
        await createTable(label);
        await createTable(file);
        await createTable(article);
        await createTable(praise);
        await createTable(comment);
        await createTable(diary);
        await createTable(message);
        await createTable(record);
        console.log('所有数据表创建成功（或已存在）');
    } catch (err) {
        console.error('创建过程出错：', err);
    } finally {
        // 关闭单连接（初始化完成后不需要保持连接）
        connection.end();
    }
}

// 开启连接并执行创建逻辑
connection.connect(err => {
    if (err) {
        console.error('连接失败：', err);
        return;
    }
    console.log('单连接成功，开始创建数据库和表...');
    create(); // 调用创建函数
});
