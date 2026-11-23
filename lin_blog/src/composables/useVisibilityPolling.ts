import { onMounted, onUnmounted } from 'vue'
import { isDocumentVisible } from '../utils/messageRealtime'

/**
 * 可见性轮询：页面隐藏或组件卸载时自动暂停，恢复可见时立即触发一次。
 *
 * 之前 HeadBar / 私信抽屉 / 会话页各自维护 interval + visibilitychange
 * + focus 监听，行为略有差异；现在统一成一条规则：
 *   - token / 权限等业务前置条件仍由调用方在 tick 里自行判断
 *   - interval 只在页面可见时运行
 *   - 恢复可见、窗口重新聚焦、手动 resume 都立即 tick 一次
 */
export function useVisibilityPolling(
    tick: () => void | Promise<void>,
    options: { intervalMs: number; enabled?: () => boolean } = {
        intervalMs: 20_000,
    }
): { resume: () => void; pause: () => void } {
    let timer: number | undefined
    const intervalMs = options.intervalMs
    const enabled = options.enabled ?? (() => true)

    const stop = (): void => {
        if (timer !== undefined) {
            window.clearInterval(timer)
            timer = undefined
        }
    }

    const start = (): void => {
        stop()
        if (!enabled() || !isDocumentVisible()) return
        void tick()
        timer = window.setInterval(() => void tick(), intervalMs)
    }

    const onVisibilityChange = (): void => {
        if (isDocumentVisible()) start()
        else stop()
    }

    const onFocus = (): void => {
        if (isDocumentVisible()) void tick()
    }

    onMounted(() => {
        window.addEventListener('visibilitychange', onVisibilityChange)
        window.addEventListener('focus', onFocus)
        start()
    })

    onUnmounted(() => {
        window.removeEventListener('visibilitychange', onVisibilityChange)
        window.removeEventListener('focus', onFocus)
        stop()
    })

    return {
        resume: start,
        pause: stop,
    }
}
