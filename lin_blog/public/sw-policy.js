// PWA 缓存策略的纯函数集中在这里，便于 Node 单测覆盖；
// sw.js 只负责注册生命周期和 fetch 分发。
export const PWA_CACHE_NAMES = Object.freeze({
  shell: 'linblog-shell-v1',
  static: 'linblog-static-v1',
  api: 'linblog-api-v1',
  images: 'linblog-images-v1',
})

export const PWA_PRECACHE_SHELL_URLS = Object.freeze(['/index.html'])
export const PWA_PRECACHE_STATIC_URLS = Object.freeze([
  '/manifest.webmanifest',
  '/unityWhite.svg',
])

const PUBLIC_CONTENT_API_PATTERNS = [
  /^\/api\/public\/article(?:\/\d+)?$/,
  /^\/api\/public\/collection(?:\/\d+|\/article\/\d+)?$/,
  /^\/api\/public\/diary(?:\/\d+)?$/,
  /^\/api\/public\/subset$/,
  /^\/api\/public\/label$/,
]

const STATIC_PREFIXES = ['/assets/', '/portal/', '/pet/']
const STATIC_FILES = new Set([
  '/unityWhite.svg',
  '/unity.svg',
  '/buou.svg',
  '/vite.svg',
])
const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i

export function isPortalNavigationPath(pathname) {
  return pathname === '/portal' || pathname.startsWith('/portal/')
}

export function isCacheablePublicApiPath(pathname) {
  return PUBLIC_CONTENT_API_PATTERNS.some((pattern) => pattern.test(pathname))
}

export function isStaticAssetPath(pathname) {
  return (
    STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    STATIC_FILES.has(pathname)
  )
}

export function isImageAssetPath(pathname) {
  return pathname.startsWith('/api/uploads/') || IMAGE_EXTENSION.test(pathname)
}

export function extractPrecacheAssetUrls(html, origin = 'http://localhost') {
  const urls = new Set()
  const base = new URL(origin)
  const pattern = /(?:src|href)=["']([^"']+)["']/gi
  let match

  while ((match = pattern.exec(html))) {
    const raw = match[1]?.trim()
    if (!raw || /^(?:#|data:|blob:)/i.test(raw)) continue

    let url
    try {
      url = new URL(raw, base)
    } catch {
      continue
    }

    if (url.origin !== base.origin) continue
    if (!url.pathname.startsWith('/assets/')) continue
    urls.add(`${url.pathname}${url.search}`)
  }

  return [...urls]
}

export function isCacheableResponse(response) {
  if (!response?.ok || response.status !== 200) return false
  const cacheControl = response.headers?.get?.('cache-control') || ''
  return !/(?:^|,)\s*no-store(?:\s|,|$)/i.test(cacheControl)
}
