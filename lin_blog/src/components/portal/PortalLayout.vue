<template>
    <div class="portal-layout">
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
                        :class="{ active: isActive(item.path) }">
                        {{ item.label }}
                    </RouterLink>
                </nav>

                <div class="nav-tools">
                    <!-- 主题切换：与后台设置共用同一套预设与 applyThemePreset，切换后双向同步。
                         原生 select 展开后的面板由系统绘制、无法定制样式，这里用自研面板 -->
                    <div ref="pickerRef" class="theme-picker">
                        <button type="button" class="theme-trigger" :class="{ open: themeOpen }"
                            :title="`当前主题：${activePresetName}`" aria-haspopup="listbox"
                            :aria-expanded="themeOpen" @click="toggleThemePanel"
                            @keydown.down.prevent="openThemePanel" @keydown.up.prevent="openThemePanel">
                            <span class="theme-dot" :style="{ background: activePresetPrimary }" aria-hidden="true" />
                            <span class="theme-name">{{ activePresetName }}</span>
                            <span class="theme-caret" aria-hidden="true">
                                <IconDownOutline />
                            </span>
                        </button>

                        <Transition name="theme-panel">
                            <div v-if="themeOpen" class="theme-panel portal-glass" role="listbox"
                                aria-label="选择主题">
                                <div class="theme-panel-head">
                                    <span>主题</span>
                                    <span class="theme-panel-hint">{{ themePresets.length }} 套</span>
                                </div>
                                <ul class="theme-options">
                                    <li v-for="(preset, index) in themePresets" :key="preset.id">
                                        <button type="button" class="theme-option" role="option"
                                            :class="{ active: preset.id === activePresetId }"
                                            :aria-selected="preset.id === activePresetId"
                                            :style="{ animationDelay: `${Math.min(index, 10) * 24}ms` }"
                                            @click="selectPreset(preset.id)">
                                            <!-- 渐变主题用 preview，其余用主色+底色拼出预览块 -->
                                            <span class="option-swatch"
                                                :style="{ background: preset.preview || `linear-gradient(135deg, ${preset.primary}, ${preset.background})` }"
                                                aria-hidden="true" />
                                            <span class="option-name">{{ preset.name }}</span>
                                            <span class="option-tick" aria-hidden="true">
                                                <IconTickOutline />
                                            </span>
                                        </button>
                                    </li>
                                </ul>
                            </div>
                        </Transition>
                    </div>

                    <button type="button" class="nav-action" @click="goAdmin">
                        进入后台
                    </button>
                </div>
            </div>
        </header>

        <main class="portal-body">
            <slot />
        </main>

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
import { onMounted, onUnmounted, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import unityLogo from '../../assets/svg/unity.svg'
import PortalAmbientBackground from './PortalAmbientBackground.vue'
import { themePresets, findPreset } from '../../utils/themes'
import { applyThemePreset, getStoredPresetId } from '../../utils/themePreset'

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
    { label: '随笔', path: '/portal/diary' },
    { label: '留言', path: '/portal/messages' }
]

const isActive = (path: string): boolean => {
    const target = props.activePath || route.path
    if (path === '/portal') return target === '/portal'
    return target.startsWith(path)
}

const year = computed(() => new Date().getFullYear())

// 主题预设：与后台设置共用同一份数据与切换函数，
// applyThemePreset 会派发事件，后台设置页监听后可同步高亮
const activePresetId = ref(getStoredPresetId())
const activePresetName = computed(() => findPreset(activePresetId.value).name)
// 预览点用当前预设的主色，切换后即时反映
const activePresetPrimary = computed(() => findPreset(activePresetId.value).primary)

// 自研下拉面板的开关：原生 select 的展开面板由系统绘制，无法与门户玻璃风格统一
const pickerRef = ref<HTMLElement | null>(null)
const themeOpen = ref(false)

const openThemePanel = () => {
    themeOpen.value = true
}
const toggleThemePanel = () => {
    themeOpen.value = !themeOpen.value
}

// 选择主题后立即收起面板；真正的应用逻辑仍走 applyThemePreset，保持与后台双向同步
const selectPreset = (presetId: string) => {
    activePresetId.value = presetId
    applyThemePreset(presetId)
    themeOpen.value = false
}

// 点击面板外部收起
onClickOutside(pickerRef, () => {
    themeOpen.value = false
})

// Esc 收起，符合浮层键盘习惯
const onGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') themeOpen.value = false
}

// 后台改主题后同步门户下拉框的选中项
const onPresetChange = (event: Event) => {
    const presetId = (event as CustomEvent<{ presetId: string }>).detail?.presetId
    if (presetId) activePresetId.value = presetId
}

onMounted(() => {
    window.addEventListener('theme:preset-change', onPresetChange)
    window.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
    window.removeEventListener('theme:preset-change', onPresetChange)
    window.removeEventListener('keydown', onGlobalKeydown)
})

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
    transition: all var(--portal-transition-fast);

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
    transition: all var(--portal-transition-fast);

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

// 主题下拉：与「进入后台」等高对齐，用描边式造型区分主次
//（主按钮实心、下拉描边），原生 select 保留键盘可达性
.theme-picker {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    // 与 .nav-action 的 40px 等高，并排时不出现高低错位
    height: 40px;
    padding: 0 14px;
    border-radius: var(--portal-radius-pill);
    // 玻璃底 + 主色描边，比纯白板更有质感
    background: var(--portal-surface);
    backdrop-filter: blur(var(--portal-blur-glass));
    -webkit-backdrop-filter: blur(var(--portal-blur-glass));
    border: 1px solid var(--portal-accent-soft);
    color: var(--portal-text-primary);
    cursor: pointer;
    transition: all var(--portal-transition-fast);

    &:hover {
        border-color: var(--portal-accent);
        background: var(--portal-surface-hover);
        transform: translateY(-1px);
        box-shadow: var(--portal-shadow-soft);
    }

    &:focus-within {
        border-color: var(--portal-accent);
        // 柔和主色光圈替代生硬的默认描边
        box-shadow: 0 0 0 3px var(--portal-accent-soft);
    }
}

// 当前主题的基色预览点，切换后即时可见
.theme-dot {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    // 细描边让浅色圆点在浅底上也分辨得出
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--portal-text-secondary) 30%, transparent),
        inset 0 1px 2px rgba(0, 0, 0, 0.12);
    transition: background var(--portal-transition-medium);
}
.theme-trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: color var(--portal-transition-fast);

    &:focus-visible {
        outline: none;
        color: var(--portal-accent);
    }

    // 展开时箭头翻转
    .theme-caret {
        transition: transform var(--portal-transition-fast), color var(--portal-transition-fast);
    }

    &.open .theme-caret {
        color: var(--portal-accent);
        transform: rotate(180deg);
    }
}

.theme-name {
    max-width: 96px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.theme-caret {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--portal-text-tertiary);
}

// 自研下拉面板：玻璃拟态 + 门户 token
.theme-panel {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    z-index: 40;
    width: 248px;
    padding: 10px;
    border-radius: var(--portal-radius-card);
    transform-origin: top right;
}

.theme-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 8px;
    font-size: 12px;
    color: var(--portal-text-secondary);

    .theme-panel-hint {
        padding: 1px 8px;
        border-radius: 999px;
        background: var(--portal-accent-soft);
        color: var(--portal-accent);
        font-size: 11px;
        opacity: 1;
    }
}

.theme-options {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 340px;
    overflow-y: auto;
    // 细滚动条：默认滚动条在玻璃面板上太重，尤其暗色下会割裂画面
    scrollbar-width: thin;
    scrollbar-color: var(--portal-accent-soft) transparent;

    &::-webkit-scrollbar {
        width: 6px;
    }

    &::-webkit-scrollbar-track {
        background: transparent;
    }

    &::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: color-mix(in srgb, var(--portal-text-secondary) 32%, transparent);

        &:hover {
            background: color-mix(in srgb, var(--portal-text-secondary) 52%, transparent);
        }
    }
}

.theme-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    border-radius: var(--portal-radius-small);
    color: var(--portal-text-primary);
    font-size: 13px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background var(--portal-transition-fast), color var(--portal-transition-fast);

    &:hover,
    &:focus-visible {
        background: var(--portal-accent-soft);
        outline: none;
    }

    &.active {
        color: var(--portal-accent);
        font-weight: 600;

        .option-tick {
            opacity: 1;
        }
    }

    animation: theme-option-in var(--portal-transition-medium) both;
}

.option-swatch {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--portal-text-secondary) 24%, transparent);
}

.option-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.option-tick {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    font-size: 14px;
    color: var(--portal-accent);
    opacity: 0;
    transition: opacity var(--portal-transition-fast);
}

.theme-panel-enter-active,
.theme-panel-leave-active {
    transition: opacity var(--portal-transition-fast), transform var(--portal-transition-fast);
}

.theme-panel-enter-from,
.theme-panel-leave-to {
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
}

@keyframes theme-option-in {
    from {
        opacity: 0;
        transform: translateY(4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
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

    .theme-picker {
        height: 34px;
        padding: 0 10px;
        gap: 0;

        .theme-name {
            display: none;
        }
    }

    // 窄屏：面板右对齐触发器，宽度按视口收敛，避免贴边溢出
    .theme-panel {
        width: min(248px, calc(100vw - 32px));
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
