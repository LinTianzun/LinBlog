const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const healthPath = path.resolve(__dirname, '../utils/aiHealthCheck.js')

function loadHealthCheck({ failuresBeforeProbe = 0 } = {}) {
    let consecutiveFailures = failuresBeforeProbe
    const logs = []
    const notifications = []
    const mails = []

    const aiModel = {
        async listEnabledModelConfigs() {
            return [{ id: 1, name: '故障模型', enabled: 1, baseUrl: 'https://provider.example', apiKey: 'k', chatModel: 'm' }]
        },
        async recordModelHealth(modelId, { ok, latencyMs, error }) {
            consecutiveFailures = ok ? 0 : consecutiveFailures + 1
            return { consecutiveFailures }
        },
    }

    const logHelper = {
        writeSystemLog(payload) { logs.push(payload) },
    }
    const notificationHelper = {
        async notifySuperAdmin(payload) { notifications.push(payload) },
    }
    const mailer = {
        async sendAlertMail(payload) { mails.push(payload) },
    }

    const Module = require('node:module')
    const originalLoad = Module._load
    delete require.cache[healthPath]
    Module._load = function (request, parent, isMain) {
        if (parent && parent.filename === healthPath) {
            if (request === '../model/dbModel/ai/index') return aiModel
            if (request === './logHelper') return logHelper
            if (request === './notificationHelper') return notificationHelper
            if (request === './mailer') return mailer
        }
        return originalLoad.call(this, request, parent, isMain)
    }

    const healthCheck = require(healthPath)
    Module._load = originalLoad
    return { healthCheck, logs, notifications, mails }
}

async function probeWithFailure(healthCheck) {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({ ok: false, status: 503 })
    try {
        return await healthCheck.runHealthCheck({ source: 'scheduled' })
    } finally {
        globalThis.fetch = originalFetch
    }
}

async function probeWithSuccess(healthCheck) {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({ ok: true, status: 200 })
    try {
        return await healthCheck.runHealthCheck({ source: 'scheduled' })
    } finally {
        globalThis.fetch = originalFetch
    }
}

test('AI alerts once at the consecutive failure threshold and resets after recovery', async () => {
    delete process.env.LINBLOG_AI_ALERT_EMAIL
    const first = loadHealthCheck({ failuresBeforeProbe: 0 })
    await probeWithFailure(first.healthCheck)
    await probeWithFailure(first.healthCheck)
    assert.equal(first.logs.length, 0)
    assert.equal(first.notifications.length, 0)

    await probeWithFailure(first.healthCheck)
    assert.equal(first.logs.length, 1)
    assert.equal(first.notifications.length, 1)

    await probeWithFailure(first.healthCheck)
    assert.equal(first.logs.length, 1)
    assert.equal(first.notifications.length, 1)

    await probeWithSuccess(first.healthCheck)
    await probeWithFailure(first.healthCheck)
    assert.equal(first.logs.length, 1)
    assert.equal(first.notifications.length, 1)

    const second = loadHealthCheck({ failuresBeforeProbe: 0 })
    assert.equal(second.healthCheck.ALERT_FAILURE_THRESHOLD, 3)
})

test('AI alert sends optional email only at the deduplicated threshold', async () => {
    process.env.LINBLOG_AI_ALERT_EMAIL = 'owner@example.com'
    const suite = loadHealthCheck({ failuresBeforeProbe: 2 })
    await probeWithFailure(suite.healthCheck)

    assert.equal(suite.logs.length, 1)
    assert.equal(suite.notifications.length, 1)
    assert.equal(suite.mails.length, 1)
    assert.equal(suite.mails[0].to, 'owner@example.com')
    assert.match(suite.mails[0].subject, /故障模型/)
})
