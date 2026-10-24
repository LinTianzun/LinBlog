const { loadEnvFile } = require('node:process')
const path = require('node:path')

loadEnvFile(path.join(__dirname, '..', '.env'))

const db = require('../model/db/dbnew')

// 用 picsum 的稳定 ID 生成封面
const cover = (id) => `https://picsum.photos/id/${id}/800`

async function main() {
    try {
        await db.initDatabase()
        const result = await db.seedRichDemoData()
        console.log('[Seed] 完成：', JSON.stringify(result))
    } catch (err) {
        console.error('[Seed] 补充数据失败：', err)
        process.exitCode = 1
    } finally {
        try {
            await db.closeDatabase()
        } catch (err) {
            console.error('[Seed] 关闭数据库连接失败：', err)
        }
    }
}

main()
