import { isPwaUpdateMessage } from './pwaUpdate'
import { logWarning } from './clientLogger'

const SNAPSHOT_RESOURCE_TYPES = new Set([
  'fetch',
  'image',
  'img',
  'script',
  'link',
  'css',
  'xmlhttprequest',
])

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

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

/**
 * 监听新版本接管事件。
 * - 只有页面加载时就已被旧 Service Worker 控制的标签页才提示，首次安装不打扰；
 * - 同时监听 controllerchange，防止个别浏览器漏投 message。
 */
export function setupPwaUpdateListener(onUpdate: () => void): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller)
  let announced = false

  const announce = () => {
    if (!hadControllerAtLoad || announced) return
    announced = true
    onUpdate()
  }

  const onMessage = (event: MessageEvent) => {
    if (isPwaUpdateMessage(event.data)) announce()
  }
  const onControllerChange = () => announce()

  navigator.serviceWorker.addEventListener('message', onMessage)
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

  return () => {
    navigator.serviceWorker.removeEventListener('message', onMessage)
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }
}

function scheduleUpdateChecks(registration: ServiceWorkerRegistration): void {
  const check = () => {
    // 更新检查失败不打扰用户，下次前台、恢复网络或整点再试
    void registration.update().catch(() => {})
  }

  window.setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  window.addEventListener('online', check)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', type: 'module' })
      .then((registration) => {
        sendLoadedResourceSnapshot()
        scheduleUpdateChecks(registration)
      })
      .catch((error) => {
        logWarning('[PWA] Service Worker 注册失败：', error)
      })
  }

  if (document.readyState === 'complete') {
    register()
  } else {
    window.addEventListener('load', register, { once: true })
  }
}
