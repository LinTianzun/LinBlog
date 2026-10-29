/**
 * 路由守卫核心逻辑（纯函数，不依赖 Pinia / Vue Router 实例）。
 *
 * 从 router/index.ts 抽离的目的是让单元测试可以直接传入 mock 会话与
 * localStorage 状态来验证守卫行为，而不需要挂载整个 Vue 应用。
 */

/**
 * 会话能力接口——与 store/session.ts 的 can 方法签名对齐。
 * 超级管理员固定返回 true，普通用户按权限集合匹配。
 */
export interface GuardSession {
    can: (permissionKey?: string | null) => boolean
}

/**
 * 路由目标的元信息子集，与 router/index.ts 中声明的 meta 字段对齐。
 */
export interface GuardMeta {
    requiresAuth?: boolean
    permissions?: string[]
}

/**
 * 路由目标的最小接口——只需要 path 和 meta。
 */
export interface GuardTarget {
    path: string
    meta: GuardMeta
}

export type GuardResult = string | void | undefined | false

/**
 * 权限不足 / 登录后的回落目标：按顺序取第一个当前会话可进入的页面。
 *
 * /overView 本身也受 overview.viewAll 保护（总览是全站统计），
 * 所以不能再把它当无条件兜底——否则无该权限的用户会「被拒 → 回总览 → 再被拒」死循环。
 * 末端 /setting 对所有登录用户开放，保证回落一定收敛。
 */
export const FALLBACK_ROUTES: { path: string; permissions?: string[] }[] = [
    { path: '/overView', permissions: ['overview.viewAll'] },
    { path: '/setting' },
]

/**
 * 选出会话可进入的回落路径（纯函数，便于测试）。
 */
export function resolveFallbackPath(session: GuardSession): string {
    for (const route of FALLBACK_ROUTES) {
        if (!route.permissions?.length) return route.path
        if (route.permissions.some(key => session.can(key))) return route.path
    }
    return FALLBACK_ROUTES[FALLBACK_ROUTES.length - 1].path
}

/**
 * 创建路由守卫工厂。
 *
 * @param getSession   回调返回当前会话能力（调用时实时读取，保证守卫拿到最新快照）
 * @param getToken     回调返回当前登录令牌（默认读 localStorage）
 */
export function createRouteGuard(
    getSession: () => GuardSession,
    getToken: () => string | null = () => localStorage.getItem('token'),
) {
    return function routeGuard(to: GuardTarget): GuardResult {
        const token = getToken()
        const allowsAnonymous = to.meta.requiresAuth === false

        // 未登录访问受保护页面 → 跳登录
        if (!allowsAnonymous && to.path !== '/loginRegister' && !token) {
            return '/loginRegister'
        }

        // 已登录访问登录页 → 跳总览
        if (to.path === '/loginRegister' && token) {
            return resolveFallbackPath(getSession())
        }
        // 按权限矩阵收窄：命中任意一项即可进入
        const requiredPermissions = to.meta.permissions
        if (requiredPermissions?.length) {
            const session = getSession()
            if (!requiredPermissions.some(key => session.can(key))) {
                return resolveFallbackPath(session)
            }
        }
    }
}
