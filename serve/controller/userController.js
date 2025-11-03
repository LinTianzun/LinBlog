const userModel = require('../model/dbModel/users/index')
const bcrypt = require('bcrypt')

//  判断用户是否已被注册
async function isRegistered(req, res) {
    try {
        const { mail } = req.query
        if (!mail) {
            return res.status(400).json({ code: 400, message: '请提供邮箱' })
        }
        //  调用查询
        const result = await userModel.findUserByMail(mail)
        res.json({
            code: 200,
            data: {
                isRegistered: result.length > 0,
                mail
            }
        })
    } catch (error) {
        res.status(500).json({ code: 500, message: '服务器错误：' + err.message })
    }
}

//  处理注册逻辑
async function register(req, res) {
    try {
        const { name, mail, password, imgurl } = req.body
        //  参数校验
        if (!name || !mail || !password) {
            return res.status(400).json({ code: 400, message: '请提供邮箱' })
        }
        //  检查用户是否已存在
        const userExists = await userModel.findUserByMail(mail)
        if (userExists.length > 0) {
            return res.status(400).json({ code: 400, message: '该用户已被注册' })
        }
        //  密码加密
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        //  调用模型插入用户
        const insertResult = await userModel.insertUser({
            name,
            mail,
            password: hashedPassword,    //  存储加密后的密码
            imgurl
        })

        res.status(201).json({
            code: 200,
            message: '注册成功',
            data: {
                id: insertResult.insertId,
                name,
                mail
            }
        })
    } catch (error) {
        res.status(500).json({ code: 500, message: '服务器错误：' + err.message })
    }
}

//  处理登录逻辑
async function login(req, res) {
    try {
        const { name, password } = req.body
        if (!name || !password) {
            return res.status(400).json({ code: 400, message: '请提供用户名和密码' })
        }
        //  调用模型查询用户
        const result = await userModel.findUserByUsername(name)
        if (result.length === 0) {
            return res.status(400).json({ code: 400, message: '用户未注册' });
        }

        const user = result[0]
        //  验证密码
        const isPasswordValid = await bcrypt.compare(password, user.password)
        if (!isPasswordValid) {
            return res.status(400).json({ code: 400, message: '密码错误' });
        }
        //  剔除密码 返回用户信息
        const { password: _, ...userInfo } = user
        res.json({
            code: 200,
            message: '登录成功',
            data: userInfo
        })
    } catch (error) {
        res.status(500).json({ code: 500, message: '服务器错误：' + err.message })
    }
}

module.exports = {
    isRegistered,
    register,
    login
}