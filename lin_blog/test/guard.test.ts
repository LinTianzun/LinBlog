import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRouteGuard, type GuardSession, type GuardTarget } from '../src/router/guard.ts'

// node:test 没有浏览器环境，注入最小 localStorage polyfill
const storage = new Map<string, string>()
const localStorageShim = {
    getItem(key: string): string | null {
        return storage.has(key) ? storage.get(key)! : null
    },
    setItem(key: string, value: string): void {
        storage.set(key, String(value))
    },
    removeItem(key: string): void {
        storage.delete(key)
    },
    clear(): void {
        storage.clear()
    },
}
// @ts-expect-error: 给全局对象注入 localStorage polyfill
globalThis.localStorage = localStorageShim

beforeEach(() => storage.clear())
afterEach(() => storage.clear())

/**
 * 构造一个 mock 会话：超级管理员直接全通，否则按传入权限集合判定。
 */
function makeSession(permissions: string[], isSuperAdmin = false): GuardSession {
    const set = new Set(permissions)
    return {
        can(key?: string | null) {
            if (!key) return true
            if (isSuperAdmin) return true
            return set.has(key)
        },
    }
}

/**
 * 构造路由目标。默认带上 requiresAuth: true（后台业务页）。
 */
function target(path: string, meta: Partial<GuardTarget['meta']> = {}): GuardTarget {
    return { path, meta: { requiresAuth: true, ...meta } }
}

/**
 * 全部需要权限守卫的路由声明——与 router/index.ts 的 routes 定义保持同步。
 * 值为数组：命中其中任意一项权限即可进入。
 */
const PROTECTED_ROUTES: { path: string; permissions: string[] }[] = [
    { path: '/overView', permissions: [] },
    { path: '/userManagement', permissions: ['user.view'] },
    { path: '/permissionManagement', permissions: ['permission.view'] },
    { path: '/systemLog', permissions: ['systemLog.view'] },
    { path: '/localfile', permissions: ['file.view'] },
    { path: '/article', permissions: ['article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll'] },
    { path: '/gallery', permissions: ['gallery.viewAll', 'gallery.create', 'gallery.manageOwn', 'gallery.manageAll'] },
    { path: '/diary', permissions: ['diary.viewAll', 'diary.create', 'diary.manageOwn', 'diary.manageAll'] },
    { path: '/editarticle', permissions: ['article.create', 'article.manageOwn', 'article.manageAll'] },
    { path: '/editgallery', permissions: ['gallery.create', 'gallery.manageOwn', 'gallery.manageAll'] },
]

// ─── 匿名访问（无 token） ──────────────────────────────────────────

describe('匿名用户（无 token）', () => {
    let guard: ReturnType<typeof createRouteGuard>
    let originalToken: string | null

    beforeEach(() => {
        originalToken = localStorage.getItem('token')
        localStorage.removeItem('token')
        guard = createRouteGuard(() => makeSession([]))
    })

    afterEach(() => {
        if (originalToken !== null) localStorage.setItem('token', originalToken)
        else localStorage.removeItem('token')
    })

    it('访问后台业务页重定向到登录页', () => {
        for (const route of PROTECTED_ROUTES) {
            const result = guard(target(route.path, { permissions: route.permissions }))
            assert.equal(result, '/loginRegister', `路径 ${route.path} 应重定向到登录页`)
        }
    })

    it('门户页可匿名访问', () => {
        const portals = ['/portal', '/portal/articles', '/portal/gallery', '/portal/diary', '/portal/messages']
        for (const path of portals) {
            const result = guard(target(path, { requiresAuth: false }))
            assert.equal(result, undefined, `门户路径 ${path} 应允许匿名访问`)
        }
    })

    it('登录页可匿名访问', () => {
        const result = guard(target('/loginRegister', { requiresAuth: false }))
        assert.equal(result, undefined)
    })

    it('重置密码页可匿名访问', () => {
        const result = guard(target('/resetPassword', { requiresAuth: false }))
        assert.equal(result, undefined)
    })

    it('系统设置页无 token 时重定向到登录页', () => {
        // setting 路由只声明 requiresAuth，没有 permissions
        const result = guard(target('/setting', { requiresAuth: true }))
        assert.equal(result, '/loginRegister')
    })
})

// ─── 登录后重定向 ──────────────────────────────────────────────────

describe('已登录用户访问登录页', () => {
    let guard: ReturnType<typeof createRouteGuard>
    let originalToken: string | null

    beforeEach(() => {
        originalToken = localStorage.getItem('token')
        localStorage.setItem('token', 'test-token')
        guard = createRouteGuard(() => makeSession([]))
    })

    afterEach(() => {
        if (originalToken !== null) localStorage.setItem('token', originalToken)
        else localStorage.removeItem('token')
    })

    it('已登录访问登录页重定向到总览', () => {
        const result = guard(target('/loginRegister', { requiresAuth: false }))
        assert.equal(result, '/overView')
    })
})

// ─── 超级管理员 ─────────────────────────────────────────────────────

describe('超级管理员', () => {
    let guard: ReturnType<typeof createRouteGuard>
    let originalToken: string | null

    beforeEach(() => {
        originalToken = localStorage.getItem('token')
        localStorage.setItem('token', 'super-admin-token')
        guard = createRouteGuard(() => makeSession([], true))
    })

    afterEach(() => {
        if (originalToken !== null) localStorage.setItem('token', originalToken)
        else localStorage.removeItem('token')
    })

    it('拥有全部权限，所有受保护路由均可进入', () => {
        for (const route of PROTECTED_ROUTES) {
            const result = guard(target(route.path, { permissions: route.permissions }))
            assert.equal(result, undefined, `超级管理员访问 ${route.path} 应放行`)
        }
    })
})

// ─── 编辑角色（editor） ────────────────────────────────────────────

describe('编辑角色', () => {
    let guard: ReturnType<typeof createRouteGuard>
    let originalToken: string | null

    const editorPerms = [
        'overview.viewAll',
        'article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll', 'article.publish',
        'gallery.viewAll', 'gallery.create', 'gallery.manageOwn', 'gallery.manageAll', 'gallery.publish',
        'diary.viewAll', 'diary.create', 'diary.manageOwn', 'diary.manageAll',
        'category.manage', 'label.manage',
        'comment.create', 'comment.manageOwn', 'comment.moderate', 'comment.like', 'comment.report',
        'message.private',
    ]

    beforeEach(() => {
        originalToken = localStorage.getItem('token')
        localStorage.setItem('token', 'editor-token')
        guard = createRouteGuard(() => makeSession(editorPerms))
    })

    afterEach(() => {
        if (originalToken !== null) localStorage.setItem('token', originalToken)
        else localStorage.removeItem('token')
    })

    it('可进入文章列表和编辑页', () => {
        assert.equal(guard(target('/article', {
            permissions: ['article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll']
        })), undefined)
        assert.equal(guard(target('/editarticle', {
            permissions: ['article.create', 'article.manageOwn', 'article.manageAll']
        })), undefined)
    })

    it('可进入图库列表和编辑页', () => {
        assert.equal(guard(target('/gallery', {
            permissions: ['gallery.viewAll', 'gallery.create', 'gallery.manageOwn', 'gallery.manageAll']
        })), undefined)
        assert.equal(guard(target('/editgallery', {
            permissions: ['gallery.create', 'gallery.manageOwn', 'gallery.manageAll']
        })), undefined)
    })

    it('可进入随笔列表页', () => {
        assert.equal(guard(target('/diary', {
            permissions: ['diary.viewAll', 'diary.create', 'diary.manageOwn', 'diary.manageAll']
        })), undefined)
    })

    it('可进入本地文件页（editor 有 file 权限组？没有则重定向）', () => {
        // editor 默认权限不包含 file.view
        const result = guard(target('/localfile', { permissions: ['file.view'] }))
        assert.equal(result, '/overView')
    })

    it('无权限管理入口，重定向到总览', () => {
        assert.equal(guard(target('/permissionManagement', { permissions: ['permission.view'] })), '/overView')
        assert.equal(guard(target('/userManagement', { permissions: ['user.view'] })), '/overView')
        assert.equal(guard(target('/systemLog', { permissions: ['systemLog.view'] })), '/overView')
    })

    it('系统设置页可进入（对所有登录用户开放）', () => {
        assert.equal(guard(target('/setting', { requiresAuth: true })), undefined)
    })
})

// ─── 普通用户（normal） ───────────────────────────────────────────

describe('普通用户', () => {
    let guard: ReturnType<typeof createRouteGuard>
    let originalToken: string | null

    const normalPerms = [
        'article.create', 'article.manageOwn',
        'gallery.create', 'gallery.manageOwn',
        'diary.create', 'diary.manageOwn',
        'comment.create', 'comment.manageOwn', 'comment.like', 'comment.report',
        'message.private',
    ]

    beforeEach(() => {
        originalToken = localStorage.getItem('token')
        localStorage.setItem('token', 'normal-token')
        guard = createRouteGuard(() => makeSession(normalPerms))
    })

    afterEach(() => {
        if (originalToken !== null) localStorage.setItem('token', originalToken)
        else localStorage.removeItem('token')
    })

    it('可进入文章列表（有 create 权限）和编辑页', () => {
        assert.equal(guard(target('/article', {
            permissions: ['article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll']
        })), undefined)
        assert.equal(guard(target('/editarticle', {
            permissions: ['article.create', 'article.manageOwn', 'article.manageAll']
        })), undefined)
    })

    it('可进入图库列表和编辑页', () => {
        assert.equal(guard(target('/gallery', {
            permissions: ['gallery.viewAll', 'gallery.create', 'gallery.manageOwn', 'gallery.manageAll']
        })), undefined)
        assert.equal(guard(target('/editgallery', {
            permissions: ['gallery.create', 'gallery.manageOwn', 'gallery.manageAll']
        })), undefined)
    })

    it('无权查看全部文章时仍可进入列表页（命中 create 即放行）', () => {
        const result = guard(target('/article', {
            permissions: ['article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll']
        }))
        assert.equal(result, undefined)
    })

    it('无 file.view 权限，本地文件页重定向到总览', () => {
        assert.equal(guard(target('/localfile', { permissions: ['file.view'] })), '/overView')
    })

    it('无 user.view 权限，用户管理页重定向到总览', () => {
        assert.equal(guard(target('/userManagement', { permissions: ['user.view'] })), '/overView')
    })

    it('无 permission.view，权限管理页重定向到总览', () => {
        assert.equal(guard(target('/permissionManagement', { permissions: ['permission.view'] })), '/overView')
    })

    it('无 systemLog.view，系统日志页重定向到总览', () => {
        assert.equal(guard(target('/systemLog', { permissions: ['systemLog.view'] })), '/overView')
    })

    it('系统设置页可进入', () => {
        assert.equal(guard(target('/setting', { requiresAuth: true })), undefined)
    })
})

// ─── 游客角色（visitor） ────────────────────────────────────────────

describe('游客角色', () => {
    let guard: ReturnType<typeof createRouteGuard>
    let originalToken: string | null

    beforeEach(() => {
        originalToken = localStorage.getItem('token')
        localStorage.setItem('token', 'visitor-token')
        // visitor 默认只有 message.private
        guard = createRouteGuard(() => makeSession(['message.private']))
    })

    afterEach(() => {
        if (originalToken !== null) localStorage.setItem('token', originalToken)
        else localStorage.removeItem('token')
    })

    it('无权进入文章列表，重定向到总览', () => {
        assert.equal(guard(target('/article', {
            permissions: ['article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll']
        })), '/overView')
    })

    it('无权进入图库编辑页，重定向到总览', () => {
        assert.equal(guard(target('/editgallery', {
            permissions: ['gallery.create', 'gallery.manageOwn', 'gallery.manageAll']
        })), '/overView')
    })

    it('无权进入本地文件页，重定向到总览', () => {
        assert.equal(guard(target('/localfile', { permissions: ['file.view'] })), '/overView')
    })

    it('系统设置页可进入', () => {
        assert.equal(guard(target('/setting', { requiresAuth: true })), undefined)
    })

    it('总览页可进入（无权限声明）', () => {
        assert.equal(guard(target('/overView', { permissions: [] })), undefined)
    })
})

// ─── 任意一项命中即放行 ─────────────────────────────────────────────

describe('多权限声明的 OR 语义', () => {
    let guard: ReturnType<typeof createRouteGuard>
    let originalToken: string | null

    beforeEach(() => {
        originalToken = localStorage.getItem('token')
        localStorage.setItem('token', 'test-token')
    })

    afterEach(() => {
        if (originalToken !== null) localStorage.setItem('token', originalToken)
        else localStorage.removeItem('token')
    })

    it('仅命中 manageOwn 即放行文章列表', () => {
        guard = createRouteGuard(() => makeSession(['article.manageOwn']))
        assert.equal(guard(target('/article', {
            permissions: ['article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll']
        })), undefined)
    })

    it('仅命中 gallery.manageAll 即放行图库编辑页', () => {
        guard = createRouteGuard(() => makeSession(['gallery.manageAll']))
        assert.equal(guard(target('/editgallery', {
            permissions: ['gallery.create', 'gallery.manageOwn', 'gallery.manageAll']
        })), undefined)
    })

    it('全部不命中时重定向到总览', () => {
        guard = createRouteGuard(() => makeSession(['comment.create']))
        assert.equal(guard(target('/article', {
            permissions: ['article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll']
        })), '/overView')
    })
})
