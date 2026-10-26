// 轻量 UA 解析：设备取 os 概称，浏览器与系统取主版本，够图表聚合用
function parseUserAgent(ua) {
    const s = typeof ua === 'string' ? ua : ''

    let browser = '其他'
    if (/Edg\//.test(s)) browser = 'Edge'
    else if (/OPR\/|Opera/.test(s)) browser = 'Opera'
    else if (/Firefox\//.test(s)) browser = 'Firefox'
    else if (/Chrome\//.test(s)) browser = 'Chrome'
    else if (/Safari\//.test(s)) browser = 'Safari'

    let os = '其他'
    if (/Windows/i.test(s)) os = 'Windows'
    else if (/Android/i.test(s)) os = 'Android'
    else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS'
    else if (/Mac OS X/i.test(s)) os = 'macOS'
    else if (/Linux/i.test(s)) os = 'Linux'

    const device = /Mobi|Android|iPhone|iPad|iPod/i.test(s) ? '移动端' : '桌面端'

    return { browser, os, device }
}

/**
 * 判断是否值得解析地理位置的 IP。
 * 内网/回环/保留地址没有地理意义，交给外部服务只会浪费配额并得到空结果。
 */
function isPublicIp(ip) {
    let value = typeof ip === 'string' ? ip.trim() : ''
    if (!value) return false

    // IPv4 映射的 IPv6（::ffff:8.8.8.8）按 IPv4 判断；其余 IPv6 一律跳过
    if (/^::ffff:/i.test(value)) {
        value = value.replace(/^::ffff:/i, '')
    }

    const v4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (!v4) {
        // 非 IPv4 一律跳过（含 IPv6、Unix socket、unknown）
        return false
    }

    const parts = v4.slice(1, 5).map(Number)
    if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false

    const [a, b] = parts
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 169 && b === 254) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a >= 224) return false
    return true
}

module.exports = { parseUserAgent, isPublicIp }
