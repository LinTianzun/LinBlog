const path = require('node:path')

const excludedPaths = new Set([
    '/api',
    '/healthz',
    '/sitemap.xml',
    '/robots.txt',
    '/feed.xml',
])

function isSpaFallbackRequest(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false

    const pathname = req.path || '/'
    if (excludedPaths.has(pathname) || pathname.startsWith('/api/')) return false

    // 带扩展名的路径是静态资源；缺失时应返回 404，而不是 index.html。
    return path.extname(pathname) === ''
}

module.exports = { isSpaFallbackRequest }
