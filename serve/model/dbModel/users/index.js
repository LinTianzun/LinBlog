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

// 管理员创建用户：允许指定角色
async function insertUserByAdmin(userInfo) {
    const { username, mail, password, imgurl, user_type } = userInfo;

    const sql = `
        INSERT INTO users (username, mail, password, imgurl, user_type)
        VALUES (?, ?, ?, ?, ?)
    `;

    return query(sql, [
        username,
        mail,
        password,
        imgurl,
        user_type
    ]);
}

// 分页查询用户，支持关键词搜索和全局角色统计
async function findUsersByPage(page, pageSize, offset, keyword = '') {
    const searchKeyword = keyword.trim();

    // 搜索条件：用户 ID、用户名、邮箱、角色
    const whereSql = searchKeyword
        ? `WHERE CAST(id AS CHAR) LIKE ?
            OR username LIKE ?
            OR mail LIKE ?
            OR user_type LIKE ?`
        : '';

    const searchParams = searchKeyword
        ? Array(4).fill(`%${searchKeyword}%`)
        : [];

    // 1. 查询当前页用户（不返回密码）
    const userSql = `
        SELECT id, username, mail, imgurl, user_type,
               status, created_at, last_login_at
        FROM users
        ${whereSql}
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
    `;

    const users = await query(userSql, [
        ...searchParams,
        pageSize,
        offset
    ]);

    // 2. 统计符合当前搜索条件的用户总数
    const totalSql = `
        SELECT COUNT(*) AS total
        FROM users
        ${whereSql}
    `;

    const [totalResult] = await query(totalSql, searchParams);
    const total = Number(totalResult.total);

    // 3. 统计全部用户的角色分布，不受搜索关键词影响
    const roleCountsSql = `
        SELECT user_type, COUNT(*) AS count
        FROM users
        GROUP BY user_type
    `;

    const roleCountRows = await query(roleCountsSql);

    const roleCounts = {};
    for (const row of roleCountRows) {
        roleCounts[row.user_type] = Number(row.count);
    }

    // 4. 查询全部用户总数
    const [allTotalResult] = await query(
        'SELECT COUNT(*) AS total FROM users'
    );

    const allTotal = Number(allTotalResult.total);

    return {
        list: users,
        total,
        allTotal,
        roleCounts,
        page,
        pageSize,
        totalPage: Math.ceil(total / pageSize)
    };
}

// 分页查询用户（含总条数）
// async function findUsersByPage(page, pageSize, offset) {

//     // 1. 查询当前页用户数据（不含密码）
//     const userSql = `
//         SELECT id, username, mail, imgurl, user_type, status, created_at, last_login_at 
//         FROM users 
//         ORDER BY created_at ASC 
//         LIMIT ? OFFSET ?
//     `;
//     const users = await query(userSql, [pageSize, offset]);

//     // 2. 查询总条数（用于计算总页数）
//     const totalSql = 'SELECT COUNT(*) AS total FROM users';
//     const [totalResult] = await query(totalSql);
//     const total = totalResult.total;

//     return {
//         list: users,
//         total,
//         page,
//         pageSize,
//         totalPage: Math.ceil(total / pageSize) // 总页数（向上取整）
//     };
// }

module.exports = {
    findUserByAccount, // 新增：支持双登录查询
    findUserByMail,
    findUserById,
    insertUser,
    insertUserByAdmin,
    findUsersByPage
}