const { query } = require('../../db/dbnew')

//  根据用户名查询用户是否存在
async function findUserByUsername(username) {
    const sql = 'SELECT id, name, mail, password, imgurl FROM users WHERE name = ?'
    // 查询用户信息
    return query(sql, [username])
}

//  根据邮箱查询用户
async function findUserByMail(mail) {
    const sql = 'SELECT * FROM users WHERE mail = ?'
    return query(sql, [mail])
}

//  插入新用户(注册)
async function insertUser(userInfo) {
    const { name, mail, password, imgurl } = userInfo

    // 插入数据库
    const sql = `
    INSERT INTO users (name, mail, password, imgurl) 
    VALUES (?, ?, ?, ?)
    `
    return query(sql, [name, mail, password, imgurl || ''])
}

module.exports = {
    findUserByUsername,
    findUserByMail,
    insertUser
}