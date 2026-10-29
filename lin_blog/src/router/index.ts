import { createWebHistory, createRouter } from 'vue-router'

import IndexView from '../views/IndexView.vue'
import NotFound from '../components/NotFound.vue'
import { useSessionStore } from '../store/session'

const routes = [
    {
        path: '/portal',
        component: () => import('../views/PortalHome.vue'),
        meta: { requiresAuth: false, hideHeader: true },
    },
    {
        path: '/portal/articles',
        component: () => import('../views/PortalArticles.vue'),
        meta: { requiresAuth: false, hideHeader: true },
    },
    {
        path: '/portal/gallery',
        component: () => import('../views/PortalGallery.vue'),
        meta: { requiresAuth: false, hideHeader: true },
    },
    {
        path: '/portal/diary',
        component: () => import('../views/PortalDiary.vue'),
        meta: { requiresAuth: false, hideHeader: true },
    },
    {
        path: '/portal/messages',
        component: () => import('../views/PortalMessages.vue'),
        meta: { requiresAuth: false, hideHeader: true },
    },
    {
        path: '/',
        redirect: '/loginRegister',
        component: IndexView,
        children: [
            {
                // 当 /user/:id/profile 匹配成功
                // UserProfile 将被渲染到 User 的 <router-view> 内部
                path: 'overView',
                component: () => import('../views/OverView.vue'),
            },
            {
    path: 'userManagement',
    component: () => import('../views/UserManagement.vue'),
    meta: {
        requiresAuth: true,
        permissions: ['user.view']
    }
},
            {
                path: 'permissionManagement',
                component: () => import('../views/PermissionManagement.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['permission.view']
                }
            },
            {
                path: 'systemLog',
                component: () => import('../views/SystemLogView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['systemLog.view']
                }
            },
            {
                path: 'localfile',
                component: () => import('../views/FileView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['file.view']
                }
            },
            {
                path: 'article',
                component: () => import('../views/ArticleView.vue'),
                // 查看权限：能创建、查看或管理任一项即可进入列表页
                meta: {
                    requiresAuth: true,
                    permissions: ['article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll']
                }
            },
            {
                path: 'article/:id',
                redirect: '/article',
            },
            {
                path: 'gallery',
                component: () => import('../views/GalleryView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['gallery.viewAll', 'gallery.create', 'gallery.manageOwn', 'gallery.manageAll']
                }
            },
            {
                path: 'diary',
                component: () => import('../views/DiaryView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['diary.viewAll', 'diary.create', 'diary.manageOwn', 'diary.manageAll']
                }
            },
            {
                path: 'setting',
                component: () => import('../views/SettingView.vue'),
                // 系统设置对所有登录用户开放，无需额外权限
                meta: {
                    requiresAuth: true,
                }
            },
            {
                // catch-all：未匹配的路径统一渲染 404 页面
                path: '/:pathMatch(.*)*',
                component: NotFound,
            }
        ],
    },
    {
        path: '/editarticle/:id?',
        component: () => import('../views/EditArticle.vue'),
        // 新建需 create，编辑现有需 manageOwn 或 manageAll
        meta: {
            requiresAuth: true,
            permissions: ['article.create', 'article.manageOwn', 'article.manageAll']
        }
    },
    {
        path: '/editgallery',
        component: () => import('../views/EditGallery.vue'),
        meta: {
            requiresAuth: true,
            permissions: ['gallery.create', 'gallery.manageOwn', 'gallery.manageAll']
        }
    },
    {
        path: '/editgallery/:id',
        component: () => import('../views/EditGallery.vue'),
        meta: {
            requiresAuth: true,
            permissions: ['gallery.create', 'gallery.manageOwn', 'gallery.manageAll']
        }
    },
    {
        path: '/loginRegister',
        component: () => import('../views/LoginRegister.vue'),
        meta: { hideHeader: true, requiresAuth: false }
    },
    {
        path: '/resetPassword',
        component: () => import('../views/ResetPassword.vue'),
        meta: { hideHeader: true, requiresAuth: false }
    },
]

const router = createRouter({
    history: createWebHistory(),
    routes,
    // 切页统一回到页顶；带 hash 时滚到锚点元素并留出门户 sticky 顶栏的偏移
    scrollBehavior(to) {
        if (to.hash) {
            return {
                el: to.hash,
                top: 88,
                behavior: 'smooth'
            }
        }
        return { top: 0 }
    },
})

// 全局路由守卫：未登录时禁止访问业务页面
router.beforeEach((to) => {
    const token = localStorage.getItem('token')
    const allowsAnonymous = to.meta.requiresAuth === false

    // 没有 Token，且目标页面不是登录页
    if (!allowsAnonymous && to.path !== '/loginRegister' && !token) {
        return '/loginRegister'
    }

    // 已有 Token 时，访问登录页自动进入主页
    if (to.path === '/loginRegister' && token) {
        return '/overView'
    }

    // 路由入口按权限判定：命中任意一项即可进入，避免角色硬编码
    const requiredPermissions = to.meta.permissions as string[] | undefined

    if (requiredPermissions?.length) {
        const session = useSessionStore()
        if (!requiredPermissions.some(key => session.can(key))) {
            return '/overView'
        }
    }
})

export default router
