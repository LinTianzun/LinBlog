import { createWebHistory, createRouter } from 'vue-router'

import IndexView from '../views/IndexView.vue'
import hello from '../components/HelloWorld.vue'

const routes = [
    {
        path: '/',
        redirect: '/overView',
        component: IndexView,
        children: [
            {
                // 当 /user/:id/profile 匹配成功
                // UserProfile 将被渲染到 User 的 <router-view> 内部
                path: 'overView',
                component: () => import('../views/OverView.vue'),
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
                path: 'gallery',
                component: () => import('../views/GalleryView.vue'),
            },
            {
                path: 'diary',
                component: () => import('../views/DiaryView.vue'),
            },

            {
                path: 'hello',
                component: hello,
            }
        ],
    },
    {
        path: '/editarticle',
        component: () => import('../views/EditArticle.vue'),
    },
    {
        path: '/editgallery',
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
})

export default router