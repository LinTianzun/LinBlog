const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const fileStorage = require('./fileStorage')

function sha256Hex(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function hmac(key, value) {
    return crypto.createHmac('sha256', key).update(value).digest()
}

function safeName(value) {
    return fileStorage.safeDiskName(value)
}

async function pathExists(filePath) {
    try {
        await fsp.access(filePath, fs.constants.F_OK)
        return true
    } catch {
        return false
    }
}

/**
 * 跨盘镜像：备份区落盘后再复制一份到另一个目录（可以是另一块磁盘/挂载点）。
 */
function createMirrorStorage({ dir }) {
    const resolvedDir = path.resolve(dir)

    async function ensureDir() {
        await fsp.mkdir(resolvedDir, { recursive: true })
    }

    async function put(name, sourcePath) {
        const diskName = safeName(name)
        if (!diskName) throw new Error('invalid_name')
        await ensureDir()
        await fsp.copyFile(sourcePath, path.join(resolvedDir, diskName))
    }

    async function get(name, targetPath) {
        const diskName = safeName(name)
        const sourcePath = diskName ? path.join(resolvedDir, diskName) : ''
        if (!diskName || !await pathExists(sourcePath)) {
            return false
        }
        await fsp.copyFile(sourcePath, targetPath)
        return true
    }

    async function remove(name) {
        const diskName = safeName(name)
        if (!diskName) return false
        const target = path.join(resolvedDir, diskName)
        if (!await pathExists(target)) return false
        await fsp.unlink(target)
        return true
    }

    return { enabled: true, dir: resolvedDir, put, get, remove }
}

/**
 * S3 兼容对象存储：内置 SigV4 签名，不引入额外依赖。
 * 支持 AWS S3、MinIO、阿里云 OSS（S3 兼容模式）等服务。
 */
function createS3Storage({
    endpoint,
    bucket,
    region = 'us-east-1',
    accessKeyId,
    secretAccessKey,
    prefix = ''
}) {
    const baseUrl = String(endpoint || '').replace(/\/+$/, '')
    const keyPrefix = String(prefix || '').replace(/^\/+|\/+$/g, '')

    function objectKey(name) {
        return keyPrefix ? `${keyPrefix}/${name}` : name
    }

    function objectUrl(key) {
        const encodedKey = key.split('/').map(encodeURIComponent).join('/')
        return `${baseUrl}/${encodeURIComponent(bucket)}/${encodedKey}`
    }

    function signedHeaders(method, url, body) {
        const now = new Date()
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
        const dateStamp = amzDate.slice(0, 8)
        const payloadHash = sha256Hex(body || Buffer.alloc(0))
        const canonicalUri = url.pathname
        const canonicalHeaders = [
            `host:${url.host}`,
            `x-amz-content-sha256:${payloadHash}`,
            `x-amz-date:${amzDate}`,
            ''
        ].join('\n')
        const signedHeaderNames = 'host;x-amz-content-sha256;x-amz-date'
        const canonicalRequest = [
            method,
            canonicalUri,
            '',
            canonicalHeaders,
            signedHeaderNames,
            payloadHash
        ].join('\n')
        const scope = `${dateStamp}/${region}/s3/aws4_request`
        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            scope,
            sha256Hex(canonicalRequest)
        ].join('\n')
        const signingKey = hmac(
            hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 's3'),
            'aws4_request'
        )
        const signature = crypto
            .createHmac('sha256', signingKey)
            .update(stringToSign)
            .digest('hex')

        return {
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            Authorization:
                `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, `
                + `SignedHeaders=${signedHeaderNames}, Signature=${signature}`
        }
    }

    async function request(method, name, body) {
        const diskName = safeName(name)
        if (!diskName) throw new Error('invalid_name')

        const url = new URL(objectUrl(objectKey(diskName)))
        const headers = signedHeaders(method, url, body)
        const response = await fetch(url, {
            method,
            headers,
            body: method === 'PUT' ? body : undefined
        })
        if (!response.ok) {
            const detail = await response.text().catch(() => '')
            throw new Error(`S3 ${method} ${response.status} ${detail}`.trim())
        }
        return response
    }

    async function put(name, sourcePath) {
        const body = await fsp.readFile(sourcePath)
        await request('PUT', name, body)
    }

    async function get(name, targetPath) {
        const response = await request('GET', name)
        const buffer = Buffer.from(await response.arrayBuffer())
        await fsp.writeFile(targetPath, buffer)
        return true
    }

    async function remove(name) {
        await request('DELETE', name)
        return true
    }

    return { enabled: true, endpoint: baseUrl, bucket, region, prefix: keyPrefix, put, get, remove }
}

function readConfig(env = process.env) {
    const mirrorDir = String(env.LINBLOG_FILE_BACKUP_MIRROR_DIR || '').trim()
    const s3 = String(env.LINBLOG_S3_ENDPOINT || '').trim()
        && String(env.LINBLOG_S3_BUCKET || '').trim()
        && String(env.LINBLOG_S3_ACCESS_KEY_ID || '').trim()
        && String(env.LINBLOG_S3_SECRET_ACCESS_KEY || '').trim()
        ? {
            endpoint: env.LINBLOG_S3_ENDPOINT,
            bucket: env.LINBLOG_S3_BUCKET,
            region: env.LINBLOG_S3_REGION || 'us-east-1',
            accessKeyId: env.LINBLOG_S3_ACCESS_KEY_ID,
            secretAccessKey: env.LINBLOG_S3_SECRET_ACCESS_KEY,
            prefix: env.LINBLOG_S3_PREFIX || ''
        }
        : null

    return { mirrorDir: mirrorDir || null, s3 }
}

/**
 * 异地副本编排：本地备份完成后同步到所有已配置的副本。
 * 单个副本失败不影响本地备份，失败信息返回给调用方记录。
 */
function createOffsiteStorage(options = {}) {
    const mirror = options.mirrorDir
        ? createMirrorStorage({ dir: options.mirrorDir })
        : null
    const s3 = options.s3 ? createS3Storage(options.s3) : null

    const providers = []
    if (mirror) providers.push({ type: 'mirror', storage: mirror })
    if (s3) providers.push({ type: 's3', storage: s3 })

    function backupPath(name) {
        const diskName = safeName(name)
        return diskName ? path.join(fileStorage.backupDir, diskName) : null
    }

    async function syncFromBackup(name) {
        const sourcePath = backupPath(name)
        const failed = []
        if (!sourcePath || !await pathExists(sourcePath)) {
            return { synced: 0, failed: [{ type: 'local', reason: 'missing_backup' }] }
        }

        let synced = 0
        for (const provider of providers) {
            try {
                await provider.storage.put(name, sourcePath)
                synced += 1
            } catch (err) {
                failed.push({ type: provider.type, reason: err.message })
            }
        }
        return { synced, failed }
    }

    // 本地备份缺失时，从任意一个异地副本恢复回本地备份区
    async function restoreToBackup(name) {
        const targetPath = backupPath(name)
        if (!targetPath) return { restored: false, reason: 'invalid_name' }
        if (await pathExists(targetPath)) {
            return { restored: false, reason: 'already_local' }
        }

        const failed = []
        for (const provider of providers) {
            try {
                if (await provider.storage.get(name, targetPath)) {
                    return { restored: true, source: provider.type, failed }
                }
            } catch (err) {
                failed.push({ type: provider.type, reason: err.message })
            }
        }
        return { restored: false, reason: 'missing_offsite', failed }
    }

    async function remove(name) {
        const failed = []
        let removed = 0
        for (const provider of providers) {
            try {
                if (await provider.storage.remove(name)) removed += 1
            } catch (err) {
                failed.push({ type: provider.type, reason: err.message })
            }
        }
        return { removed, failed }
    }

    function describe() {
        return {
            enabled: providers.length > 0,
            mirror: Boolean(mirror),
            s3: Boolean(s3),
            mirrorDir: mirror ? mirror.dir : null,
            s3Bucket: s3 ? s3.bucket : null
        }
    }

    return { syncFromBackup, restoreToBackup, remove, describe, providers }
}

const defaultOffsite = createOffsiteStorage(readConfig())

module.exports = {
    createMirrorStorage,
    createS3Storage,
    createOffsiteStorage,
    readConfig,
    defaultOffsite
}
