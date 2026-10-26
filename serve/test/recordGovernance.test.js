const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

// 测试不连库，仅满足配置校验（单独执行本文件时 .env 可能未加载）
process.env.LINBLOG_JWT_SECRET = 'test-secret-for-record-governance-0123456789abcdef'
process.env.LINBLOG_ALLOWED_ORIGINS = 'http://localhost:5173'

const recordModel = require(path.resolve(__dirname, '../model/dbModel/record/index.js'))
const { isPublicIp } = require(path.resolve(__dirname, '../utils/ua.js'))
const { resolvePosition, formatLocation } = require(path.resolve(__dirname, '../utils/geoip.js'))
const { readRetentionDays } = require(path.resolve(__dirname, '../utils/recordRetention.js'))

test('isPublicIp rejects loopback, private and non-IPv4 addresses', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.10', '172.16.0.1', '172.31.255.255',
        '169.254.1.1', '100.64.0.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', '', 'unknown']) {
        assert.equal(isPublicIp(ip), false, `${ip} 应被视为非公网地址`)
    }

    for (const ip of ['8.8.8.8', '114.114.114.114', '::ffff:8.8.8.8']) {
        assert.equal(isPublicIp(ip), true, `${ip} 应被视为公网地址`)
    }
})

test('formatLocation joins country/region/city and drops placeholders', () => {
    assert.equal(formatLocation({ country: '中国', region_name: '浙江省', city: '杭州市' }), '中国 浙江省 杭州市')
    assert.equal(formatLocation({ country: '中国', region: '北京', city: '北京' }), '中国 北京')
    assert.equal(formatLocation({ country: '-', city: 'None' }), null)
    assert.equal(formatLocation(null), null)
    assert.equal(formatLocation({ country: 'A'.repeat(200) }).length, 100)
})

test('resolvePosition returns null when geo lookup is not configured', async () => {
    const previous = process.env.LINBLOG_GEOIP_URL
    delete process.env.LINBLOG_GEOIP_URL
    try {
        assert.equal(await resolvePosition('8.8.8.8'), null)
    } finally {
        if (previous === undefined) delete process.env.LINBLOG_GEOIP_URL
        else process.env.LINBLOG_GEOIP_URL = previous
    }
})

test('resolvePosition skips private IPs and caches lookup results', async () => {
    const previousUrl = process.env.LINBLOG_GEOIP_URL
    const previousTimeout = process.env.LINBLOG_GEOIP_TIMEOUT_MS
    const previousFetch = globalThis.fetch

    let calls = 0
    globalThis.fetch = async () => {
        calls += 1
        return { ok: true, json: async () => ({ country: '中国', city: '上海' }) }
    }
    process.env.LINBLOG_GEOIP_URL = 'https://example.test/{ip}/json'

    try {
        assert.equal(await resolvePosition('192.168.1.1'), null, '内网 IP 不应查询外部服务')
        assert.equal(calls, 0)

        assert.equal(await resolvePosition('8.8.8.8'), '中国 上海')
        assert.equal(calls, 1)

        // 第二次命中缓存，不应再打外部服务
        assert.equal(await resolvePosition('8.8.8.8'), '中国 上海')
        assert.equal(calls, 1)
    } finally {
        globalThis.fetch = previousFetch
        if (previousUrl === undefined) delete process.env.LINBLOG_GEOIP_URL
        else process.env.LINBLOG_GEOIP_URL = previousUrl
        if (previousTimeout === undefined) delete process.env.LINBLOG_GEOIP_TIMEOUT_MS
        else process.env.LINBLOG_GEOIP_TIMEOUT_MS = previousTimeout
    }
})

test('resolvePosition degrades to null when the lookup fails', async () => {
    const previousUrl = process.env.LINBLOG_GEOIP_URL
    const previousFetch = globalThis.fetch

    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) })
    process.env.LINBLOG_GEOIP_URL = 'https://example.test/{ip}/json'

    try {
        assert.equal(await resolvePosition('9.9.9.9'), null)
        // 失败结果同样缓存，避免每个请求都重试
        assert.equal(await resolvePosition('9.9.9.9'), null)
    } finally {
        globalThis.fetch = previousFetch
        if (previousUrl === undefined) delete process.env.LINBLOG_GEOIP_URL
        else process.env.LINBLOG_GEOIP_URL = previousUrl
    }
})

test('pruneRecords deletes in batches and stops when nothing is left', async () => {
    const originalQuery = recordModel.__query
    const batches = []
    let remaining = 2500

    const query = async (sql, params) => {
        batches.push({ sql, params })
        if (sql.includes('LIMIT ?')) {
            const size = params[params.length - 1]
            const affected = Math.min(size, remaining)
            remaining -= affected
            return { affectedRows: affected }
        }
        return [{ total: remaining }]
    }

    const model = require(path.resolve(__dirname, '../model/dbModel/record/index.js'))
    const original = model.pruneRecords
    // 直接验证分批逻辑：用受控的 query 替换
    const modulePath = path.resolve(__dirname, '../model/dbModel/record/index.js')
    delete require.cache[modulePath]
    const dbnew = require(path.resolve(__dirname, '../model/db/dbnew.js'))
    const originalDbQuery = dbnew.query
    dbnew.query = query

    try {
        const fresh = require(modulePath)
        const result = await fresh.pruneRecords(90, 1000)
        // 2500 条 / 每批 1000 → 3 批（1000 + 1000 + 500）
        assert.equal(result.deleted, 2500)
        assert.equal(result.batches, 3)
        assert.equal(remaining, 0)
    } finally {
        dbnew.query = originalDbQuery
        delete require.cache[modulePath]
        void model
        void original
        void originalQuery
    }
})

test('pruneRecords falls back to default retention for invalid input', async () => {
    const modulePath = path.resolve(__dirname, '../model/dbModel/record/index.js')
    const dbnew = require(path.resolve(__dirname, '../model/db/dbnew.js'))
    const originalDbQuery = dbnew.query
    const seen = []
    dbnew.query = async (sql, params) => {
        seen.push(params)
        return { affectedRows: 0 }
    }

    try {
        const fresh = require(modulePath)
        await fresh.pruneRecords(0, -5)
        // 0 天与负数批大小都应回落到默认值
        assert.deepEqual(seen[0], [fresh.RETENTION_DAYS, 1000])
    } finally {
        dbnew.query = originalDbQuery
        delete require.cache[modulePath]
    }
})

test('readRetentionDays ignores zero/negative/invalid overrides', () => {
    const previous = process.env.LINBLOG_RECORD_RETENTION_DAYS
    const cases = [['0'], ['-3'], ['abc'], [''], ['30']]
    const expected = [recordModel.RETENTION_DAYS, recordModel.RETENTION_DAYS,
        recordModel.RETENTION_DAYS, recordModel.RETENTION_DAYS, 30]

    try {
        cases.forEach(([value], index) => {
            process.env.LINBLOG_RECORD_RETENTION_DAYS = value
            assert.equal(readRetentionDays(), expected[index], `输入 ${value} 的解析结果不符`)
        })
    } finally {
        if (previous === undefined) delete process.env.LINBLOG_RECORD_RETENTION_DAYS
        else process.env.LINBLOG_RECORD_RETENTION_DAYS = previous
    }
})
