import { createWebHistory, createRouter } from 'vue-router'

import IndexView from '../views/IndexView.vue'
import NotFound from '../components/NotFound.vue'
import { useSessionStore } from '../store/session'
import { createRouteGuard } from './guard'
import { applyPrivateSeo } from '../utils/portalSeo'

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
                // 总览是全站统计（文章/图库/随笔数量、访问趋势），
                // 按 overview.viewAll 收窄：无该权限的登录用户不再进入该页
                meta: {
                    requiresAuth: true,
                    permissions: ['overview.viewAll'],
                },
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
                path: 'reportedComments',
                component: () => import('../views/CommentReportView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['comment.moderate']
                }
            },
            {
                path: 'messages',
                component: () => import('../views/MessagesView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['message.private']
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
router.beforeEach(createRouteGuard(() => useSessionStore()))

// 门户页面自行维护分享元信息；其余后台/认证页面统一禁止索引，避免
// 从门户切回后台后仍残留上一篇公开内容的 canonical 与 OG 标题。
router.afterEach((to) => {
    if (to.path.startsWith('/portal')) return
    const privateTitles: Record<string, string> = {
        '/overView': '系统总览',
        '/userManagement': '用户管理',
        '/permissionManagement': '权限管理',
        '/systemLog': '系统日志',
        '/reportedComments': '举报处理',
        '/messages': '回复私信',
        '/localfile': '本地文件',
        '/article': '博客文章',
        '/gallery': '摄影图库',
        '/diary': '随笔随记',
        '/setting': '系统设置',
        '/loginRegister': '登录',
        '/resetPassword': '重置密码'
    }
    applyPrivateSeo(privateTitles[to.path] || 'LinBlog 管理后台')
})

export default router
