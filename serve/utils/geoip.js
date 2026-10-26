const { isPublicIp } = require('./ua')

/**
 * IP 地理位置解析。
 *
 * 默认关闭：不配置 LINBLOG_GEOIP_URL 时直接返回 null，保持现有行为（position 为 NULL）。
 * 开启后按 IP 查询外部服务，结果做内存缓存，失败一律降级为 null——
 * 访问记录是旁路数据，地理解析失败不能影响请求本身。
 *
 * 支持的响应字段：country/region_name/city 或 country/region/city，
 * 取非空字段拼接成「国家 地区 城市」，超长截断。
 */
const CACHE_LIMIT = 5000
const MAX_LENGTH = 100
const cache = new Map()

function readConfig() {
    const url = process.env.LINBLOG_GEOIP_URL
    if (typeof url !== 'string' || url.trim() === '') return null

    const timeoutMs = Number.parseInt(process.env.LINBLOG_GEOIP_TIMEOUT_MS || '1500', 10)
    return {
        url: url.trim(),
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 1500,
    }
}

function formatLocation(payload) {
    if (!payload || typeof payload !== 'object') return null

    const parts = [
        payload.country,
        payload.region_name || payload.region || payload.province,
        payload.city,
    ]
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item && !['-', 'None', 'XX'].includes(item))

    // 相邻重复（部分服务把 country 与 region 返回成同一个值）去重
    const deduped = parts.filter((item, index) => item !== parts[index - 1])
    if (deduped.length === 0) return null

    return deduped.join(' ').slice(0, MAX_LENGTH)
}

function remember(ip, value) {
    // 简单 FIFO：超过上限先淘汰最早的一批，避免缓存无限增长
    if (cache.size >= CACHE_LIMIT) {
        const dropCount = Math.ceil(CACHE_LIMIT * 0.1)
        let dropped = 0
        for (const key of cache.keys()) {
            cache.delete(key)
            if (++dropped >= dropCount) break
        }
    }
    cache.set(ip, value)
}

/**
 * 解析 IP 归属地；未启用/内网 IP/查询失败均返回 null。
 * @param {string} ip
 * @returns {Promise<string|null>}
 */
async function resolvePosition(ip) {
    const config = readConfig()
    if (!config) return null
    if (!isPublicIp(ip)) return null

    const key = typeof ip === 'string' ? ip.trim() : ''
    if (cache.has(key)) return cache.get(key)

    try {
        const target = config.url.replace('{ip}', encodeURIComponent(key))
        const response = await fetch(target, {
            signal: AbortSignal.timeout(config.timeoutMs),
        })
        if (!response.ok) {
            remember(key, null)
            return null
        }

        const position = formatLocation(await response.json())
        remember(key, position)
        return position
    } catch (err) {
        // 超时/网络错误/DNS 失败都按「未知」处理并缓存，避免每个请求都重试
        remember(key, null)
        return null
    }
}

module.exports = { resolvePosition, formatLocation }
