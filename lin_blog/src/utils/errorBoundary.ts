/**
 * 错误边界展示用的错误详情格式化。
 * 优先展示调用栈（便于定位），没有栈时退回 message，最后兜底成字符串。
 * 过长的栈会截断，避免整页被日志淹没。
 */
const MAX_DETAIL_LENGTH = 1200

export function formatErrorDetail(err: unknown): string {
    if (err === null || err === undefined) return '未知错误'

    const candidate = err as { stack?: unknown; message?: unknown }
    const raw =
        (typeof candidate.stack === 'string' && candidate.stack) ||
        (typeof candidate.message === 'string' && candidate.message) ||
        String(err)

    const text = raw.trim() || '未知错误'
    return text.length > MAX_DETAIL_LENGTH
        ? `${text.slice(0, MAX_DETAIL_LENGTH)}…（已截断）`
        : text
}

// 判断错误是否值得展示「刷新页面」以外的操作：渲染期错误通常可重试，
// 但语法/模块加载错误重试也没有意义，直接提示刷新。
export function isRetryableError(err: unknown): boolean {
    const name = (err as { name?: unknown })?.name
    return name !== 'SyntaxError' && name !== 'ReferenceError'
}
