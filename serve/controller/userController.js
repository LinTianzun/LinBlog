const userModel = require('../model/dbModel/users/index') // 修正路径：user → users
const bcrypt = require('bcrypt') // 统一为 bcryptjs（与数据库初始化一致）
const config = require('../config/default')
const { generateToken } = require('../utils/jwtutil')
const { formatPaginationParams } = require('../utils/paginationUtil')   // 引入封装的分页工具
const { writeSystemLog } = require('../utils/logHelper')

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
        // 用户名同样有唯一约束，提前给出明确冲突提示而不是 500
        const nameExists = await userModel.findUserByUsername(username)
        if (nameExists.length > 0) {
            return res.status(400).json({ code: 400, message: '该用户名已被注册' })
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

// 管理员创建用户
async function createUser(req, res) {
    try {
        // 1. 权限校验
        if (!req.user || req.user.user_type !== 'admin') {
            return res.status(403).json({
                code: 403,
                message: '无权限操作，仅管理员可以添加用户'
            });
        }

        // 2. 获取表单数据
        const { username, mail, password, imgurl, user_type } = req.body;

        // 3. 必填项校验
        if (
            typeof username !== 'string' ||
            typeof mail !== 'string' ||
            typeof password !== 'string' ||
            typeof user_type !== 'string' ||
            !username.trim() ||
            !mail.trim() ||
            !password
        ) {
            return res.status(400).json({
                code: 400,
                message: '请填写用户名、邮箱、密码和用户角色'
            });
        }

        if (password.length < 6 || password.length > 72) {
            return res.status(400).json({
                code: 400,
                message: '密码长度必须为 6 到 72 个字符'
            });
        }

        const cleanUsername = username.trim();
        const cleanMail = mail.trim();

        if (cleanUsername.length < 2 || cleanUsername.length > 30) {
            return res.status(400).json({
                code: 400,
                message: '用户名长度必须为 2 到 30 个字符'
            });
        }

        // 4. 邮箱格式校验
        const mailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!mailReg.test(cleanMail)) {
            return res.status(400).json({
                code: 400,
                message: '请输入合法邮箱'
            });
        }

        // 5. 角色白名单校验
        const allowedRoles = ['normal', 'editor', 'visitor', 'admin'];

        if (!allowedRoles.includes(user_type)) {
            return res.status(400).json({
                code: 400,
                message: '无效的用户角色'
            });
        }

        // 6. 检查邮箱是否已注册
        const mailExists = await userModel.findUserByMail(cleanMail);

        if (mailExists.length > 0) {
            return res.status(409).json({
                code: 409,
                message: '该邮箱已被注册'
            });
        }

        // 7. 检查用户名是否已存在
        const usernameExists =
            await userModel.findUserByAccount(cleanUsername);

        if (usernameExists.length > 0) {
            return res.status(409).json({
                code: 409,
                message: '该用户名已被使用'
            });
        }

        // 8. 密码加密，与现有注册逻辑保持一致
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 9. 插入数据库
        const insertResult = await userModel.insertUserByAdmin({
            username: cleanUsername,
            mail: cleanMail,
            password: hashedPassword,
            imgurl: imgurl || 'https://picsum.photos/id/64/200',
            user_type
        });

        // 10. 返回创建结果，不返回密码
        writeSystemLog({
            userId: req.user.userId,
            action: 'create',
            module: 'user',
            targetType: 'user',
            targetId: insertResult.insertId,
            detail: `管理员创建用户「${cleanUsername}」（角色：${user_type}）`,
            ip: req.ip || null,
        })

        return res.status(201).json({
            code: 200,
            message: '用户创建成功',
            data: {
                id: insertResult.insertId,
                username: cleanUsername,
                mail: cleanMail,
                user_type
            }
        });
    } catch (err) {
        console.error('管理员创建用户失败：', err);

        return res.status(500).json({
            code: 500,
            message: '创建用户失败，请稍后重试'
        });
    }
}


/**
 * 管理员编辑用户资料
 * 仅更新用户名、邮箱和角色，不修改密码
 */
async function updateUser(req, res) {
    try {
        // 1. 检查管理员权限
        if (!req.user || req.user.user_type !== 'admin') {
            return res.status(403).json({
                code: 403,
                message: '无权限操作，仅管理员可以编辑用户'
            });
        }

        // 2. 获取并校验用户 ID
        const userId = Number(req.params.id);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(400).json({
                code: 400,
                message: '用户 ID 不合法'
            });
        }

        // 3. 获取表单数据
        const { username, mail, user_type } = req.body;

        const cleanUsername =
            typeof username === 'string' ? username.trim() : '';

        const cleanMail =
            typeof mail === 'string' ? mail.trim() : '';

        const allowedRoles = ['normal', 'editor', 'visitor', 'admin'];

        if (!cleanUsername || !cleanMail || !user_type) {
            return res.status(400).json({
                code: 400,
                message: '用户名、邮箱和角色不能为空'
            });
        }

        if (cleanUsername.length > 50) {
            return res.status(400).json({
                code: 400,
                message: '用户名不能超过 50 个字符'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(cleanMail)) {
            return res.status(400).json({
                code: 400,
                message: '邮箱格式不正确'
            });
        }

        if (!allowedRoles.includes(user_type)) {
            return res.status(400).json({
                code: 400,
                message: '用户角色不合法'
            });
        }

        // 4. 检查用户是否存在
        const existingUser = await userModel.findUserById(userId);

        if (!existingUser || existingUser.length === 0) {
            return res.status(404).json({
                code: 404,
                message: '用户不存在'
            });
        }

        const targetUser = existingUser[0];
        const currentUserId = String(req.user.userId);
        const targetUserId = String(userId);

        // 防止管理员通过编辑接口修改自己的角色，造成权限突然丢失。
        if (
            currentUserId === targetUserId &&
            user_type !== targetUser.user_type
        ) {
            return res.status(400).json({
                code: 400,
                message: '不能修改当前登录账号的角色'
            });
        }

        // 5. 检查用户名或邮箱是否被其他用户占用
        const conflicts = await userModel.findUserConflictForUpdate(
            cleanUsername,
            cleanMail,
            userId
        );

        if (conflicts.length > 0) {
            const usernameConflict = conflicts.some(
                user => user.username === cleanUsername
            );

            const mailConflict = conflicts.some(
                user => user.mail === cleanMail
            );

            let message = '用户名或邮箱已被使用';

            if (usernameConflict && mailConflict) {
                message = '用户名和邮箱均已被其他用户使用';
            } else if (usernameConflict) {
                message = '用户名已被其他用户使用';
            } else if (mailConflict) {
                message = '邮箱已被其他用户使用';
            }

            return res.status(409).json({
                code: 409,
                message
            });
        }

        // 6. 更新用户资料
        const updateResult = await userModel.updateUserByAdminGuarded(
            userId,
            {
                username: cleanUsername,
                mail: cleanMail,
                user_type
            },
            req.user.userId
        );

        if (!updateResult.ok) {
            if (updateResult.reason === 'last_admin') {
                return res.status(400).json({
                    code: 400,
                    message: '系统至少需要保留一名管理员，无法修改该用户角色'
                });
            }

            if (updateResult.reason === 'self_role_change') {
                return res.status(400).json({
                    code: 400,
                    message: '不能修改当前登录账号的角色'
                });
            }

            return res.status(404).json({
                code: 404,
                message: '用户不存在'
            });
        }

        // 7. 返回结果
        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'user',
            targetType: 'user',
            targetId: userId,
            detail: `管理员编辑用户「${cleanUsername}」（角色：${user_type}）`,
            ip: req.ip || null,
        })

        return res.status(200).json({
            code: 200,
            message: '用户资料更新成功',
            data: {
                id: userId,
                username: cleanUsername,
                mail: cleanMail,
                user_type
            }
        });
    } catch (error) {
        console.error('编辑用户失败：', error);

        return res.status(500).json({
            code: 500,
            message: '服务器内部错误，编辑用户失败'
        });
    }
}

// 管理员启用/禁用用户
async function updateUserStatus(req, res) {
    try {
        // 1. 仅管理员可以操作
        if (!req.user || req.user.user_type !== 'admin') {
            return res.status(403).json({
                code: 403,
                message: '无权限操作，仅管理员可以修改用户状态'
            });
        }

        const currentUserId = String(req.user.userId);
        const targetUserId = String(req.params.id);
        const status = Number(req.body.status);

        // 禁止修改自己的状态
        if (currentUserId === targetUserId) {
            return res.status(400).json({
                code: 400,
                message: '不能修改当前登录账号的状态'
            });
        }

        // 2. 校验用户 ID
        const userId = Number(req.params.id);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(400).json({
                code: 400,
                message: '用户 ID 不合法'
            });
        }

        // 3. 校验状态，只允许 0 或 1
        // const { status } = req.body;

        if (status !== 0 && status !== 1) {
            return res.status(400).json({
                code: 400,
                message: '用户状态只能是 0 或 1'
            });
        }

        // 4. 防止管理员误禁用自己
        if (String(req.user.userId) === String(userId) && status === 0) {
            return res.status(400).json({
                code: 400,
                message: '不能禁用当前登录的管理员账号'
            });
        }

        // 5. 检查用户是否存在
        const existingUser = await userModel.findUserById(userId);

        if (!existingUser || existingUser.length === 0) {
            return res.status(404).json({
                code: 404,
                message: '用户不存在'
            });
        }

        // 6. 更新数据库
        const updateResult = await userModel.updateUserStatusGuarded(
            userId,
            status,
            req.user.userId
        );

        if (!updateResult.ok) {
            if (updateResult.reason === 'last_admin') {
                return res.status(400).json({
                    code: 400,
                    message: '系统至少需要保留一名管理员，无法禁用'
                });
            }

            if (updateResult.reason === 'self_status_change') {
                return res.status(400).json({
                    code: 400,
                    message: '不能修改当前登录账号的状态'
                });
            }

            return res.status(404).json({
                code: 404,
                message: '用户不存在'
            });
        }

        const targetUser = existingUser[0]

        writeSystemLog({
            userId: req.user.userId,
            action: 'status',
            module: 'user',
            targetType: 'user',
            targetId: userId,
            detail: `管理员${status === 1 ? '启用' : '禁用'}用户「${targetUser?.username || userId}」`,
            ip: req.ip || null,
        })

        return res.json({
            code: 200,
            message: status === 1 ? '用户已启用' : '用户已禁用',
            data: { id: userId, status }
        });
    } catch (error) {
        console.error('修改用户状态失败：', error);

        return res.status(500).json({
            code: 500,
            message: '服务器内部错误，修改用户状态失败'
        });
    }
}

// 管理员删除用户
async function deleteUser(req, res) {
    try {
        // 1. 仅管理员可以删除用户
        if (!req.user || req.user.user_type !== 'admin') {
            return res.status(403).json({
                code: 403,
                message: '无权限操作，仅管理员可以删除用户'
            });
        }

        // 2. 校验用户 ID
        const userId = Number(req.params.id);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(400).json({
                code: 400,
                message: '用户 ID 不合法'
            });
        }

        // 3. 禁止删除当前登录账号
        if (Number(req.user.userId) === userId) {
            return res.status(400).json({
                code: 400,
                message: '不能删除当前登录的管理员账号'
            });
        }

        // 4. 检查用户是否存在
        const existingUser = await userModel.findUserById(userId);

        if (!existingUser || existingUser.length === 0) {
            return res.status(404).json({
                code: 404,
                message: '用户不存在或已被删除'
            });
        }

        // 6. 执行删除
        const deleteResult = await userModel.deleteUserByAdminGuarded(
            userId,
            req.user.userId
        );

        if (!deleteResult.ok && deleteResult.reason === 'last_admin') {
            return res.status(400).json({
                code: 400,
                message: '系统至少需要保留一名管理员，无法删除'
            });
        }

        if (!deleteResult.ok && deleteResult.reason === 'self_delete') {
            return res.status(400).json({
                code: 400,
                message: '不能删除当前登录的管理员账号'
            });
        }

        if (!deleteResult.ok) {
            return res.status(404).json({
                code: 404,
                message: '用户不存在或删除失败'
            });
        }

        writeSystemLog({
            userId: req.user.userId,
            action: 'delete',
            module: 'user',
            targetType: 'user',
            targetId: userId,
            detail: `管理员删除用户「${existingUser[0]?.username || userId}」`,
            ip: req.ip || null,
        })

        return res.status(200).json({
            code: 200,
            message: '用户删除成功',
            data: { id: userId }
        });
    } catch (error) {
        console.error('删除用户失败：', error);

        // 用户存在文章等关联数据时，数据库外键可能阻止删除
        if (
            error.code === 'ER_ROW_IS_REFERENCED_2' ||
            error.code === 'ER_ROW_IS_REFERENCED'
        ) {
            return res.status(409).json({
                code: 409,
                message: '该用户存在关联数据，暂时无法删除'
            });
        }

        return res.status(500).json({
            code: 500,
            message: '服务器内部错误，删除用户失败'
        });
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

        // 检查账号是否已禁用
        if (Number(user.status) !== 1) {
            return res.status(403).json({
                code: 403,
                message: '该账号已被禁用，请联系管理员'
            });
        }

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

        writeSystemLog({
            userId: user.id,
            action: 'login',
            module: 'user',
            targetType: 'user',
            targetId: user.id,
            detail: `用户「${user.username}」登录成功`,
            ip: req.ip || null,
        })

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

        //  调用分页工具校验参数（自定义默认每页5条，最大20条）
        const paginationResult = formatPaginationParams(req.query, {
            defaultPageSize: 5, // 用户接口默认每页5条（符合需求）
            maxPageSize: 20      // 用户接口最多允许20条/页
        });

        //  参数校验失败，直接返回错误
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg });
        }

        // 必须从分页工具结果中取出这三个变量
        const { page, pageSize, offset } = paginationResult.data;

        const keyword =
            typeof req.query.keyword === 'string'
                ? req.query.keyword.trim()
                : '';

        // 状态筛选（卡片点击）：仅接受 0/1，其余值视为不过滤
        const rawStatus = Number(req.query.status)
        const statusFilter = rawStatus === 0 || rawStatus === 1 ? rawStatus : null

        // 角色组筛选（卡片点击）：admin=仅管理员，staff=编辑+普通用户+游客
        const roleRaw = typeof req.query.role === 'string' ? req.query.role : ''
        const roleFilter = ['admin', 'staff'].includes(roleRaw) ? roleRaw : null

        const result = await userModel.findUsersByPage(
            page,
            pageSize,
            offset,
            keyword,
            statusFilter,
            roleFilter
        );

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                total: result.total,       // 当前搜索结果总数
                allTotal: result.allTotal, // 全部用户总数
                roleCounts: result.roleCounts,
                bannedTotal: result.bannedTotal, // 封禁用户总数
                activeRoleCounts: result.activeRoleCounts, // 各角色启用数（排除封禁）
                page: result.page,  // 当前页码
                pageSize: result.pageSize,  // 每页条数
                totalPage: result.totalPage,// 总页数
                list: result.list // 当前页用户列表（无密码）
            }
        });


    } catch (err) {
        res.status(500).json({ code: 500, message: '服务器错误：' + err.message })
    }
}

module.exports = {
    getUserInfo,
    isRegistered,
    register,
    createUser,
    updateUser,
    updateUserStatus,
    login,
    getAllUsers,
    deleteUser
}
