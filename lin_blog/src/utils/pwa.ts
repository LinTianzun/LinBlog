const SNAPSHOT_RESOURCE_TYPES = new Set([
  'fetch',
  'image',
  'img',
  'script',
  'link',
  'css',
  'xmlhttprequest',
])

function sendLoadedResourceSnapshot(): void {
  const urls = new Set<string>()

  for (const entry of performance.getEntriesByType('resource')) {
    const resource = entry as PerformanceResourceTiming
    if (!SNAPSHOT_RESOURCE_TYPES.has(resource.initiatorType)) continue

    try {
      const url = new URL(resource.name)
      if (url.origin === window.location.origin) urls.add(url.href)
    } catch {
      // 忽略浏览器产生的非标准资源地址
    }
  }

  if (!urls.size) return
  navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage({
        type: 'CACHE_LOADED_RESOURCES',
        urls: [...urls],
      })
    })
    .catch(() => {
      // 离线快照是增强能力，失败不影响页面本身
    })
}

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', type: 'module' })
      .then(() => sendLoadedResourceSnapshot())
      .catch((error) => {
        console.warn('[PWA] Service Worker 注册失败：', error)
      })
  }

  if (document.readyState === 'complete') {
    register()
  } else {
    window.addEventListener('load', register, { once: true })
  }
}
