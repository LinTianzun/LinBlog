/**
 * AI 生成图片的水印处理。
 *
 * 现状：智谱等服务商会在成图右下角叠加「AI生成」徽标，属于平台的合规标识。
 * 官方提供了 `watermark_enabled` 参数，但只有签署过「去水印免责声明」的账号才生效；
 * 未签署时服务商仍会强制打标（实测返回的 URL 始终带 `_watermark` 后缀，参数无效）。
 *
 * 因此这里做两层处理：
 * 1. 请求层：始终带上 `watermark_enabled: false`。账号一旦签署免责声明即刻生效，
 *    对未签署的账号也无副作用（服务商忽略该参数）。
 * 2. 兜底层：若成图右下角仍存在徽标，就把徽标所在的一角裁掉。
 *
 * 徽标几何（智谱 cogview 系列实测）：徽标是「白色文字 + 半透明深色圆角底板」，
 * 尺寸随图片高度等比缩放，并且始终贴着右下角。据此可以先按比例算出文字块的理论位置，
 * 再用像素特征确认，而不是全图找亮斑——这样既快又不会把夜景灯光误当成徽标。
 */
const sharp = require('sharp')

// 徽标文字块相对图片高度的比例（实测：88x28 文字块 / 768 高）
const BADGE = {
    textHeightRatio: 0.0365,
    textAspect: 3.14,
    marginRightRatio: 0.043,
    marginBottomRatio: 0.03
}

// 文字块搜索容差：允许理论位置上下左右各偏移一点
const SEARCH_TOLERANCE_RATIO = 0.02
const SEARCH_STEP_RATIO = 0.01

// 命中判据
const MATCH = {
    // 文字像素：接近中性白（排除暖色背景与彩色霓虹）
    textLevel: 150,
    textSpread: 60,
    // 文字像素在文字块内的占比区间（纯色亮背景占比会接近 1，被上界排除）
    minTextRatio: 0.08,
    maxTextRatio: 0.75,
    // 徽标底板是半透明深色，底板范围内深色像素占比下限
    darkLevel: 90,
    minDarkRatio: 0.12,
    // 文字包围盒的宽高比区间，用于排除散乱高光
    minAspect: 2,
    maxAspect: 4.6
}

// 裁剪时相对文字高度留出的余量，确保半透明底板被整块切掉
const CROP_PADDING = {
    left: 1,
    top: 0.62
}

function isSupportedFormat(mimeType) {
    return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp'
}

function isTextPixel(r, g, b) {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    return min >= MATCH.textLevel && (max - min) <= MATCH.textSpread
}

function isDarkPixel(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) <= MATCH.darkLevel
}

/**
 * 统计指定矩形内「文字像素」的包围盒、数量与「深色底板」占比。
 */
async function measureBox(buffer, box) {
    const { data, info } = await sharp(buffer)
        .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

    const channels = info.channels
    let minX = Infinity
    let minY = Infinity
    let maxX = -1
    let maxY = -1
    let textCount = 0
    let darkCount = 0

    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            const index = (y * info.width + x) * channels
            const r = data[index]
            const g = data[index + 1]
            const b = data[index + 2]
            if (isDarkPixel(r, g, b)) darkCount++
            if (!isTextPixel(r, g, b)) continue
            textCount++
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
        }
    }

    const total = info.width * info.height
    return {
        textCount,
        textRatio: total > 0 ? textCount / total : 0,
        darkRatio: total > 0 ? darkCount / total : 0,
        textBox: maxX >= 0
            ? {
                left: box.left + minX,
                top: box.top + minY,
                width: maxX - minX + 1,
                height: maxY - minY + 1
            }
            : null
    }
}

/**
 * 在右下角按理论位置（带容差）寻找徽标。
 * 命中时返回文字块在整图中的坐标，否则返回 null。
 */
async function detectBadge(buffer) {
    const meta = await sharp(buffer).metadata()
    const width = meta.width
    const height = meta.height
    if (!width || !height) return null

    const textHeight = Math.max(8, Math.round(height * BADGE.textHeightRatio))
    const textWidth = Math.max(16, Math.round(textHeight * BADGE.textAspect))
    // 文字块理论左上角
    const baseLeft = width - Math.round(height * BADGE.marginRightRatio) - textWidth
    const baseTop = height - Math.round(height * BADGE.marginBottomRatio) - textHeight

    const tolerance = Math.max(4, Math.round(height * SEARCH_TOLERANCE_RATIO))
    const step = Math.max(2, Math.round(height * SEARCH_STEP_RATIO))

    let best = null
    for (let dx = -tolerance; dx <= tolerance; dx += step) {
        for (let dy = -tolerance; dy <= tolerance; dy += step) {
            const left = baseLeft + dx
            const top = baseTop + dy
            if (left < 0 || top < 0 || left + textWidth > width || top + textHeight > height) continue

            const measured = await measureBox(buffer, {
                left,
                top,
                width: textWidth,
                height: textHeight
            })
            if (!measured.textBox) continue
            if (measured.textRatio < MATCH.minTextRatio || measured.textRatio > MATCH.maxTextRatio) continue
            if (measured.darkRatio < MATCH.minDarkRatio) continue

            const aspect = measured.textBox.width / measured.textBox.height
            if (aspect < MATCH.minAspect || aspect > MATCH.maxAspect) continue

            // 文字像素应当铺满文字块的大部分高度，否则多半只是零散高光
            if (measured.textBox.height < textHeight * 0.6) continue

            if (!best || measured.textCount > best.textCount) {
                best = { ...measured, textHeight }
            }
        }
    }

    return best ? best.textBox : null
}

/**
 * 去掉右下角的水印徽标。
 * 没检测到徽标时原样返回，保证正常图片（以及账号已签免责声明后的无水印图）不被裁剪。
 */
async function removeWatermark(buffer, mimeType) {
    if (!isSupportedFormat(mimeType)) return { buffer, mimeType, removed: false }

    try {
        const textBox = await detectBadge(buffer)
        if (!textBox) return { buffer, mimeType, removed: false }

        // 徽标底板比文字更大，按文字高度留出余量后把右下角整块裁掉
        const keepWidth = Math.round(textBox.left - textBox.height * CROP_PADDING.left)
        const keepHeight = Math.round(textBox.top - textBox.height * CROP_PADDING.top)
        if (keepWidth < 64 || keepHeight < 64) return { buffer, mimeType, removed: false }

        const format = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpeg'
        const cleaned = await sharp(buffer)
            .extract({ left: 0, top: 0, width: keepWidth, height: keepHeight })
            .toFormat(format)
            .toBuffer()

        return { buffer: cleaned, mimeType, removed: true }
    } catch (err) {
        // 去水印失败不该让整次生成失败：原图照常返回
        console.warn('[AI] 去除水印失败，保留原图：', err?.message || err)
        return { buffer, mimeType, removed: false }
    }
}

module.exports = {
    removeWatermark,
    detectBadge
}
