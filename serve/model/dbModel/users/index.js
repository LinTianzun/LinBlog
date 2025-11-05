const { query } = require('../../db/dbnew')

// 按「用户名/邮箱」查询用户（支持双登录）
async function findUserByAccount(account) {
    // 用 OR 同时匹配 username 和 mail，兼容双登录
    const sql = `
        SELECT id, username, mail, password, imgurl, user_type, status 
        FROM users 
        WHERE username = ? OR mail = ?
    `;
    return query(sql, [account, account]);
}

// 按邮箱查询用户（注册校验用）
async function findUserByMail(mail) {
    const sql = 'SELECT id, username, mail FROM users WHERE mail = ?';
    return query(sql, [mail]);
}

// 按 ID 查询用户（获取信息用）
async function findUserById(userId) {
    const sql = `
        SELECT id, username, mail, imgurl, user_type, status, created_at, last_login_at 
        FROM users 
        WHERE id = ?
    `;
    return query(sql, [userId]);
}

// 插入新用户（字段与数据库表完全一致）
async function insertUser(userInfo) {
    const { username, mail, password, imgurl } = userInfo;
    // 表字段：username（而非 name），显式指定 user_type 默认值
    const sql = `
        INSERT INTO users (username, mail, password, imgurl, user_type) 
        VALUES (?, ?, ?, ?, 'normal')
    `;  //  默认是普通用户
    return query(sql, [username, mail, password, imgurl]);
}

// 分页查询用户（含总条数）
async function findUsersByPage(page = 1, pageSize = 3) {
    // 计算偏移量（page从1开始，OFFSET = (page-1)*pageSize）
    const offset = (page - 1) * pageSize;

    // 1. 查询当前页用户数据（不含密码）
    const userSql = `
        SELECT id, username, mail, imgurl, user_type, status, created_at, last_login_at 
        FROM users 
        ORDER BY created_at ASC 
        LIMIT ? OFFSET ?
    `;
    const users = await query(userSql, [pageSize, offset]);

    // 2. 查询总条数（用于计算总页数）
    const totalSql = 'SELECT COUNT(*) AS total FROM users';
    const [totalResult] = await query(totalSql);
    const total = totalResult.total;

    return {
        list: users,
        total,
        page,
        pageSize,
        totalPage: Math.ceil(total / pageSize) // 总页数（向上取整）
    };
}

module.exports = {
    findUserByAccount, // 新增：支持双登录查询
    findUserByMail,
    findUserById,
    insertUser,
    findUsersByPage
}