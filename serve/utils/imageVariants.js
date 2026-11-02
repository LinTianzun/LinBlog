const sharp = require('sharp')

const variantWidths = new Set([160, 240, 320, 480, 640, 720, 960, 1280, 1600])

// 缩略图缓存：与 uploadController 共用一份实现，避免两处重复维护。
const variantCache = new Map()
const pendingVariants = new Map()
const variantCacheMaxBytes = 64 * 1024 * 1024
let variantCacheBytes = 0
// 命中率统计：读缓存时区分命中与未命中，生成与淘汰单独计数，
// 供后台「缩略图缓存」面板展示。
const variantCacheStats = { hits: 0, misses: 0, generations: 0, evictions: 0, clears: 0 }

/**
 * 解析 ?w=&format= 缩略图请求。
 * 返回 null 表示按原图返回；{ invalid: true } 表示参数非法（调用方回 400）。
 */
function parseVariantRequest(query) {
  const rawWidth = Array.isArray(query?.w) ? query.w[0] : query?.w
  if (rawWidth === undefined || rawWidth === '') return null

  const width = Number(rawWidth)
  const format = Array.isArray(query?.format) ? query.format[0] : query?.format
  if (!Number.isInteger(width) || !variantWidths.has(width) || (format && format !== 'webp')) {
    return { invalid: true }
  }

  return { width, format: 'webp' }
}

function readVariantCache(key) {
  const cached = variantCache.get(key)
  if (!cached) {
    variantCacheStats.misses += 1
    return null
  }

  // Map 保持插入顺序，命中后移到队尾即可实现轻量 LRU。
  variantCache.delete(key)
  variantCache.set(key, cached)
  variantCacheStats.hits += 1
  return cached
}

function writeVariantCache(key, value) {
  const dataLength = value.data.length
  if (dataLength > variantCacheMaxBytes) return

  const previous = variantCache.get(key)
  if (previous) {
    variantCacheBytes -= previous.data.length
    variantCache.delete(key)
  }

  while (variantCache.size && variantCacheBytes + dataLength > variantCacheMaxBytes) {
    const oldestKey = variantCache.keys().next().value
    const oldest = variantCache.get(oldestKey)
    variantCacheBytes -= oldest?.data.length || 0
    variantCache.delete(oldestKey)
    variantCacheStats.evictions += 1
  }

  variantCache.set(key, value)
  variantCacheBytes += dataLength
}

/**
 * 生成 WebP 缩略图。source 可以是 Buffer 或磁盘路径。
 * 同宽度并发请求共享同一个 Promise，避免重复解码。
 */
function createVariant(source, width, cacheKey, version) {
  const pending = pendingVariants.get(cacheKey)
  if (pending) return pending

  const quality = width <= 320 ? 72 : width <= 640 ? 76 : 80
  const task = sharp(source, {
    failOn: 'error',
    limitInputPixels: 40_000_000,
    animated: false
  })
    .rotate()
    .resize({
      width,
      fit: 'inside',
      withoutEnlargement: true,
      fastShrinkOnLoad: true,
    })
    .webp({ quality, effort: 4, smartSubsample: true })
    .toBuffer()
    .then((data) => {
      const variant = { data, version }
      variantCacheStats.generations += 1
      writeVariantCache(cacheKey, variant)
      return variant
    })
    .finally(() => {
      pendingVariants.delete(cacheKey)
    })

  pendingVariants.set(cacheKey, task)
  return task
}

function createEtag(version, width) {
  return `"${version}-${width || 'original'}"`
}

/**
 * 缓存运行状态：条目数、内存占用与命中率。
 * hitRate = 命中 / (命中 + 未命中)，无访问时为 null。
 */
function variantCacheInfo() {
  const reads = variantCacheStats.hits + variantCacheStats.misses
  return {
    entries: variantCache.size,
    bytes: variantCacheBytes,
    maxBytes: variantCacheMaxBytes,
    hits: variantCacheStats.hits,
    misses: variantCacheStats.misses,
    generations: variantCacheStats.generations,
    evictions: variantCacheStats.evictions,
    clears: variantCacheStats.clears,
    hitRate: reads > 0 ? Math.round((variantCacheStats.hits / reads) * 1000) / 10 : null
  }
}

/**
 * 手动清空缓存（后台「清理缓存」按钮）。统计累计值保留，只清数据。
 */
function clearVariantCache() {
  variantCache.clear()
  variantCacheBytes = 0
  variantCacheStats.clears += 1
  return variantCacheInfo()
}

/**
 * 统一的图片响应：带 ETag/304 与长期缓存。
 */
function sendImage(req, res, options) {
  const { version, data, mimeType, width } = options
  const etag = createEtag(version, width)
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.setHeader('ETag', etag)

  const requestEtag = req.headers?.['if-none-match']
  if (requestEtag && requestEtag === etag) {
    res.statusCode = 304
    return res.end()
  }

  res.setHeader('Content-Type', mimeType)
  res.setHeader('Content-Length', data.length)
  return res.end(data)
}

module.exports = {
    parseVariantRequest,
    readVariantCache,
    writeVariantCache,
    createVariant,
    createEtag,
    sendImage,
    variantCacheInfo,
    clearVariantCache,
    variantWidths,
}
