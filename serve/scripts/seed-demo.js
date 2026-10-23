const { loadEnvFile } = require('node:process')
const path = require('node:path')

loadEnvFile(path.join(__dirname, '..', '.env'))

const db = require('../model/db/dbnew')

async function main() {
    try {
        await db.initDatabase()
        const result = await db.seedDemoData()

        if (result.seeded) {
            console.log('[Seed] 演示数据插入完成')
        } else {
            console.log('[Seed] users 表已有数据，未重复插入')
        }
    } catch (err) {
        console.error('[Seed] 演示数据插入失败：', err)
        process.exitCode = 1
    } finally {
        try {
            await db.closeDatabase()
        } catch (err) {
            console.error('[Seed] 关闭数据库连接失败：', err)
            process.exitCode = 1
        }
    }
}

main()
