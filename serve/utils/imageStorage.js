const fsp = require('node:fs/promises')
const fs = require('node:fs')
const path = require('node:path')
const db = require('../model/db/dbnew')
const { logger } = require('./logger')

const EXTERNAL_STORAGE_DIR = path.resolve(
    process.env.LINBLOG_IMAGE_EXTERNAL_DIR ||
    path.join(__dirname, '..', 'data', 'image-external')
)

function ensureDirSync() {
    fs.mkdirSync(EXTERNAL_STORAGE_DIR, { recursive: true })
}

ensureDirSync()

function externalKey(image) {
    const checksum = String(image?.checksum || '')
    if (!/^[a-f0-9]{64}$/i.test(checksum)) {
        throw new Error(`图片 checksum 不合法，无法外置（id=${image?.id ?? '未知'}）`)
    }
    return `${checksum.slice(0, 2)}/${checksum}.bin`
}

function externalPath(storageKey) {
    const normalized = String(storageKey || '').replaceAll('\\', '/')
    if (!/^[0-9a-f]{2}\/[a-f0-9]{64}\.bin$/i.test(normalized)) {
        throw new Error(`外置存储键不合法：${storageKey}`)
    }
    const target = path.resolve(EXTERNAL_STORAGE_DIR, normalized)
    if (target !== path.resolve(EXTERNAL_STORAGE_DIR, target)) {
        throw new Error(`外置存储键越界：${storageKey}`)
    }
    return target
}

/**
 * 读取一张图片记录的二进制内容：
 * - storage_backend = disk 时读外置文件
 * - 其他情况读 image.data（存量 BLOB 兼容）
 */
async function readImageBytes(image) {
    if (String(image?.storage_backend || 'db') === 'disk') {
        return fsp.readFile(externalPath(image.storage_key))
    }
    if (Buffer.isBuffer(image?.data)) return image.data
    if (image?.data) return Buffer.from(image.data)
    throw new Error(`图片二进制缺失（id=${image?.id ?? '未知'}）`)
}

/**
 * 外置迁移分批落盘：
 * - 同 checksum 的文件已存在时直接复用，保证幂等
 * - 临时文件 + rename，避免并发迁移读到半成品
 */
async function writeExternalFile(image, externalDir = EXTERNAL_STORAGE_DIR) {
    const key = externalKey(image)
    const dir = path.resolve(externalDir, key.slice(0, 2))
    const target = path.join(dir, path.basename(key))
    if (fs.existsSync(target)) {
        return key
    }

    await fsp.mkdir(dir, { recursive: true })
    const tempPath = `${target}.tmp-${process.pid}-${Date.now()}`
    try {
        await fsp.writeFile(tempPath, image.data)
        await fsp.rename(tempPath, target)
    } catch (err) {
        await fsp.rm(tempPath, { force: true }).catch(() => {})
        throw err
    }
    return key
}

/**
 * 外置成功后清空 BLOB 列；只有仍处于 db 存储且 checksum 一致的行才会被清空，
 * 避免并发迁移或上传期间把另一行的新 BLOB 误清。
 */
async function markImageExternal(image, exec = db.query) {
    const key = externalKey(image)
    const result = await exec(
        `UPDATE image
         SET data = NULL, storage_backend = 'disk', storage_key = ?
         WHERE id = ? AND checksum = ? AND storage_backend = 'db' AND data IS NOT NULL`,
        [key, image.id, image.checksum]
    )
    if (Number(result?.affectedRows) !== 1) {
        logger.warn('[ImageStorage] 外置标记被跳过（状态已变化）', {
            imageId: image?.id,
            checksum: image?.checksum?.slice(0, 12)
        })
        return false
    }
    return true
}

function imageStorageUsage() {
    const entries = []
    for (const entry of fs.readdirSync(EXTERNAL_STORAGE_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.length !== 2) continue
        for (const file of fs.readdirSync(path.join(EXTERNAL_STORAGE_DIR, entry.name), { withFileTypes: true })) {
            if (!file.isFile()) continue
            const filepath = path.join(EXTERNAL_STORAGE_DIR, entry.name, file.name)
            const stat = fs.statSync(filepath)
            entries.push({
                key: `${entry.name}/${file.name}`,
                size: stat.size,
                mtimeMs: stat.mtimeMs
            })
        }
    }
    return {
        dir: EXTERNAL_STORAGE_DIR,
        files: entries.length,
        bytes: entries.reduce((total, item) => total + item.size, 0)
    }
}

module.exports = {
    EXTERNAL_STORAGE_DIR,
    externalKey,
    externalPath,
    readImageBytes,
    writeExternalFile,
    markImageExternal,
    imageStorageUsage
}
