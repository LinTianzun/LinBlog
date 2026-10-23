function normalizeJsonBody(req, res, next) {
    if (
        req.body === null ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body)
    ) {
        req.body = {}
    }

    next()
}

module.exports = { normalizeJsonBody }
