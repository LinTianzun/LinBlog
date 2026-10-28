const permissionController = require('../controller/permissionController')
const { authMiddleware } = require('../middleware/auth')
const {
    requirePermission,
    requireSuperAdmin
} = require('../utils/accessControl')

module.exports = (app) => {
    app.get(
        '/api/permission/catalog',
        authMiddleware,
        requirePermission('permission.view'),
        permissionController.getPermissionCatalog
    )

    app.get(
        '/api/permission/me',
        authMiddleware,
        permissionController.getMyPermissions
    )

    app.put(
        '/api/permission/matrix',
        authMiddleware,
        requireSuperAdmin,
        permissionController.updateMatrix
    )
}
