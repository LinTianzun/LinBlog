// 全局 Helmet 策略是 `default-src 'none'`，适合纯 API 响应；
// 但 Express 托管前端构建产物时，HTML 文档也会被这条策略命中，
// 浏览器会拦掉同源的脚本与样式，导致整站白屏。
// 因此前端响应单独下发一条可用策略：脚本与接口限定同源，
// 内联样式与图片 data/blob 放开（AI 封面预览用的就是 data URI）。
const FRONTEND_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ')

function applyFrontendSecurityPolicy(res) {
    res.setHeader('Content-Security-Policy', FRONTEND_SECURITY_POLICY)
}

module.exports = { applyFrontendSecurityPolicy, FRONTEND_SECURITY_POLICY }
