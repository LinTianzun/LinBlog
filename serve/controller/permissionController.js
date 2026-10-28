const userModel = require('../model/dbModel/users/index')
const { writeSystemLog } = require('../utils/logHelper')
const {
    buildMatrixPayload,
    updatePermissionMatrix,
    getPermissionsForUser,
    isSuperAdmin
} = require('../utils/accessControl')

async function getPermissionCatalog(req, res) {
    try {
        const roleCounts = await userModel.countRoleDistribution()
        res.json({
            code: 200,
            message: '查询成功',
            data: buildMatrixPayload(roleCounts)
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: `权限目录查询失败：${err.message}` })
    }
}

async function getMyPermissions(req, res) {
    const permissions = getPermissionsForUser(req.user)
    res.json({
        code: 200,
        message: '查询成功',
        data: {
            permissions,
            isSuperAdmin: isSuperAdmin(req.user),
            canEditPermissions: isSuperAdmin(req.user)
        }
    })
}

async function updateMatrix(req, res) {
    try {
        const changes = req.body?.changes
        const result = await updatePermissionMatrix(changes, req.user.userId)

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'permission',
            targetType: 'permission',
            targetId: null,
            detail: `更新角色权限矩阵（${result.updated} 项）`,
            ip: req.ip || null
        })

        const roleCounts = await userModel.countRoleDistribution()
        res.json({
            code: 200,
            message: '权限矩阵已保存',
            data: buildMatrixPayload(roleCounts)
        })
    } catch (err) {
        res.status(err.status || 500).json({
            code: err.status || 500,
            message: err.status ? err.message : `权限矩阵保存失败：${err.message}`
        })
    }
}

module.exports = {
    getPermissionCatalog,
    getMyPermissions,
    updateMatrix
}
