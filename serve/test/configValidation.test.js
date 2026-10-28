const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const configPath = path.resolve(__dirname, '../config/default.js')

function loadConfig(env) {
    const saved = { ...process.env }
    Object.assign(process.env, env)
    // 用例必须从干净环境出发，否则宿主 shell 注入的变量会干扰断言
    for (const key of [
        'LINBLOG_JWT_SECRET',
        'LINBLOG_ALLOWED_ORIGINS',
        'LINBLOG_PORT',
        'LINBLOG_PUBLIC_URL',
        'LINBLOG_SMTP_HOST',
        'LINBLOG_SMTP_PORT',
        'LINBLOG_SMTP_SECURE',
        'LINBLOG_SMTP_USER',
        'LINBLOG_SMTP_PASSWORD',
        'LINBLOG_SMTP_FROM',
    ]) {
        if (!(key in env)) {
            delete process.env[key]
        }
    }
    delete require.cache[require.resolve(configPath)]
    try {
        return require(configPath)
    } finally {
        process.env = saved
        delete require.cache[require.resolve(configPath)]
    }
}

test('valid env loads config with parsed port and origin list', () => {
    const config = loadConfig({
        LINBLOG_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
        LINBLOG_ALLOWED_ORIGINS: 'http://localhost:5173, https://blog.example.com',
        LINBLOG_PORT: '4040',
    })

    assert.equal(config.port, 4040)
    assert.deepEqual(config.allowedOrigins, ['http://localhost:5173', 'https://blog.example.com'])
})

test('missing or malformed config fails with aggregated errors', () => {
    assert.throws(
        () => loadConfig({ LINBLOG_JWT_SECRET: '' }),
        (err) => {
            assert.match(err.message, /LINBLOG_JWT_SECRET/)
            assert.match(err.message, /LINBLOG_ALLOWED_ORIGINS/)
            return true
        }
    )

    assert.throws(
        () => loadConfig({
            LINBLOG_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
            LINBLOG_ALLOWED_ORIGINS: 'http://localhost:5173/,https://bad.example.com/path',
        }),
        (err) => {
            assert.match(err.message, /包含无效来源/)
            assert.match(err.message, /https:\/\/bad\.example\.com\/path/)
            return true
        }
    )
})

test('trust proxy supports boolean, hop count and preset values', () => {
    const base = {
        LINBLOG_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
        LINBLOG_ALLOWED_ORIGINS: 'http://localhost:5173'
    }

    assert.equal(loadConfig({ ...base, LINBLOG_TRUST_PROXY: 'true' }).trustProxy, true)
    assert.equal(loadConfig({ ...base, LINBLOG_TRUST_PROXY: 'false' }).trustProxy, false)
    assert.equal(loadConfig({ ...base, LINBLOG_TRUST_PROXY: '2' }).trustProxy, 2)
    assert.equal(loadConfig({ ...base, LINBLOG_TRUST_PROXY: 'loopback' }).trustProxy, 'loopback')
    assert.equal(loadConfig(base).trustProxy, false)

    assert.throws(
        () => loadConfig({ ...base, LINBLOG_TRUST_PROXY: 'nginx' }),
        (err) => {
            assert.match(err.message, /LINBLOG_TRUST_PROXY/)
            return true
        }
    )
})

test('password reset public URL and SMTP settings are validated', () => {
    const base = {
        LINBLOG_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
        LINBLOG_ALLOWED_ORIGINS: 'http://localhost:5173'
    }

    const config = loadConfig({
        ...base,
        LINBLOG_PUBLIC_URL: 'https://blog.example.com',
        LINBLOG_SMTP_HOST: 'smtp.example.com',
        LINBLOG_SMTP_FROM: 'LinBlog <no-reply@example.com>',
    })
    assert.equal(config.publicUrl, 'https://blog.example.com')
    assert.equal(config.smtp.host, 'smtp.example.com')
    assert.equal(config.smtp.port, 587)

    assert.throws(
        () => loadConfig({ ...base, LINBLOG_PUBLIC_URL: 'https://blog.example.com/path' }),
        (err) => {
            assert.match(err.message, /LINBLOG_PUBLIC_URL/)
            return true
        }
    )
    assert.throws(
        () => loadConfig({ ...base, LINBLOG_SMTP_HOST: 'smtp.example.com' }),
        (err) => {
            assert.match(err.message, /LINBLOG_SMTP_FROM/)
            return true
        }
    )
})
