const { query, withTransaction } = require('../../db/dbnew')

function executeOnConnection(connection, sql, values = []) {
    return new Promise((resolve, reject) => {
        connection.query(sql, values, (err, result) => {
            if (err) reject(err)
            else resolve(result)
        })
    })
}

async function findAllRolePermissions() {
    return query(`
        SELECT role_key, permission_key, allowed
        FROM role_permission
        ORDER BY role_key, permission_key
    `)
}

async function replaceRolePermissions(changes, updatedBy) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => executeOnConnection(connection, sql, values)

        for (const change of changes) {
            await exec(`
                INSERT INTO role_permission
                    (role_key, permission_key, allowed, updated_by)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    allowed = VALUES(allowed),
                    updated_by = VALUES(updated_by),
                    updated_at = CURRENT_TIMESTAMP
            `, [
                change.roleKey,
                change.permissionKey,
                change.allowed ? 1 : 0,
                updatedBy
            ])
        }

        return { updated: changes.length }
    })
}

module.exports = {
    findAllRolePermissions,
    replaceRolePermissions
}
