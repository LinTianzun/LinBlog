const { loadEnvFile } = require('node:process')
const path = require('node:path')

loadEnvFile(path.join(__dirname, '..', '.env'))

const db = require('../model/db/dbnew')

async function main() {
    try {
        await db.initDatabase()
        console.log('[Migrate] 数据库结构检查与迁移完成')
    } catch (err) {
        console.error('[Migrate] 数据库迁移失败：', err)
        process.exitCode = 1
    } finally {
        try {
            await db.closeDatabase()
        } catch (err) {
            console.error('[Migrate] 关闭数据库连接失败：', err)
            process.exitCode = 1
        }
    }
}

main()
