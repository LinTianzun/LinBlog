// Service Worker 在 activate 时通过 postMessage 告知页面「新版本已接管」。
// 首次安装也会触发同一条消息，因此必须结合页面加载时是否已有 controller 判断。
export const PWA_UPDATE_MESSAGE = 'PWA_UPDATED'

export function isPwaUpdateMessage(payload: unknown): boolean {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    (payload as { type?: unknown }).type === PWA_UPDATE_MESSAGE
  )
}

export function shouldAnnouncePwaUpdate(
  hadControllerAtLoad: boolean,
  payload: unknown
): boolean {
  return hadControllerAtLoad && isPwaUpdateMessage(payload)
}
