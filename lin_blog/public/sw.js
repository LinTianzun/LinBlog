import {
  PWA_CACHE_NAMES,
  PWA_PRECACHE_SHELL_URLS,
  PWA_PRECACHE_STATIC_URLS,
  extractPrecacheAssetUrls,
  isCacheablePublicApiPath,
  isCacheableResponse,
  isImageAssetPath,
  isPortalNavigationPath,
  isStaticAssetPath,
} from './sw-policy.js'

const API_CACHE_LIMIT = 80
const IMAGE_CACHE_LIMIT = 120
const STATIC_CACHE_LIMIT = 100
const SHELL_ENTRY_URL = PWA_PRECACHE_SHELL_URLS[0] || '/index.html'

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= limit) return
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)))
}

async function precache() {
  const shellCache = await caches.open(PWA_CACHE_NAMES.shell)
  const indexResponse = await fetch(SHELL_ENTRY_URL, { cache: 'reload' })
  if (!indexResponse.ok) throw new Error('无法缓存门户应用壳')

  const html = await indexResponse.clone().text()
  await shellCache.put(SHELL_ENTRY_URL, indexResponse)

  const staticUrls = new Set(PWA_PRECACHE_STATIC_URLS)
  for (const url of extractPrecacheAssetUrls(html, self.location.origin)) {
    staticUrls.add(url)
  }

  const staticCache = await caches.open(PWA_CACHE_NAMES.static)
  await Promise.allSettled(
    [...staticUrls].map((url) => staticCache.add(new Request(url, { cache: 'reload' })))
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precache()
      .catch((error) => console.warn('[PWA] 预缓存失败：', error))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const currentCaches = new Set(Object.values(PWA_CACHE_NAMES))
      const staleCaches = (await caches.keys()).filter(
        (key) => key.startsWith('linblog-') && !currentCaches.has(key)
      )
      await Promise.all(staleCaches.map((key) => caches.delete(key)))
      await self.clients.claim()
    })()
  )
})

function offlineApiResponse() {
  return new Response(
    JSON.stringify({
      code: 503,
      message: '当前离线，且这篇内容还没有缓存',
      data: null,
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-LinBlog-Offline': '1',
      },
    }
  )
}

function offlineDocumentResponse() {
  return new Response(
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>当前离线</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#111720;color:#f5f2eb;font-family:system-ui,sans-serif"><main style="max-width:28rem;padding:2rem;text-align:center"><h1 style="font-size:1.35rem">当前处于离线状态</h1><p style="line-height:1.8;color:#b9b4aa">门户应用壳还没有缓存完成，请恢复网络后再打开。</p></main></body></html>',
    {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  )
}

async function cachePut(cacheName, request, response, limit) {
  try {
    const cache = await caches.open(cacheName)
    await cache.put(request, response)
    await trimCache(cacheName, limit)
  } catch (error) {
    console.warn('[PWA] 写入缓存失败：', error)
  }
}

async function networkFirst(request, cacheName, limit, fallback) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (isCacheableResponse(response)) {
      await cachePut(cacheName, request, response.clone(), limit)
    }
    return response
  } catch {
    const cached = await cache.match(request)
    return cached || fallback()
  }
}

async function networkFirstPortalNavigation(request) {
  try {
    return await fetch(request)
  } catch {
    const shellCache = await caches.open(PWA_CACHE_NAMES.shell)
    return (await shellCache.match(SHELL_ENTRY_URL)) || offlineDocumentResponse()
  }
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (isCacheableResponse(response)) {
      await cachePut(cacheName, request, response.clone(), limit)
    }
    return response
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' })
  }
}

async function cacheLoadedResources(urls) {
  const staticCache = await caches.open(PWA_CACHE_NAMES.static)
  const apiCache = await caches.open(PWA_CACHE_NAMES.api)
  const imageCache = await caches.open(PWA_CACHE_NAMES.images)
  const pending = []

  for (const rawUrl of urls.slice(0, 200)) {
    let url
    try {
      url = new URL(rawUrl, self.location.origin)
    } catch {
      continue
    }
    if (url.origin !== self.location.origin) continue

    if (isCacheablePublicApiPath(url.pathname)) {
      pending.push(apiCache.add(new Request(url, { cache: 'reload' })))
    } else if (isImageAssetPath(url.pathname)) {
      pending.push(imageCache.add(new Request(url, { cache: 'reload' })))
    } else if (isStaticAssetPath(url.pathname)) {
      pending.push(staticCache.add(new Request(url, { cache: 'reload' })))
    }
  }

  await Promise.allSettled(pending)
  await Promise.allSettled([
    trimCache(PWA_CACHE_NAMES.api, API_CACHE_LIMIT),
    trimCache(PWA_CACHE_NAMES.images, IMAGE_CACHE_LIMIT),
    trimCache(PWA_CACHE_NAMES.static, STATIC_CACHE_LIMIT),
  ])
}

self.addEventListener('message', (event) => {
  const data = event.data
  if (data?.type !== 'CACHE_LOADED_RESOURCES' || !Array.isArray(data.urls)) return
  event.waitUntil(
    cacheLoadedResources(data.urls).catch((error) =>
      console.warn('[PWA] 缓存当前页资源失败：', error)
    )
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === '/sw.js' || url.pathname === '/sw-policy.js') return

  if (request.mode === 'navigate') {
    if (isPortalNavigationPath(url.pathname)) {
      event.respondWith(networkFirstPortalNavigation(request))
    }
    return
  }

  if (isCacheablePublicApiPath(url.pathname)) {
    event.respondWith(
      networkFirst(request, PWA_CACHE_NAMES.api, API_CACHE_LIMIT, offlineApiResponse)
    )
    return
  }

  if (request.destination === 'image' || isImageAssetPath(url.pathname)) {
    event.respondWith(
      cacheFirst(request, PWA_CACHE_NAMES.images, IMAGE_CACHE_LIMIT)
    )
    return
  }

  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(
      cacheFirst(request, PWA_CACHE_NAMES.static, STATIC_CACHE_LIMIT)
    )
  }
})
