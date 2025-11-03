const { query } = require('../../db/dbnew') // 引入数据库查询方法
const bcrypt = require('bcrypt'); // 用于密码加密（需安装：npm install bcrypt）

//  判断用户是否注册（通过用户名）
async function isRegistered(username) {
    const sql = 'SELECT id FROM users WHERE name = ?'
    const result = await query(sql, [username])
    return result.length > 0    // 存在则返回 true
}

//  注册用户(密码加密储存)
async function register(userInfo) {
    const { name, mail, password, imgurl } = userInfo

    //  检查用户名是否已注册
    const exists = await isRegistered(name)
    if (exists) {
        throw new Error('该用户已被注册');
    }

    //  密码加密 
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // 插入数据库
    const sql = `
    INSERT INTO users (name, mail, password, imgurl) 
    VALUES (?, ?, ?, ?)
    `
    const result = await query(sql, [name, mail, hashedPassword, imgurl || ''])
    return { id: result.insertId, name, mail } // 返回注册成功的用户信息（不含密码）
}

//  用户登录
async function login(username, password) {
    const sql = 'SELECT id, name, mail, password, imgurl FROM users WHERE name = ?';
    // 查询用户信息
    const result = await query(sql, [username]);
    if (result.length === 0) {
        throw new Error('用户未注册');
    }

    const user = result[0];
    // 验证密码（加密后对比）
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        throw new Error('密码错误');
    }

    // 登录成功，返回用户信息（不含密码）
    const { password: _, ...userInfo } = user; // 剔除密码
    return userInfo;
}

module.exports = {
    isRegistered,
    register,
    login
};