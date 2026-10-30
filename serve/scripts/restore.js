const { loadEnvFile } = require('node:process')
const path = require('node:path')
const readline = require('node:readline/promises')

loadEnvFile(path.join(__dirname, '..', '.env'))

const dbBackup = require('../utils/dbBackup')
const config = require('../config/default')

function parseArgs(argv) {
    const args = { filename: '', targetDatabase: '', drill: false, force: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--file' || arg === '-f') args.filename = argv[++i] || ''
        else if (arg === '--target' || arg === '-t') args.targetDatabase = argv[++i] || ''
        else if (arg === '--drill') args.drill = true
        else if (arg === '--force') args.force = true
        else if (arg === '--help' || arg === '-h') args.help = true
        else if (!args.filename && !arg.startsWith('-')) args.filename = arg
    }
    return args
}

function printHelp() {
    console.log(`
数据库恢复脚本

用法：
  node scripts/restore.js <备份文件名> [--drill] [--target <库名>] [--force]

参数：
  <备份文件名>         serve/storage/db-backups 下的 .linbak.gz 文件
  --drill             恢复演练：默认还原到 <原库名>_drill_<随机后缀> 并保留该库
  --target <库名>     指定恢复目标库（默认当前 LINBLOG_DB_NAME）
  --force             跳过交互确认（生产恢复务必先做一次演练）

示例：
  node scripts/restore.js linlog-20261030-030000.linbak.gz --drill
  node scripts/restore.js linlog-20261030-030000.linbak.gz --target linlog_verify --force
  node scripts/restore.js linlog-20261030-030000.linbak.gz --force

注意：不带 --drill/--target 时会覆盖当前数据库，请先确认已停止写入或已备份。
`)
}

async function confirm(message) {
    if (!process.stdin.isTTY) {
        throw new Error('非交互环境必须显式传入 --force')
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    try {
        const answer = await rl.question(`${message}\n输入 yes 继续：`)
        return answer.trim().toLowerCase() === 'yes'
    } finally {
        rl.close()
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help || !args.filename) {
        printHelp()
        return
    }

    const filename = dbBackup.assertSafeBackupName(args.filename)
    const drillSuffix = require('node:crypto').randomBytes(3).toString('hex')
    const targetDatabase = args.targetDatabase
        || (args.drill ? `${config.database.DB}_drill_${drillSuffix}` : config.database.DB)

    console.log(`[Restore] 备份文件：${filename}`)
    console.log(`[Restore] 目标库：${targetDatabase}`)
    console.log(`[Restore] 模式：${args.drill ? '恢复演练（保留目标库供核对）' : '实际恢复（覆盖目标库）'}`)

    // 真正覆盖当前业务库时，必须显式确认，避免误把演练库当成生产库
    if (!args.drill && !args.targetDatabase && targetDatabase === config.database.DB) {
        console.log('[Restore] 警告：目标库就是当前业务库，现有数据会被覆盖。')
    }

    if (!args.force) {
        const ok = await confirm('目标库现有表将被删除并重建，是否继续？')
        if (!ok) {
            console.log('[Restore] 已取消')
            return
        }
    }

    try {
        const result = await dbBackup.restoreDatabaseBackup({
            filename,
            targetDatabase,
            // 演练/指定库都要清空目标库，避免旧表残留干扰验证
            dropExistingTables: true,
        })

        // 演练模式不连业务库，历史记录只在 Web 服务/备份脚本里写，
        // 避免恢复操作反过来污染生产库结构。
        if (!args.drill) {
            const backupModel = require('../model/dbModel/backup/index')
            const db = require('../model/db/dbnew')
            await db.initDatabase()
            await backupModel.insertLog({
                kind: 'backup',
                filename,
                targetDatabase,
                tableCount: result.tables,
                rowCount: result.rows,
                durationMs: result.durationMs,
                triggerType: 'manual',
                status: 'success',
            }).catch((err) => console.warn('[Restore] 写入历史失败：', err.message))
            await db.closeDatabase()
        }

        console.log(`[Restore] 完成：${result.tables} 张表 / ${result.rows} 行 / ${result.durationMs}ms`)
        if (args.drill) {
            console.log(`[Restore] 演练库已保留，核对后可手动删除：DROP DATABASE \`${targetDatabase}\`;`)
        }
    } catch (err) {
        console.error('[Restore] 恢复失败：', err)
        process.exitCode = 1
    }
}

main()
