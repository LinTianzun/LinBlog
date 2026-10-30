const imageModel = require('../model/dbModel/image/index')

const uploadsUrlPattern = /^\/api\/uploads\/([A-Za-z0-9._-]+)$/

function extractUploadsFilename(coverUrl) {
    if (typeof coverUrl !== 'string') return null
    const match = coverUrl.trim().match(uploadsUrlPattern)
    return match ? match[1] : null
}

/**
 * 封面被替换/删除后，若数据库中的图片行已无任何业务引用则软删，避免孤儿图片。
 * 清理失败只记录日志，不影响主流程。
 */
async function cleanupCover(coverUrl) {
    const filename = extractUploadsFilename(coverUrl)
    if (!filename) return
    try {
        const result = await imageModel.deactivateImageIfUnreferenced(filename)
        if (result.deactivated) {
            console.log(`[Article] 已清理无引用封面图片 ${filename}`)
        }
    } catch (err) {
        console.warn('[Article] 清理封面图片失败：', err.message)
    }
}

module.exports = { cleanupCover, extractUploadsFilename }
