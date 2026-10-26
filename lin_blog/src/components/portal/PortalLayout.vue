<template>
    <div class="portal-layout">
        <header class="portal-nav">
            <div class="nav-inner">
                <RouterLink class="nav-brand" to="/portal">
                    <img :src="unityLogo" alt="" aria-hidden="true" />
                    <span class="nav-brand-name">林知雨</span>
                </RouterLink>

                <nav class="nav-links" aria-label="门户导航">
                    <RouterLink v-for="item in links" :key="item.path" :to="item.path" class="nav-link"
                        :class="{ active: isActive(item.path) }">
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

const props = withDefaults(defineProps<{
    // 导航高亮覆盖项：子页面可指定高亮哪个入口
    activePath?: string
}>(), {
    activePath: ''
})

const router = useRouter()
const route = useRoute()

const links = [
    { label: '首页', path: '/portal' },
    { label: '文章', path: '/portal/articles' },
    { label: '摄影', path: '/portal/gallery' },
    { label: '随笔', path: '/portal/diary' }
]

const isActive = (path: string): boolean => {
    const target = props.activePath || route.path
    if (path === '/portal') return target === '/portal'
    return target.startsWith(path)
}

const year = computed(() => new Date().getFullYear())

const goAdmin = () => router.push('/overView')
</script>

<style lang="less" scoped>
.portal-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: @bg-color-m;
}

.portal-nav {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--portal-header-bg);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid @line-color-s;
}

.nav-inner {
    display: flex;
    align-items: center;
    gap: 28px;
    width: min(1240px, calc(100% - 48px));
    margin: 0 auto;
    padding: 16px 0;
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
        color: @font-color-l;
    }
}

.nav-links {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-right: auto;
}

.nav-link {
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 14px;
    color: @font-color-s;
    text-decoration: none;
    transition: color 0.2s ease, background-color 0.2s ease;

    &:hover {
        color: @font-color-l;
        background: @bg-color-l;
    }

    &.active {
        color: @pcolor;
        background: var(--pcolor1);
        font-weight: 500;
    }
}

.nav-action {
    flex-shrink: 0;
    padding: 8px 18px;
    border: none;
    border-radius: 999px;
    background: @pcolor;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    transition: filter 0.2s ease;

    &:hover {
        filter: brightness(1.08);
    }
}

.portal-body {
    flex: 1;
    width: min(1240px, calc(100% - 48px));
    margin: 0 auto;
}

.portal-foot {
    margin-top: 96px;
    padding: 44px 0 40px;
    border-top: 1px solid @line-color-s;
    background: @bg-color-l;
}

.foot-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: min(1240px, calc(100% - 48px));
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
        color: @font-color-l;
    }
}

.foot-note {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: 16px;
    color: @font-color-s;
}

.foot-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 18px;

    a {
        font-size: 13px;
        color: @font-color-s;
        text-decoration: none;
        transition: color 0.2s ease;

        &:hover {
            color: @pcolor;
        }
    }
}

.foot-legal {
    margin: 0;
    font-size: 13px;
    color: @font-color-s;
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

// 不支持 color-mix 的旧浏览器退回不透明底，避免顶栏透明穿透正文
@supports not (background: color-mix(in srgb, red 50%, blue)) {
    .portal-layout {
        --portal-header-bg: var(--bgColor1);
    }
}
</style>
