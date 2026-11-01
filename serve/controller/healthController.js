const db = require('../model/db/dbnew')
const config = require('../config/default')
const { authMiddleware } = require('../middleware/auth')
const { hasPermission } = require('../utils/accessControl')

// 缓存 DB ping 结果，避免高频健康探测打满连接池
let lastPing = { ok: true, at: 0 }
const PING_CACHE_MS = 5000

async function pingDatabase() {
    const now = Date.now()
    if (now - lastPing.at < PING_CACHE_MS) return lastPing.ok

    try {
        await db.query('SELECT 1')
        lastPing = { ok: true, at: now }
        return true
    } catch (err) {
        lastPing = { ok: false, at: now }
        console.error('[Health] 数据库连通性检查失败：', err.message)
        return false
    }
}

// 存活检查：容器进程存活即返回 ok，不检查 DB（避免 DB 抖动导致容器被反复重启）
async function liveness(_req, res) {
    return res.status(200).json({ status: 'ok' })
}

// 就绪检查：DB 连通 + 配置已加载，ready to serve traffic
async function readiness(_req, res) {
    const dbOk = await pingDatabase()
    if (!dbOk) {
        return res.status(503).json({ status: 'not_ready', checks: { database: 'fail' } })
    }
    return res.status(200).json({ status: 'ready', checks: { database: 'ok' } })
}

// 运行时信息：内存、运行时间、连接池状态，仅管理员可见
async function runtimeInfo(req, res) {
    if (!hasPermission(req.user, 'systemLog.view')) {
        return res.status(403).json({ code: 403, message: '当前账号没有查看运行时信息的权限' })
    }

    const mem = process.memoryUsage()
    const uptimeSeconds = Math.round(process.uptime())

    // 连接池状态：mysql2 暴露 _allConnections / _freeConnections / _connectionQueue
    const pool = db.getPool && db.getPool()
    let poolStatus = null
    if (pool) {
        poolStatus = {
            total: pool._allConnections ? pool._allConnections.length : null,
            free: pool._freeConnections ? pool._freeConnections.length : null,
            queued: pool._connectionQueue ? pool._connectionQueue.length : null,
        }
    }

    return res.status(200).json({
        code: 200,
        message: '查询成功',
        data: {
            uptime: uptimeSeconds,
            memory: {
                rss: mem.rss,
                heapUsed: mem.heapUsed,
                heapTotal: mem.heapTotal,
                external: mem.external,
            },
            pool: poolStatus,
            config: {
                connectionLimit: config.database.connectionLimit,
                port: config.port,
                nodeVersion: process.version,
            },
        },
    })
}

function resetPingCache() {
    lastPing = { ok: true, at: 0 }
}

module.exports = { liveness, readiness, runtimeInfo, resetPingCache }
