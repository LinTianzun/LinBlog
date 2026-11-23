<template>
    <div class="portal-layout">
        <a class="portal-skip-link" href="#portal-main">跳到正文</a>
        <!-- 环境背景层：模糊低透明度轮播，与首页共享 index/timestamp -->
        <PortalAmbientBackground :intensity="0.18" />
        <header class="portal-nav">
            <div class="nav-inner">
                <RouterLink class="nav-brand" to="/portal">
                    <span class="nav-brand-mark">
                        <img :src="unityLogo" alt="" aria-hidden="true" />
                    </span>
                    <span class="nav-brand-copy">
                        <span class="nav-brand-name">林知雨</span>
                        <span class="nav-brand-sub">PERSONAL JOURNAL</span>
                    </span>
                </RouterLink>

                <nav class="nav-links" aria-label="门户导航">
                    <RouterLink v-for="item in links" :key="item.path" :to="item.path" class="nav-link"
                        :class="{ active: isActive(item.path) }"
                        :aria-current="isActive(item.path) ? 'page' : undefined">
                        {{ item.label }}
                    </RouterLink>
                </nav>

                <div class="nav-tools">
                    <!-- 主题切换：与后台共用 ThemePicker（同一套预设、键盘交互与双向同步），
                         门户只通过 CSS 变量保持玻璃拟态外观 -->
                    <ThemePicker class="portal-theme-picker" />

                    <button type="button" class="nav-action portal-edge" @click="goAdmin">
                        进入后台
                    </button>
                </div>
            </div>
        </header>

        <Transition name="portal-offline">
            <div v-if="!isOnline" class="portal-offline" role="status" aria-live="polite">
                <span class="portal-offline-dot" aria-hidden="true" />
                <span>当前离线 · 已打开过的文章仍可阅读</span>
            </div>
        </Transition>

        <main id="portal-main" class="portal-body" tabindex="-1">
            <slot />
        </main>

        <!-- 订阅条与页面最后一个区块之间留出呼吸位，由布局层统一，避免各页面自己补下边距 -->
        <div class="portal-newsletter-slot">
            <PortalNewsletter />
        </div>

        <footer class="portal-foot">
            <div class="foot-inner">
                <div class="foot-brand">
                    <img :src="unityLogo" alt="" aria-hidden="true" />
                    <span class="foot-brand-copy">
                        <strong>林知雨</strong>
                        <small>PERSONAL JOURNAL</small>
                    </span>
                </div>
                <p class="foot-note">
                    把代码、光线与日常，写成一封持续更新的长信。
                </p>
                <nav class="foot-links" aria-label="页脚导航">
                    <RouterLink v-for="item in links" :key="item.path" :to="item.path"
                        :aria-current="isActive(item.path) ? 'page' : undefined">
                        {{ item.label }}
                    </RouterLink>
                </nav>
                <button type="button" class="foot-pet" @click="togglePet">
                    <span aria-hidden="true">🐾</span>
                    {{ visitorPrefs.hidden ? '显示桌宠' : '隐藏桌宠' }}
                </button>
                <p class="foot-legal">
                    © {{ year }} 林知雨 · Vue 3 + Express + MySQL
                </p>
            </div>
        </footer>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import unityLogo from '../../assets/svg/unity.svg'
import PortalAmbientBackground from './PortalAmbientBackground.vue'
import ThemePicker from '../common/ThemePicker.vue'
import PortalNewsletter from './PortalNewsletter.vue'
import {
    getVisitorPetPreferences,
    onVisitorPetPreferencesChange,
    setVisitorPetPreferences,
    type VisitorPetPreferences,
} from '../../utils/desktopPetVisitor'

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
    { label: '系列', path: '/portal/series' },
    { label: '摄影', path: '/portal/gallery' },
    { label: '随笔', path: '/portal/diary' },
    { label: '花园', path: '/portal/notes' },
    { label: '留言', path: '/portal/messages' }
]

const isActive = (path: string): boolean => {
    const target = props.activePath || route.path
    if (path === '/portal') return target === '/portal'
    return target.startsWith(path)
}

const year = computed(() => new Date().getFullYear())

const isOnline = ref(navigator.onLine)
const syncOnlineState = () => {
    isOnline.value = navigator.onLine
}

// 页脚提供移动端也能触达的桌宠偏好入口：只影响当前浏览器
const visitorPrefs = ref<VisitorPetPreferences>(getVisitorPetPreferences())
const unsubscribeVisitorPrefs = onVisitorPetPreferencesChange((next) => {
    visitorPrefs.value = next
})
const togglePet = () => {
    setVisitorPetPreferences({ hidden: !visitorPrefs.value.hidden })
}

onMounted(() => {
    window.addEventListener('online', syncOnlineState)
    window.addEventListener('offline', syncOnlineState)
})

onUnmounted(() => {
    window.removeEventListener('online', syncOnlineState)
    window.removeEventListener('offline', syncOnlineState)
    unsubscribeVisitorPrefs()
})

const goAdmin = () => router.push('/overView')
</script>

<style lang="less" scoped>
.portal-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.portal-skip-link {
    position: fixed;
    top: 10px;
    left: 50%;
    z-index: 100;
    padding: 10px 18px;
    border-radius: var(--portal-radius-pill);
    background: var(--portal-accent);
    color: var(--portal-text-on-accent);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    box-shadow: var(--portal-shadow-soft);
    transform: translate(-50%, -160%);
    transition: transform var(--portal-transition-fast);

    &:focus-visible {
        outline: 2px solid var(--portal-text-on-accent);
        outline-offset: 3px;
        transform: translate(-50%, 0);
    }
}

.portal-nav {
    position: sticky;
    top: 0;
    z-index: 20;
}

.nav-inner {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 24px;
    width: var(--portal-page-width);
    margin: 0 auto;
    padding: 13px 0;
}

.nav-brand {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    gap: 10px;
    text-decoration: none;

    &-mark {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border: 1px solid var(--portal-surface-border);
        border-radius: 12px;
        background: var(--portal-surface);
        box-shadow: var(--portal-shadow-soft);

        img {
            width: 24px;
            height: 24px;
            filter: var(--portal-logo-filter);
        }
    }

    &-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    &-name {
        font-family: var(--portal-serif);
        font-size: 18px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--portal-text-primary);
    }

    &-sub {
        color: var(--portal-text-tertiary);
        font-size: 8px;
        font-weight: 600;
        letter-spacing: 0.18em;
    }
}

.nav-links {
    display: flex;
    align-items: center;
    justify-self: center;
    gap: 2px;
    padding: 4px;
    border: 1px solid var(--portal-surface-border);
    border-radius: var(--portal-radius-pill);
    background: color-mix(in srgb, var(--portal-surface) 76%, transparent);
    backdrop-filter: blur(var(--portal-blur-glass));
    -webkit-backdrop-filter: blur(var(--portal-blur-glass));
}

.nav-link {
    padding: 8px 17px;
    border-radius: var(--portal-radius-pill);
    font-size: 13px;
    font-weight: 500;
    color: var(--portal-text-secondary);
    text-decoration: none;
    transition: color var(--portal-transition-fast),
        background-color var(--portal-transition-fast),
        box-shadow var(--portal-transition-fast);

    &:hover {
        color: var(--portal-text-primary);
        background: var(--portal-surface);
    }

    &.active {
        color: var(--portal-text-on-accent);
        background: var(--portal-accent);
        box-shadow: 0 6px 18px var(--portal-accent-soft);
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
    transition: filter var(--portal-transition-fast),
        transform var(--portal-transition-fast),
        box-shadow var(--portal-transition-fast);

    &:hover {
        filter: brightness(1.08);
        transform: translateY(-1px);
        box-shadow: var(--portal-shadow-soft);
    }
}

// 顶栏右侧工具区：主题切换在选择「进入后台」左侧
.nav-tools {
    display: inline-flex;
    align-items: center;
    justify-self: end;
    gap: 12px;
    flex-shrink: 0;
}

// 主题下拉：与「进入后台」等高对齐，用描边式造型区分主次。
// 面板结构与键盘交互来自共享 ThemePicker，这里只提供门户外观变量。
.portal-theme-picker {
    --theme-picker-accent: var(--portal-accent);
    --theme-picker-accent-soft: var(--portal-accent-soft);
    --theme-picker-text: var(--portal-text-primary);
    --theme-picker-text-secondary: var(--portal-text-secondary);
    --theme-picker-panel-bg: color-mix(in srgb, var(--portal-surface-strong) 92%, transparent);
    --theme-picker-panel-border: var(--portal-surface-border);
    --theme-picker-panel-radius: var(--portal-radius-card);
    --theme-picker-panel-shadow: var(--portal-shadow-soft);
    gap: 8px;
    // 与 .nav-action 的 40px 等高，并排时不出现高低错位
    height: 40px;
    padding: 0 14px;
    border-radius: var(--portal-radius-pill);
    background: var(--portal-surface);
    backdrop-filter: blur(var(--portal-blur-glass));
    -webkit-backdrop-filter: blur(var(--portal-blur-glass));
    border: 1px solid var(--portal-accent-soft);
    color: var(--portal-text-primary);
    transition: border-color var(--portal-transition-fast),
        background-color var(--portal-transition-fast),
        transform var(--portal-transition-fast),
        box-shadow var(--portal-transition-fast);

    &:hover {
        border-color: var(--portal-accent);
        background: var(--portal-surface-hover);
        transform: translateY(-1px);
        box-shadow: var(--portal-shadow-soft);
    }

    &:focus-within {
        border-color: var(--portal-accent);
        box-shadow: 0 0 0 3px var(--portal-accent-soft);
    }

    :deep(.theme-trigger) {
        cursor: pointer;
        transition: color var(--portal-transition-fast);

        &:focus-visible {
            color: var(--portal-accent);
            outline: 2px solid var(--portal-accent);
            outline-offset: 3px;
            border-radius: var(--portal-radius-pill);
        }
    }

    :deep(.theme-name) {
        font-size: 13px;
        font-weight: 500;
    }

    :deep(.theme-panel) {
        backdrop-filter: blur(var(--portal-blur-glass));
        -webkit-backdrop-filter: blur(var(--portal-blur-glass));
    }

    :deep(.theme-option) {
        border-radius: var(--portal-radius-small);
        font-size: 13px;
    }
}

.portal-body {
    flex: 1;
    width: var(--portal-page-width);
    margin: 0 auto;

    &:focus {
        outline: none;
    }
}

.portal-newsletter-slot {
    margin-top: clamp(72px, 9vw, 128px);
}

.portal-offline {
    position: fixed;
    left: 50%;
    bottom: 24px;
    z-index: 60;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: calc(100vw - 32px);
    padding: 9px 16px;
    border: 1px solid color-mix(in srgb, var(--portal-accent) 28%, var(--portal-surface-border));
    border-radius: var(--portal-radius-pill);
    background: color-mix(in srgb, var(--portal-surface-strong) 90%, transparent);
    color: var(--portal-text-secondary);
    box-shadow: var(--portal-shadow-soft);
    backdrop-filter: blur(var(--portal-blur-glass));
    -webkit-backdrop-filter: blur(var(--portal-blur-glass));
    font-size: 12px;
    line-height: 1.5;
    transform: translateX(-50%);
}

.portal-offline-dot {
    flex-shrink: 0;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--portal-accent);
    box-shadow: 0 0 0 4px var(--portal-accent-soft);
    animation: portal-offline-pulse 1.8s ease-in-out infinite;
}

.portal-offline-enter-active,
.portal-offline-leave-active {
    transition: opacity var(--portal-transition-fast), transform var(--portal-transition-fast);
}

.portal-offline-enter-from,
.portal-offline-leave-to {
    opacity: 0;
    transform: translate(-50%, 8px);
}

@keyframes portal-offline-pulse {
    0%,
    100% {
        opacity: 0.55;
    }

    50% {
        opacity: 1;
    }
}

.portal-foot {
    // 上方已有订阅条的留白，这里收窄一点，避免底栏前出现两块等量空白
    margin-top: 56px;
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
    gap: 12px;

    img {
        width: 30px;
        height: 30px;
        filter: var(--portal-logo-filter);
    }

    &-copy {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
    }

    strong {
        font-family: var(--portal-serif);
        font-size: 22px;
        font-weight: 600;
        letter-spacing: 0.1em;
        color: var(--portal-text-primary);
    }

    small {
        color: var(--portal-text-tertiary);
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.18em;
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

.foot-pet {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border: 1px solid var(--portal-surface-border);
    border-radius: var(--portal-radius-pill);
    background: var(--portal-surface);
    color: var(--portal-text-secondary);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: color var(--portal-transition-fast), border-color var(--portal-transition-fast);

    &:hover,
    &:focus-visible {
        color: var(--portal-accent);
        border-color: var(--portal-accent-soft);
    }

    &:focus-visible {
        outline: 2px solid var(--portal-accent);
        outline-offset: 3px;
    }
}

.foot-legal {
    margin: 0;
    font-size: 13px;
    color: var(--portal-text-tertiary);
}

@media (max-width: 900px) {
    .nav-inner {
        grid-template-columns: 1fr auto;
        row-gap: 10px;
    }

    .nav-links {
        grid-column: 1 / -1;
        grid-row: 2;
        justify-self: stretch;
        justify-content: center;
    }

    .nav-tools {
        grid-column: 2;
        grid-row: 1;
    }
}

@media (max-width: 720px) {
    .nav-inner,
    .portal-body,
    .foot-inner {
        width: calc(100% - 32px);
    }

    .nav-inner {
        gap: 12px;
        padding: 10px 0;
    }

    .nav-brand-sub {
        display: none;
    }

    .nav-brand-mark {
        width: 34px;
        height: 34px;
        border-radius: 10px;
    }

    .nav-brand-name {
        font-size: 16px;
    }

    .nav-links {
        justify-content: flex-start;
        gap: 0;
        overflow-x: auto;
        padding: 3px;
    }

    .nav-link {
        padding: 7px 11px;
        font-size: 13px;
        white-space: nowrap;
    }

    .nav-action {
        // 显式高度：窄屏下让按钮与主题选择器严格等高，
        // 不依赖 padding + font-size 的隐式计算
        height: 34px;
        padding: 0 14px;
        font-size: 13px;
    }

    // 窄屏空间有限：只保留主题色圆点并收窄外框，避免挤掉「进入后台」；
    // 圆点本身就表达了当前主题，隐藏文字不影响可用性
    .nav-tools {
        gap: 8px;
    }

    .portal-theme-picker {
        height: 34px;
        padding: 0 10px;
        gap: 0;

        :deep(.theme-name) {
            display: none;
        }
    }

    // 窄屏：面板右对齐触发器，宽度按视口收敛，避免贴边溢出
    .portal-theme-picker :deep(.theme-panel) {
        width: min(248px, calc(100vw - 32px));
    }

    .portal-newsletter-slot {
        margin-top: 64px;
    }
}
</style>

<!-- 非 scoped：门户根节点需要承载主题变量，scoped 选择器无法命中根级属性 -->
<style lang="less">
.portal-layout {
    // 顶栏底色由主题的页面底色派生，保证 各套预设都跟随；
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
