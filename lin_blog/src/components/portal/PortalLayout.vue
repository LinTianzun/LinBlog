<template>
    <div class="portal-layout">
        <!-- 环境背景层：模糊低透明度轮播，与首页共享 index/timestamp -->
        <PortalAmbientBackground :intensity="0.18" />
        <header class="portal-nav">
            <div class="nav-inner">
                <RouterLink class="nav-brand" to="/portal">
                    <img :src="unityLogo" alt="" aria-hidden="true" />
                    <span class="nav-brand-name">林知雨</span>
                </RouterLink>

                <nav class="nav-links" aria-label="门户导航">
                    <RouterLink v-for="item in links" :key="item.to" :to="item.to" class="nav-link"
                        :class="{ active: isActive(item.path) }" @click="handleNavClick(item)">
                        {{ item.label }}
                    </RouterLink>
                </nav>

                <button type="button" class="nav-action" @click="goAdmin">
                    进入后台
                </button>
            </div>
        </header>

        <main class="portal-body">
            <slot />
        </main>

        <footer class="portal-foot">
            <div class="foot-inner">
                <div class="foot-brand">
                    <img :src="unityLogo" alt="" aria-hidden="true" />
                    <span>林知雨</span>
                </div>
                <p class="foot-note">
                    写下代码，也拍下天气。
                </p>
                <nav class="foot-links" aria-label="页脚导航">
                    <RouterLink v-for="item in links" :key="item.path" :to="item.path">
                        {{ item.label }}
                    </RouterLink>
                </nav>
                <p class="foot-legal">
                    © {{ year }} 林知雨 · Vue 3 + Express + MySQL
                </p>
            </div>
        </footer>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import unityLogo from '../../assets/svg/unity.svg'
import PortalAmbientBackground from './PortalAmbientBackground.vue'

const props = withDefaults(defineProps<{
    // 导航高亮覆盖项：子页面可指定高亮哪个入口
    activePath?: string
}>(), {
    activePath: ''
})

const router = useRouter()
const route = useRoute()

const links = [
    { label: '首页', path: '/portal', to: '/portal' },
    { label: '文章', path: '/portal/articles', to: '/portal/articles' },
    { label: '摄影', path: '/portal/gallery', to: '/portal/gallery' },
    { label: '随笔', path: '/portal/diary', to: '/portal/diary' },
    // 留言是首页面内区块，用锚点跳转；已在首页时直接滚动过去
    { label: '留言', path: '/portal#wall', to: '/portal#wall', hash: 'wall' }
]

const isActive = (path: string): boolean => {
    const target = props.activePath || route.path
    if (path === '/portal') return target === '/portal'
    if (path === '/portal#wall') return target === '/portal' && route.hash === '#wall'
    return target.startsWith(path)
}

// 已在目标页时 router 不触发滚动，这里手动滚动到锚点区块
const handleNavClick = (item: { path: string; hash?: string }) => {
    if (!item.hash) return
    if (route.path === '/portal') {
        const target = document.getElementById(item.hash)
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
}

const year = computed(() => new Date().getFullYear())

const goAdmin = () => router.push('/overView')
</script>

<style lang="less" scoped>
.portal-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.portal-nav {
    position: sticky;
    top: 0;
    z-index: 20;
}

.nav-inner {
    display: flex;
    align-items: center;
    gap: 20px;
    width: var(--portal-page-width);
    margin: 0 auto;
    padding: 14px 0;
}

.nav-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;

    img {
        width: 28px;
        height: 28px;
        filter: var(--portal-logo-filter);
    }

    &-name {
        font-family: var(--portal-serif);
        font-size: 19px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--portal-text-primary);
    }
}

.nav-links {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: auto;
}

.nav-link {
    padding: 8px 16px;
    border-radius: var(--portal-radius-pill);
    font-size: 14px;
    color: var(--portal-text-secondary);
    text-decoration: none;
    transition: all var(--portal-transition-fast);

    &:hover {
        color: var(--portal-text-primary);
        background: var(--portal-surface);
    }

    &.active {
        color: var(--portal-text-on-accent);
        background: var(--portal-accent);
        font-weight: 500;
    }
}

.nav-action {
    flex-shrink: 0;
    padding: 9px 20px;
    border: 1px solid var(--portal-accent-strong);
    border-radius: var(--portal-radius-pill);
    background: var(--portal-accent);
    color: var(--portal-text-on-accent);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--portal-transition-fast);

    &:hover {
        filter: brightness(1.08);
        transform: translateY(-1px);
        box-shadow: var(--portal-shadow-soft);
    }
}

.portal-body {
    flex: 1;
    width: var(--portal-page-width);
    margin: 0 auto;
}

.portal-foot {
    margin-top: 96px;
    padding: 48px 0 40px;
    border-top: 1px solid var(--portal-surface-border);
    background: var(--portal-surface-strong);
    backdrop-filter: blur(var(--portal-blur-glass));
    -webkit-backdrop-filter: blur(var(--portal-blur-glass));
}

.foot-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: var(--portal-page-width);
    margin: 0 auto;
    text-align: center;
}

.foot-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;

    img {
        width: 26px;
        height: 26px;
        filter: var(--portal-logo-filter);
    }

    span {
        font-family: var(--portal-serif);
        font-size: 22px;
        font-weight: 600;
        letter-spacing: 0.1em;
        color: var(--portal-text-primary);
    }
}

.foot-note {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: 16px;
    color: var(--portal-text-secondary);
}

.foot-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 18px;

    a {
        font-size: 13px;
        color: var(--portal-text-secondary);
        text-decoration: none;
        transition: color var(--portal-transition-fast);

        &:hover {
            color: var(--portal-accent);
        }
    }
}

.foot-legal {
    margin: 0;
    font-size: 13px;
    color: var(--portal-text-tertiary);
}

@media (max-width: 720px) {
    .nav-inner,
    .portal-body,
    .foot-inner {
        width: calc(100% - 32px);
    }

    .nav-inner {
        gap: 12px;
        padding: 12px 0;
    }

    .nav-brand-name {
        display: none;
    }

    .nav-links {
        gap: 0;
        overflow-x: auto;
    }

    .nav-link {
        padding: 6px 10px;
        font-size: 13px;
    }

    .nav-action {
        padding: 7px 14px;
        font-size: 13px;
    }
}
</style>

<!-- 非 scoped：门户根节点需要承载主题变量，scoped 选择器无法命中根级属性 -->
<style lang="less">
.portal-layout {
    // 顶栏底色由主题的页面底色派生，保证 11 套预设都跟随；
    // color-mix 只降低不透明度，不引入写死色值
    --portal-header-bg: color-mix(in srgb, var(--bgColor1) 82%, transparent);
    --portal-logo-filter: none;
}

[data-theme='dark'] .portal-layout {
    // 深色下把黑色 logo 反白，避免与深色顶栏融为一体
    --portal-logo-filter: brightness(0) invert(1);
}


.portal-nav {
    background: var(--portal-header-bg);
    backdrop-filter: blur(14px) saturate(160%);
    -webkit-backdrop-filter: blur(14px) saturate(160%);
    border-bottom: 1px solid var(--portal-surface-border);
}

.portal-layout {
    background: transparent;
}

// 非 scoped：门户页面底色由 ambient 层提供，layout 不再写死纯色背景
// 不支持 color-mix 的旧浏览器退回不透明底
@supports not (background: color-mix(in srgb, red 50%, blue)) {
    .portal-layout {
        background: var(--bgColor1);
    }
    [data-theme='dark'] .portal-layout {
        background: var(--bgColor1);
    }
}
</style>
