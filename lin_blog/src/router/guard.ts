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
            return '/overView'
        }
        // 按权限矩阵收窄：命中任意一项即可进入
        const requiredPermissions = to.meta.permissions
        if (requiredPermissions?.length) {
            const session = getSession()
            if (!requiredPermissions.some(key => session.can(key))) {
                return '/overView'
            }
        }
    }
}
