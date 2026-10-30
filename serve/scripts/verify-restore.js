const { loadEnvFile } = require('node:process')
const path = require('node:path')
const crypto = require('node:crypto')
const mysql = require('mysql2')

loadEnvFile(path.join(__dirname, '..', '.env'))

const config = require('../config/default')

function connect(database) {
    return mysql.createConnection({
        host: config.database.HOST,
        port: config.database.PORT,
        user: config.database.USER,
        password: config.database.PASSWORD,
        database,
        dateStrings: true,
        supportBigNumbers: true,
    })
}

function query(connection, sql, values = []) {
    return new Promise((resolve, reject) => {
        connection.query(sql, values, (err, rows) => err ? reject(err) : resolve(rows))
    })
}

/**
 * 恢复演练后的完整性核对：
 * 1) 逐表比对源库与恢复库的行数
 * 2) 重算 image.data 的 SHA-256 与记录的 checksum 比对
 * 3) 抽查文章正文与封面 URL 是否一致
 *
 * 用法：node scripts/verify-restore.js <恢复库名>
 */
async function main() {
    const target = process.argv[2]
    if (!target || !/^[A-Za-z0-9_$-]{1,64}$/.test(target)) {
        console.error('用法：node scripts/verify-restore.js <恢复库名>')
        process.exitCode = 1
        return
    }

    const source = connect(config.database.DB)
    const restored = connect(target)

    try {
        const tables = (await query(source, 'SHOW TABLES')).map((row) => Object.values(row)[0])
        let mismatches = 0

        console.log(`[Verify] 源库 ${config.database.DB} -> 恢复库 ${target}`)
        for (const table of tables) {
            // 备份历史在快照之后才写入本次记录，行数天然会差一条，不参与比对
            if (table === 'db_backup_log') {
                console.log(`[Verify] ${table.padEnd(24)} 跳过（备份后新增运维记录）`)
                continue
            }
            const [a] = await query(source, `SELECT COUNT(*) AS c FROM \`${table}\``)
            let b
            try {
                [b] = await query(restored, `SELECT COUNT(*) AS c FROM \`${table}\``)
            } catch {
                console.error(`[Verify] ${table.padEnd(24)} 恢复库缺少该表`)
                mismatches += 1
                continue
            }
            const ok = Number(a.c) === Number(b.c)
            if (!ok) mismatches += 1
            console.log(`[Verify] ${table.padEnd(24)} 源 ${a.c} / 恢复 ${b.c} ${ok ? 'OK' : 'MISMATCH'}`)
        }

        const images = await query(restored, 'SELECT id, checksum, data FROM image ORDER BY id')
        let badImages = 0
        for (const row of images) {
            const actual = crypto.createHash('sha256').update(row.data).digest('hex')
            if (actual !== row.checksum) badImages += 1
        }
        console.log(`[Verify] 图片 BLOB ${images.length} 条，校验失败 ${badImages} 条`)

        const [sourceArticles] = await query(
            source,
            "SELECT COUNT(*) AS c FROM article WHERE state = 'published'"
        )
        const [restoredArticles] = await query(
            restored,
            "SELECT COUNT(*) AS c FROM article WHERE state = 'published'"
        )
        const articleOk = Number(sourceArticles.c) === Number(restoredArticles.c)
        console.log(`[Verify] 已发布文章 源 ${sourceArticles.c} / 恢复 ${restoredArticles.c} ${articleOk ? 'OK' : 'MISMATCH'}`)

        const failures = mismatches + badImages + (articleOk ? 0 : 1)
        if (failures > 0) {
            console.error(`[Verify] 核对失败，共 ${failures} 处不一致`)
            process.exitCode = 1
        } else {
            console.log('[Verify] 全部核对通过')
        }
    } finally {
        source.end()
        restored.end()
    }
}

main().catch((err) => {
    console.error('[Verify] 核对异常：', err)
    process.exitCode = 1
})
