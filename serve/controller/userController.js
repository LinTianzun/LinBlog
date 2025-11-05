const userModel = require('../model/dbModel/users/index') // 修正路径：user → users
const bcrypt = require('bcrypt') // 统一为 bcryptjs（与数据库初始化一致）
const config = require('../config/default')
const { generateToken } = require('../utils/jwtutil')

// 判断用户是否已注册（按邮箱校验）
async function isRegistered(req, res) {
    try {
        const { mail } = req.query
        if (!mail) {
            return res.status(400).json({ code: 400, message: '请提供邮箱' })
        }
        const result = await userModel.findUserByMail(mail)
        res.json({
            code: 200,
            data: {
                isRegistered: result.length > 0,
                mail
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '服务器错误：' + err.message })
    }
}

// 注册逻辑（字段统一为 username，补充完整校验）
async function register(req, res) {
    try {
        const { username, mail, password, imgurl } = req.body // name → username
        // 完整参数校验
        if (!username || !mail || !password) {
            return res.status(400).json({ code: 400, message: '请提供用户名、邮箱和密码' })
        }
        // 校验邮箱格式（可选优化）
        const mailReg = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/
        if (!mailReg.test(mail)) {
            return res.status(400).json({ code: 400, message: '请输入合法邮箱' })
        }
        // 检查用户是否已存在（按邮箱唯一校验）
        const userExists = await userModel.findUserByMail(mail)
        if (userExists.length > 0) {
            return res.status(400).json({ code: 400, message: '该邮箱已被注册' })
        }
        // 密码加密（与数据库初始化一致，盐值强度10）
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        // 插入用户（显式指定 user_type，兼容表结构）
        const insertResult = await userModel.insertUser({
            username, // name → username
            mail,
            password: hashedPassword,
            imgurl: imgurl || 'https://picsum.photos/id/64/200' // 默认头像
        })

        res.status(201).json({
            code: 200,
            message: '注册成功',
            data: {
                id: insertResult.insertId,
                username, // name → username
                mail
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '服务器错误：' + err.message })
    }
}

// 登录逻辑（支持「用户名/邮箱」双登录，字段统一）
async function login(req, res) {
    try {
        const { account, password } = req.body // 改为 account，支持用户名或邮箱
        if (!account || !password) {
            return res.status(400).json({ code: 400, message: '请提供账号（用户名/邮箱）和密码' })
        }
        // 调用模型：同时按用户名和邮箱查询
        const result = await userModel.findUserByAccount(account)
        if (result.length === 0) {
            return res.status(400).json({ code: 400, message: '用户未注册' });
        }

        const user = result[0]
        // 密码校验（与数据库存储的 bcrypt 哈希匹配）
        const isPasswordValid = await bcrypt.compare(password, user.password)
        if (!isPasswordValid) {
            return res.status(400).json({ code: 400, message: '密码错误' });
        }

        // 生成 Token（沿用原有逻辑）
        const token = generateToken({
            userId: user.id,
            user_Type: user.user_type,
        })

        // 剔除密码，返回完整用户信息（含 user_type 等字段）
        const { password: _, ...userInfo } = user
        res.json({
            code: 200,
            message: '登录成功',
            data: {
                userInfo,
                token,
                expiresIn: config.jwt.expiresIn
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '服务器错误：' + err.message })
    }
}

// 获取用户信息（返回完整字段，兼容表结构）
async function getUserInfo(req, res) {
    try {
        const { userId } = req.user;
        const result = await userModel.findUserById(userId);
        if (result.length === 0) {
            return res.status(404).json({ code: 404, message: '用户不存在' });
        }
        // 剔除密码，返回安全信息
        const { password: _, ...userInfo } = result[0]
        res.json({ code: 200, data: userInfo });
    } catch (err) {
        res.status(500).json({ code: 500, message: err.message });
    }
}

//  分页查询全部用户（仅管理员可访问）
async function getAllUsers(req, res) {
    try {
        //  权限校验
        const { user_type } = req.user
        if (user_type !== 'admin') {
            return res.status(403).json({ code: 403, message: '无权限访问，仅管理员可查询全部用户' })
        }

        //  获取分页参数 
        let { page = 1, pageSize = 3 } = req.query

        //  参数校验
        page = parseInt(page, 10)
        pageSize = parseInt(pageSize, 10)
        if (isNaN(page) || isNaN(pageSize) || page < 1 || pageSize < 1 || pageSize > 50) {
            return res.status(400).json({
                code: 400,
                message: '参数错误：page和pageSize必须是正整数，且pageSize不超过50'
            })
        }

        //  调用分页查询
        const result = await userModel.findUsersByPage(page, pageSize)

        //  返回分页结果
        res.json({
            code: 200,
            message: '分页查询成功',
            data: {
                total: result.total, // 总用户数
                page: result.page, // 当前页码
                pageSize: result.pageSize, // 每页条数
                totalPage: result.totalPage, // 总页数
                list: result.list // 当前页用户列表（无密码）
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '服务器错误：' + err.message })
    }
}

module.exports = {
    getUserInfo,
    isRegistered,
    register,
    login,
    getAllUsers
}