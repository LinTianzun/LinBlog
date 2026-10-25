const { query, withTransaction } = require('../../db/dbnew')

function executeOnConnection(connection, sql, values = []) {
    return new Promise((resolve, reject) => {
        connection.query(sql, values, (err, result) => {
            if (err) reject(err)
            else resolve(result)
        })
    })
}

function countActiveAdmins(admins) {
    return admins.filter((admin) => Number(admin.status) === 1).length
}

async function lockAdminAccounts(exec) {
    return exec(`
        SELECT id, user_type, status
        FROM users
        WHERE user_type = ?
        ORDER BY id
        FOR UPDATE
    `, ['admin'])
}

async function lockUserById(exec, userId) {
    return exec(`
        SELECT id, user_type, status
        FROM users
        WHERE id = ?
        FOR UPDATE
    `, [userId])
}

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

// 编辑用户时检查用户名或邮箱是否被其他用户占用
async function findUserConflictForUpdate(username, mail, userId) {
    const sql = `
        SELECT id, username, mail
        FROM users
        WHERE (username = ? OR mail = ?)
          AND id <> ?
        LIMIT 2
    `;

    return query(sql, [username, mail, userId]);
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

// 管理员更新用户资料
async function updateUserByAdmin(userId, userInfo, exec = query) {
    const { username, mail, user_type } = userInfo;

    const sql = `
        UPDATE users
        SET username = ?, mail = ?, user_type = ?
        WHERE id = ?
    `;

    return exec(sql, [username, mail, user_type, userId]);
}

// 管理员修改用户启用/禁用状态
async function updateUserStatus(userId, status, exec = query) {
    const sql = `
        UPDATE users
        SET status = ?
        WHERE id = ?
    `;

    return exec(sql, [status, userId]);
}

// 分页查询用户，支持关键词搜索和全局角色统计
async function findUsersByPage(page, pageSize, offset, keyword = '', statusFilter = null) {
    const searchKeyword = keyword.trim();

    // 状态筛选（仅接受 0/1）：与关键词搜索可叠加
    let statusSql = '';
    const statusParams = [];
    if (statusFilter === 0 || statusFilter === 1) {
        statusSql = 'status = ?';
        statusParams.push(statusFilter);
    }

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

    // 组合 WHERE：状态 + 关键词（若同时存在）
    let combinedWhere = '';
    const combinedParams = [];
    if (statusSql && whereSql) {
        combinedWhere = `WHERE ${statusSql} AND (${whereSql.slice(6)})`;
        combinedParams.push(...statusParams, ...searchParams);
    } else if (statusSql) {
        combinedWhere = `WHERE ${statusSql}`;
        combinedParams.push(...statusParams);
    } else {
        combinedWhere = whereSql;
        combinedParams.push(...searchParams);
    }

    // 1. 查询当前页用户（不返回密码）
    const userSql = `
        SELECT id, username, mail, imgurl, user_type,
               status, created_at, last_login_at
        FROM users
        ${combinedWhere}
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
    `;

    const users = await query(userSql, [
        ...combinedParams,
        pageSize,
        offset
    ]);

    // 2. 统计符合当前搜索条件的用户总数
    const totalSql = `
        SELECT COUNT(*) AS total
        FROM users
        ${combinedWhere}
    `;

    const [totalResult] = await query(totalSql, combinedParams);
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

    // 封禁（禁用）用户数与各角色启用数，供卡片展示和「非封禁口径」统计
    const [bannedResult] = await query(
        'SELECT COUNT(*) AS total FROM users WHERE status = 0'
    );
    const bannedTotal = Number(bannedResult.total);

    const activeRoleRows = await query(
        'SELECT user_type, COUNT(*) AS count FROM users WHERE status = 1 GROUP BY user_type'
    );
    const activeRoleCounts = {};
    for (const row of activeRoleRows) {
        activeRoleCounts[row.user_type] = Number(row.count);
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
        bannedTotal,
        activeRoleCounts,
        page,
        pageSize,
        totalPage: Math.ceil(total / pageSize)
    }
}

// 统计管理员数量
async function countAdminUsers() {
    const [result] = await query(
        "SELECT COUNT(*) AS total FROM users WHERE user_type = ?",
        ['admin']
    );

    return Number(result.total);
}

// 根据用户 ID 删除用户
async function deleteUserByAdmin(userId, exec = query) {
    return exec(
        'DELETE FROM users WHERE id = ?',
        [userId]
    );
}

async function updateUserByAdminGuarded(userId, userInfo, currentUserId) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => executeOnConnection(connection, sql, values)
        const admins = await lockAdminAccounts(exec)
        const targetRows = await lockUserById(exec, userId)

        if (targetRows.length === 0) {
            return { ok: false, reason: 'not_found' }
        }

        const target = targetRows[0]

        if (
            String(userId) === String(currentUserId) &&
            userInfo.user_type !== target.user_type
        ) {
            return { ok: false, reason: 'self_role_change' }
        }

        const removesActiveAdmin =
            target.user_type === 'admin' &&
            Number(target.status) === 1 &&
            userInfo.user_type !== 'admin'

        if (removesActiveAdmin && countActiveAdmins(admins) <= 1) {
            return { ok: false, reason: 'last_admin' }
        }

        await updateUserByAdmin(userId, userInfo, exec)
        return { ok: true }
    })
}

async function updateUserStatusGuarded(userId, status, currentUserId) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => executeOnConnection(connection, sql, values)
        const admins = await lockAdminAccounts(exec)
        const targetRows = await lockUserById(exec, userId)

        if (targetRows.length === 0) {
            return { ok: false, reason: 'not_found' }
        }

        if (String(userId) === String(currentUserId)) {
            return { ok: false, reason: 'self_status_change' }
        }

        const target = targetRows[0]
        const disablesLastActiveAdmin =
            status === 0 &&
            target.user_type === 'admin' &&
            Number(target.status) === 1 &&
            countActiveAdmins(admins) <= 1

        if (disablesLastActiveAdmin) {
            return { ok: false, reason: 'last_admin' }
        }

        await updateUserStatus(userId, status, exec)
        return { ok: true }
    })
}

async function deleteUserByAdminGuarded(userId, currentUserId) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => executeOnConnection(connection, sql, values)
        const admins = await lockAdminAccounts(exec)
        const targetRows = await lockUserById(exec, userId)

        if (targetRows.length === 0) {
            return { ok: false, reason: 'not_found' }
        }

        if (String(userId) === String(currentUserId)) {
            return { ok: false, reason: 'self_delete' }
        }

        const target = targetRows[0]
        const deletesLastActiveAdmin =
            target.user_type === 'admin' &&
            Number(target.status) === 1 &&
            countActiveAdmins(admins) <= 1

        if (deletesLastActiveAdmin) {
            return { ok: false, reason: 'last_admin' }
        }

        const result = await deleteUserByAdmin(userId, exec)
        return result.affectedRows === 1
            ? { ok: true }
            : { ok: false, reason: 'not_found' }
    })
}

module.exports = {
    findUserByAccount, // 新增：支持双登录查询
    findUserByMail,
    findUserConflictForUpdate,
    findUserById,
    insertUser,
    insertUserByAdmin,
    updateUserByAdmin,
    updateUserStatus,
    updateUserByAdminGuarded,
    updateUserStatusGuarded,
    findUsersByPage,
    countAdminUsers,
    deleteUserByAdmin,
    deleteUserByAdminGuarded
}
