import { createWebHistory, createRouter } from 'vue-router'

import IndexView from '../views/IndexView.vue'
import NotFound from '../components/NotFound.vue'

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
        roles: ['admin']
    }
},
            {
                path: 'systemLog',
                component: () => import('../views/SystemLogView.vue'),
                meta: {
                    requiresAuth: true,
                    roles: ['admin']
                }
            },
            {
                path: 'localfile',
                component: () => import('../views/FileView.vue'),
            },
            {
                path: 'article',
                component: () => import('../views/ArticleView.vue'),
            },
            {
                path: 'article/:id',
                redirect: '/article',
            },
            {
                path: 'gallery',
                component: () => import('../views/GalleryView.vue'),
            },
            {
                path: 'diary',
                component: () => import('../views/DiaryView.vue'),
            },
            {
                path: 'setting',
                component: () => import('../views/SettingView.vue'),
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
    },
    {
        path: '/editgallery',
        component: () => import('../views/EditGallery.vue'),
    },
    {
        path: '/editgallery/:id',
        component: () => import('../views/EditGallery.vue'),
    },
    {
        path: '/loginRegister',
        component: () => import('../views/LoginRegister.vue'),
        meta: { hideHeader: true, requiresAuth: false }
    },
]

const router = createRouter({
    history: createWebHistory(),
    routes,
    // 支持门户锚点导航（如顶部「留言」跳到首页留言墙）：
    // 带 hash 时滚动到锚点元素并留出顶栏偏移，无 hash 时回到页顶
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

     // 检查目标路由是否需要特定角色
    const requiredRoles = to.meta.roles as string[] | undefined

    if (requiredRoles?.length) {
        try {
            const savedUserInfo = localStorage.getItem('userInfo')
            const userInfo = savedUserInfo
                ? JSON.parse(savedUserInfo)
                : null

            if (!requiredRoles.includes(userInfo?.user_type)) {
                return '/overView'
            }
        } catch {
            return '/loginRegister'
        }
    }
})

export default router
