const { redactUrl } = require('./security')

function requestIdOf(req) {
    return req.requestId || '-'
}

function notFoundHandler(req, res) {
    res.status(404).json({
        code: 404,
        message: '接口不存在',
        requestId: requestIdOf(req),
    })
}

function classifyError(err) {
    if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
        return { status: 413, message: '请求体或上传文件过大' }
    }
    if (err?.type === 'entity.parse.failed') {
        return { status: 400, message: '请求 JSON 格式不正确' }
    }
    if (err?.name === 'MulterError') {
        return { status: 400, message: '上传请求格式不正确' }
    }
    if (err?.code === 'CORS_ORIGIN_DENIED') {
        return { status: 403, message: '请求来源不被允许' }
    }

    const status = Number(err?.status || err?.statusCode)
    if (Number.isInteger(status) && status >= 400 && status < 500) {
        return { status, message: status === 429 ? '请求过于频繁，请稍后再试' : '请求无法处理' }
    }
    return { status: 500, message: '服务器内部错误' }
}

function createErrorHandler(options = {}) {
    const logger = options.logger || console

    return function errorHandler(err, req, res, next) {
        if (res.headersSent) {
            return next(err)
        }

        const failure = classifyError(err)
        const detail = [
            `[Error] ${requestIdOf(req)}`,
            req.method,
            redactUrl(req.originalUrl || req.url),
            failure.status,
            err?.name || 'Error',
            err?.code || err?.type || '-',
        ].join(' ')

        if (failure.status >= 500) {
            logger.error(detail, err?.stack || err)
        } else {
            logger.warn(detail)
        }

        res.setHeader('Cache-Control', 'no-store')
        return res.status(failure.status).json({
            code: failure.status,
            message: failure.message,
            requestId: requestIdOf(req),
        })
    }
}

module.exports = {
    classifyError,
    notFoundHandler,
    createErrorHandler,
    errorHandler: createErrorHandler(),
}
