const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const configPath = path.resolve(__dirname, '../config/default.js')

function loadConfig(env) {
    const saved = { ...process.env }
    Object.assign(process.env, env)
    // 用例必须从干净环境出发，否则宿主 shell 注入的变量会干扰断言
    for (const key of ['LINBLOG_JWT_SECRET', 'LINBLOG_ALLOWED_ORIGINS', 'LINBLOG_PORT']) {
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
