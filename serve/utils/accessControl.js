const {
    SUPER_ADMIN_EMAIL,
    ROLES,
    EDITABLE_ROLE_KEYS,
    PERMISSION_GROUPS,
    PERMISSIONS,
    ALL_PERMISSION_KEYS,
    DEFAULT_ROLE_PERMISSIONS,
    PROTECTED_PERMISSION_KEYS
} = require('../config/accessControl')
const permissionModel = require('../model/dbModel/permission/index')

let permissionCache = null
let refreshPromise = null

function getDefaultPermissionMap() {
    const result = new Map()
    for (const roleKey of EDITABLE_ROLE_KEYS) {
        result.set(roleKey, new Set(DEFAULT_ROLE_PERMISSIONS[roleKey] || []))
    }
    return result
}

function isSuperAdmin(user) {
    return Boolean(
        user &&
        (
            user.isSuperAdmin === true ||
            user.is_super_admin === true ||
            Number(user.is_super_admin) === 1
        )
    )
}

function getPermissionsForUser(user) {
    if (!user) return []
    if (isSuperAdmin(user)) return [...ALL_PERMISSION_KEYS]

    // 兼容两类字段命名：中间件写 userType，模型层行数据写 user_type
    const roleKey = user.userType || user.user_type || 'visitor'
    if (!EDITABLE_ROLE_KEYS.includes(roleKey)) return []

    const map = permissionCache || getDefaultPermissionMap()
    return [...(map.get(roleKey) || new Set())]
}

function hasPermission(user, permissionKey) {
    if (isSuperAdmin(user)) return true
    if (!user || !permissionKey) return false
    const permissions = Array.isArray(user.permissions)
        ? user.permissions
        : getPermissionsForUser(user)
    return permissions.includes(permissionKey)
}

function requirePermission(permissionKey) {
    return (req, res, next) => {
        if (hasPermission(req.user, permissionKey)) return next()

        return res.status(403).json({
            code: 403,
            message: '当前账号没有执行此操作的权限'
        })
    }
}

function requireSuperAdmin(req, res, next) {
    if (isSuperAdmin(req.user)) return next()

    return res.status(403).json({
        code: 403,
        message: '该操作仅限超级管理员'
    })
}

async function refreshPermissionCache() {
    if (refreshPromise) return refreshPromise

    refreshPromise = (async () => {
        const map = getDefaultPermissionMap()

        try {
            const rows = await permissionModel.findAllRolePermissions()
            for (const row of rows) {
                const roleKey = String(row.role_key || '')
                const permissionKey = String(row.permission_key || '')
                if (!EDITABLE_ROLE_KEYS.includes(roleKey)) continue
                if (!ALL_PERMISSION_KEYS.includes(permissionKey)) continue

                if (!map.has(roleKey)) map.set(roleKey, new Set())
                if (Number(row.allowed) === 1) {
                    map.get(roleKey).add(permissionKey)
                } else {
                    map.get(roleKey).delete(permissionKey)
                }
            }
            permissionCache = map
            return map
        } catch (err) {
            console.warn('[Permission] 读取角色权限失败，使用默认权限矩阵：', err.message)
            if (!permissionCache) permissionCache = map
            return permissionCache
        } finally {
            refreshPromise = null
        }
    })()

    return refreshPromise
}

function getRolePermissionMap() {
    return permissionCache || getDefaultPermissionMap()
}

function buildMatrixPayload(roleCounts = {}) {
    const map = getRolePermissionMap()
    const roles = ROLES.map(role => {
        const permissions = role.key === 'super_admin'
            ? [...ALL_PERMISSION_KEYS]
            : [...(map.get(role.key) || new Set())]

        return {
            ...role,
            permissions,
            memberCount: Number(roleCounts[role.key] || (role.key === 'super_admin' ? 0 : 0))
        }
    })

    return {
        roles,
        groups: PERMISSION_GROUPS.map(group => ({
            ...group,
            permissions: PERMISSIONS.filter(permission => permission.group === group.key)
        })),
        editableRoles: EDITABLE_ROLE_KEYS
    }
}

function normalizeChanges(changes) {
    if (!Array.isArray(changes) || changes.length === 0) {
        return { error: '请提交至少一项权限变更' }
    }

    const normalized = []
    const seen = new Set()

    for (const item of changes) {
        const roleKey = typeof item?.roleKey === 'string' ? item.roleKey : ''
        const permissionKey = typeof item?.permissionKey === 'string' ? item.permissionKey : ''

        if (!EDITABLE_ROLE_KEYS.includes(roleKey)) {
            return { error: `无效的角色：${roleKey || '空'}` }
        }
        if (!ALL_PERMISSION_KEYS.includes(permissionKey)) {
            return { error: `无效的权限：${permissionKey || '空'}` }
        }
        if (PROTECTED_PERMISSION_KEYS.has(permissionKey)) {
            return { error: '该权限由超级管理员固定持有，不能修改' }
        }

        const uniqueKey = `${roleKey}:${permissionKey}`
        if (seen.has(uniqueKey)) continue
        seen.add(uniqueKey)
        normalized.push({
            roleKey,
            permissionKey,
            allowed: Boolean(item.allowed)
        })
    }

    return { data: normalized }
}

const ROLE_LABELS = new Map(ROLES.map(role => [role.key, role.label]))
const PERMISSION_LABELS = new Map(PERMISSIONS.map(permission => [permission.key, permission.label]))

/**
 * 把权限变更矩阵折叠成一条可审计的日志描述。
 * system_log.detail 是 VARCHAR(500)，超出部分用「等 N 项」收尾。
 */
function describePermissionChanges(changes = []) {
    const items = changes.map(change => {
        const roleLabel = ROLE_LABELS.get(change.roleKey) || change.roleKey
        const permissionLabel = PERMISSION_LABELS.get(change.permissionKey) || change.permissionKey
        return `${roleLabel} ${change.allowed ? '授予' : '收回'}「${permissionLabel}」`
    })

    const selected = []
    let length = '角色权限变更：'.length
    for (const item of items) {
        // 预留「 等 N 项」的长度，保证整条描述不超过 500 字符
        if (length + item.length + 6 > 480) break
        selected.push(item)
        length += item.length + 1
    }

    const rest = items.length > selected.length ? ` 等 ${items.length} 项` : ''
    return `角色权限变更：${selected.join('、')}${rest}`
}

async function updatePermissionMatrix(changes, updatedBy) {
    const normalized = normalizeChanges(changes)
    if (normalized.error) {
        const err = new Error(normalized.error)
        err.status = 400
        throw err
    }

    await permissionModel.replaceRolePermissions(normalized.data, updatedBy)
    await refreshPermissionCache()
    return { updated: normalized.data.length, changes: normalized.data }
}

function getEffectiveUserType(user, { allPermission, ownPermission }) {
    if (isSuperAdmin(user)) return 'admin'
    if (hasPermission(user, allPermission)) return 'admin'
    if (hasPermission(user, ownPermission)) return 'normal'
    return 'visitor'
}

function getArticleAccessType(user, classify = 'article') {
    const prefix = classify === 'image' ? 'gallery' : 'article'
    return getEffectiveUserType(user, {
        allPermission: `${prefix}.manageAll`,
        ownPermission: `${prefix}.manageOwn`
    })
}

function getArticleViewType(user, classify = 'article') {
    const prefix = classify === 'image' ? 'gallery' : 'article'
    if (isSuperAdmin(user)) return 'admin'
    if (hasPermission(user, `${prefix}.viewAll`) || hasPermission(user, `${prefix}.manageAll`)) {
        return 'admin'
    }
    if (hasPermission(user, `${prefix}.create`) || hasPermission(user, `${prefix}.manageOwn`)) {
        return 'normal'
    }
    return 'visitor'
}

function getArticleScope(user, classify = 'article') {
    const prefix = classify === 'image' ? 'gallery' : 'article'
    const superAdmin = isSuperAdmin(user)

    return {
        viewAll: superAdmin || hasPermission(user, `${prefix}.viewAll`) || hasPermission(user, `${prefix}.manageAll`),
        viewOwn: superAdmin || hasPermission(user, `${prefix}.create`) || hasPermission(user, `${prefix}.manageOwn`),
        manageAll: superAdmin || hasPermission(user, `${prefix}.manageAll`),
        manageOwn: superAdmin || hasPermission(user, `${prefix}.manageOwn`),
        publish: superAdmin || hasPermission(user, `${prefix}.publish`)
    }
}

function getDiaryAccessType(user) {
    return getEffectiveUserType(user, {
        allPermission: 'diary.manageAll',
        ownPermission: 'diary.manageOwn'
    })
}

function getDiaryViewType(user) {
    if (isSuperAdmin(user)) return 'admin'
    if (hasPermission(user, 'diary.viewAll') || hasPermission(user, 'diary.manageAll')) return 'admin'
    if (hasPermission(user, 'diary.create') || hasPermission(user, 'diary.manageOwn')) return 'normal'
    return 'visitor'
}

function getDiaryScope(user) {
    const superAdmin = isSuperAdmin(user)

    return {
        viewAll: superAdmin || hasPermission(user, 'diary.viewAll') || hasPermission(user, 'diary.manageAll'),
        viewOwn: superAdmin || hasPermission(user, 'diary.create') || hasPermission(user, 'diary.manageOwn'),
        manageAll: superAdmin || hasPermission(user, 'diary.manageAll'),
        manageOwn: superAdmin || hasPermission(user, 'diary.manageOwn')
    }
}

function getCommentViewType(user) {
    if (isSuperAdmin(user) || hasPermission(user, 'comment.moderate')) return 'admin'
    return user?.userId ? 'normal' : 'visitor'
}

module.exports = {
    SUPER_ADMIN_EMAIL,
    isSuperAdmin,
    getPermissionsForUser,
    hasPermission,
    requirePermission,
    requireSuperAdmin,
    refreshPermissionCache,
    getRolePermissionMap,
    buildMatrixPayload,
    describePermissionChanges,
    updatePermissionMatrix,
    getEffectiveUserType,
    getArticleAccessType,
    getArticleViewType,
    getArticleScope,
    getDiaryAccessType,
    getDiaryViewType,
    getDiaryScope,
    getCommentViewType
}
