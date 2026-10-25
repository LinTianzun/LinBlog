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

module.exports = { parseUserAgent }
