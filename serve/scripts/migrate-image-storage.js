const { loadEnvFile } = require('node:process')
const path = require('node:path')
const { logger } = require('../utils/logger')
const db = require('../model/db/dbnew')
const {
    EXTERNAL_STORAGE_DIR,
    writeExternalFile,
    markImageExternal,
} = require('../utils/imageStorage')

loadEnvFile(path.join(__dirname, '..', '.env'))

const DEFAULT_BATCH_SIZE = 50
const MAX_BATCH_SIZE = 500

function parseArgs(argv) {
    const args = { batchSize: DEFAULT_BATCH_SIZE, dryRun: false }
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        if (arg === '--dry-run') {
            args.dryRun = true
        } else if (arg === '--batch-size') {
            const value = Number.parseInt(argv[i + 1], 10)
            if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
                throw new Error(`--batch-size 必须是 1-${MAX_BATCH_SIZE} 的整数`)
            }
            args.batchSize = value
            i += 1
        } else if (arg !== '--help' && arg !== '-h') {
            throw new Error(`未知参数：${arg}`)
        }
    }
    return args
}

function printUsage() {
    console.log('用法：node scripts/migrate-image-storage.js [--batch-size 50] [--dry-run]')
}

async function migrateImages({ batchSize, dryRun }) {
    await db.initDatabase()
    const [stats] = await db.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(size), 0) AS bytes
         FROM image
         WHERE storage_backend = 'db' AND data IS NOT NULL`
    )
    const total = Number(stats?.total || 0)
    const totalBytes = Number(stats?.bytes || 0)

    if (total === 0) {
        logger.info('[ImageMigrate] 没有需要外置的图片', { dir: EXTERNAL_STORAGE_DIR })
        return { migrated: 0, total: 0, bytes: 0 }
    }

    logger.info('[ImageMigrate] 开始外置图片', {
        total,
        bytes: totalBytes,
        dir: EXTERNAL_STORAGE_DIR,
        dryRun
    })

    let migrated = 0
    let failed = 0
    let lastId = 0

    while (true) {
        const rows = await db.query(
            `SELECT id, filename, checksum, size, data, storage_backend
             FROM image
             WHERE storage_backend = 'db' AND data IS NOT NULL AND id > ?
             ORDER BY id ASC
             LIMIT ?`,
            [lastId, batchSize]
        )
        if (rows.length === 0) break

        for (const image of rows) {
            lastId = Number(image.id)
            if (dryRun) {
                logger.info('[ImageMigrate] 预演', {
                    imageId: image.id,
                    filename: image.filename,
                    bytes: Number(image.size)
                })
                migrated += 1
                continue
            }
            try {
                const key = await writeExternalFile(image)
                const ok = await markImageExternal(image)
                if (ok) {
                    migrated += 1
                    logger.debug('[ImageMigrate] 已外置', {
                        imageId: image.id,
                        key
                    })
                }
            } catch (err) {
                failed += 1
                logger.error('[ImageMigrate] 外置失败', {
                    imageId: image.id,
                    filename: image.filename
                }, err)
            }
        }

        if (rows.length < batchSize) break
    }

    logger.info('[ImageMigrate] 完成', { migrated, failed, total })
    return { migrated, failed, total, bytes: totalBytes }
}

async function main() {
    try {
        const args = parseArgs(process.argv.slice(2))
        if (args.help) {
            printUsage()
            return
        }
        const result = await migrateImages(args)
        if (result.failed > 0) process.exitCode = 1
    } catch (err) {
        logger.error('[ImageMigrate] 迁移中断', null, err)
        process.exitCode = 1
    } finally {
        try {
            await db.closeDatabase()
        } catch (err) {
            logger.error('[ImageMigrate] 关闭数据库连接失败', null, err)
            process.exitCode = 1
        }
    }
}

main()
