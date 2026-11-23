import { createWebHistory, createRouter, type RouteRecordRaw } from 'vue-router'

import IndexView from '../views/IndexView.vue'
import NotFound from '../components/NotFound.vue'
import { useSessionStore } from '../store/session'
import { createRouteGuard } from './guard'
import { applyPrivateSeo } from '../utils/portalSeo'
import { resolveRouteTitle } from '../utils/routeTitle'

// meta.title 供 afterEach 设置浏览器标题（门户页自身会覆盖，见 portalSeo）。
const routes: RouteRecordRaw[] = [
    {
        path: '/portal',
        component: () => import('../views/PortalHome.vue'),
        meta: { requiresAuth: false, hideHeader: true, title: '门户首页' },
    },
    {
        path: '/portal/articles',
        component: () => import('../views/PortalArticles.vue'),
        meta: { requiresAuth: false, hideHeader: true, title: '文章' },
    },
    {
        path: '/portal/series',
        component: () => import('../views/PortalSeries.vue'),
        meta: { requiresAuth: false, hideHeader: true, title: '系列' },
    },
    {
        path: '/portal/gallery',
        component: () => import('../views/PortalGallery.vue'),
        meta: { requiresAuth: false, hideHeader: true, title: '图库' },
    },
    {
        path: '/portal/diary',
        component: () => import('../views/PortalDiary.vue'),
        meta: { requiresAuth: false, hideHeader: true, title: '随笔' },
    },
    {
        path: '/portal/messages',
        component: () => import('../views/PortalMessages.vue'),
        meta: { requiresAuth: false, hideHeader: true, title: '留言' },
    },
    {
        path: '/portal/notes',
        component: () => import('../views/PortalNotes.vue'),
        meta: { requiresAuth: false, hideHeader: true, title: '花园' },
    },
    {
        // 邮件里的确认/退订链接落到这里展示结果
        path: '/portal/newsletter',
        component: () => import('../views/PortalNewsletterStatus.vue'),
        meta: { requiresAuth: false, hideHeader: true, title: '订阅状态' },
    },
    {
        // 未知门户路径对访客可见，不能把 404 访客再送去登录页
        path: '/portal/:pathMatch(.*)*',
        component: NotFound,
        meta: { requiresAuth: false, hideHeader: true, title: '页面不存在' },
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
                    title: '系统总览',
                },
            },
            {
                path: 'contentHealth',
                component: () => import('../views/ContentHealthView.vue'),
                // 内容健康扫描会读取全站已发布内容，使用独立的巡检权限
                meta: {
                    requiresAuth: true,
                    permissions: ['contentHealth.view'],
                    title: '内容健康',
                },
            },
            {
                path: 'siteInsights',
                component: () => import('../views/SiteInsightsView.vue'),
                // 搜索词与 404 属于全站运营数据，使用独立的洞察权限
                meta: {
                    requiresAuth: true,
                    permissions: ['siteInsights.view'],
                    title: '站点洞察',
                },
            },
            {
    path: 'userManagement',
    component: () => import('../views/UserManagement.vue'),
    meta: {
        requiresAuth: true,
        permissions: ['user.view'],
        title: '用户管理'
    }
},
            {
                path: 'permissionManagement',
                component: () => import('../views/PermissionManagement.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['permission.view'],
                    title: '权限管理'
                }
            },
            {
                path: 'systemLog',
                component: () => import('../views/SystemLogView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['systemLog.view'],
                    title: '系统日志'
                }
            },
            {
                path: 'aiManage',
                component: () => import('../views/AiManageView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['ai.manage'],
                    title: 'AI 管理'
                }
            },
            {
                path: 'aiPrompt',
                component: () => import('../views/AiPromptView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['ai.manage'],
                    title: '提示词模板'
                }
            },
            {
                path: 'reportedComments',
                component: () => import('../views/CommentReportView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['comment.moderate'],
                    title: '举报处理'
                }
            },
            {
                path: 'messages',
                component: () => import('../views/MessagesView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['message.private'],
                    title: '回复私信'
                }
            },
            {
                path: 'localfile',
                component: () => import('../views/FileView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['file.view'],
                    title: '本地文件'
                }
            },
            {
                path: 'article',
                component: () => import('../views/ArticleView.vue'),
                // 查看权限：能创建、查看或管理任一项即可进入列表页
                meta: {
                    requiresAuth: true,
                    permissions: ['article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll'],
                    title: '博客文章'
                }
            },
            {
                path: 'scheduledPublish',
                component: () => import('../views/ScheduledPublishView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['schedule.manage'],
                    title: '定时发布'
                }
            },
            {
                path: 'draftBox',
                component: () => import('../views/DraftBoxView.vue'),
                meta: {
                    requiresAuth: true,
                    title: '草稿箱',
                    permissions: [
                        'article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll',
                        'gallery.viewAll', 'gallery.create', 'gallery.manageOwn', 'gallery.manageAll'
                    ]
                }
            },
            {
                path: 'collectionManage',
                component: () => import('../views/CollectionManageView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['collection.view', 'collection.manage'],
                    title: '内容系列'
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
                    permissions: ['gallery.viewAll', 'gallery.create', 'gallery.manageOwn', 'gallery.manageAll'],
                    title: '摄影图库'
                }
            },
            {
                path: 'diary',
                component: () => import('../views/DiaryView.vue'),
                meta: {
                    requiresAuth: true,
                    permissions: ['diary.viewAll', 'diary.create', 'diary.manageOwn', 'diary.manageAll'],
                    title: '随笔随记'
                }
            },
            {
                // 数字花园：私人笔记按登录用户隔离，暂不做独立权限位
                path: 'notes',
                component: () => import('../views/NoteManageView.vue'),
                meta: {
                    requiresAuth: true,
                    title: '数字花园',
                }
            },
            {
                // 花园待整理清单：无链接笔记与断链，由侧栏角标进入
                path: 'notes/tidy',
                component: () => import('../views/NoteTidyView.vue'),
                meta: {
                    requiresAuth: true,
                    title: '待整理笔记',
                }
            },
            {
                path: 'petManage',
                component: () => import('../views/PetManageView.vue'),
                // 站点级展示与行为需要 pet.manage；养成状态由本人使用
                meta: {
                    requiresAuth: true,
                    permissions: ['pet.manage'],
                    title: '宠物管理',
                }
            },
            {
                path: 'setting',
                component: () => import('../views/SettingView.vue'),
                // 系统设置对所有登录用户开放，无需额外权限
                meta: {
                    requiresAuth: true,
                    title: '系统设置',
                }
            },
            {
                // catch-all：未匹配的路径统一渲染 404 页面
                path: '/:pathMatch(.*)*',
                component: NotFound,
                meta: { title: '页面不存在' },
            }
        ],
    },
    {
        path: '/editarticle/:id?',
        component: () => import('../views/EditArticle.vue'),
        // 新建需 create，编辑现有需 manageOwn 或 manageAll
        meta: {
            requiresAuth: true,
            permissions: ['article.create', 'article.manageOwn', 'article.manageAll'],
        },
    },
    {
        path: '/editgallery',
        component: () => import('../views/EditGallery.vue'),
        meta: {
            requiresAuth: true,
            permissions: ['gallery.create', 'gallery.manageOwn', 'gallery.manageAll'],
        }
    },
    {
        path: '/editgallery/:id',
        component: () => import('../views/EditGallery.vue'),
        meta: {
            requiresAuth: true,
            permissions: ['gallery.create', 'gallery.manageOwn', 'gallery.manageAll'],
        }
    },
    {
        path: '/loginRegister',
        component: () => import('../views/LoginRegister.vue'),
        meta: { hideHeader: true, requiresAuth: false, title: '登录' }
    },
    {
        path: '/resetPassword',
        component: () => import('../views/ResetPassword.vue'),
        meta: { hideHeader: true, requiresAuth: false, title: '重置密码' }
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

// 后台页面标题统一取路由 meta.title（编辑页按新建/编辑动态区分，见 utils/routeTitle），
// 门户自行维护分享元信息；
// 其余后台/认证页面统一禁止索引，避免从门户切回后台后仍残留上一篇公开内容的
// canonical 与 OG 标题。
router.afterEach((to) => {
    if (to.path.startsWith('/portal')) return
    applyPrivateSeo(resolveRouteTitle(to))
})

export default router
