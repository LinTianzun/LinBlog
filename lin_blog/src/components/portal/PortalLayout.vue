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
                    <RouterLink v-for="item in links" :key="item.path" :to="item.path" class="nav-link"
                        :class="{ active: isActive(item.path) }">
                        {{ item.label }}
                    </RouterLink>
                </nav>

                <div class="nav-tools">
                    <!-- 主题切换：与后台设置共用同一套预设与 applyThemePreset，切换后双向同步 -->
                    <label class="theme-picker" :title="`当前主题：${activePresetName}`">
                        <!-- 小圆点预览当前主题的基色，切换后即时可见 -->
                        <span class="theme-dot" :style="{ background: activePresetPrimary }" aria-hidden="true" />
                        <select v-model="activePresetId" class="theme-select" aria-label="切换主题"
                            @change="onPresetSelect">
                            <option v-for="preset in themePresets" :key="preset.id" :value="preset.id">
                                {{ preset.name }}
                            </option>
                        </select>
                        <span class="theme-caret" aria-hidden="true">
                            <IconDownOutline />
                        </span>
                    </label>

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
import { onMounted, onUnmounted, ref } from 'vue'
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

// 后台改主题后同步门户下拉框的选中项
const onPresetChange = (event: Event) => {
    const presetId = (event as CustomEvent<{ presetId: string }>).detail?.presetId
    if (presetId) activePresetId.value = presetId
}

// 下拉框变更 → 应用主题（内部同步 data-theme 与 data-theme-preset）
const onPresetSelect = () => {
    applyThemePreset(activePresetId.value)
}

onMounted(() => {
    window.addEventListener('theme:preset-change', onPresetChange)
})

onUnmounted(() => {
    window.removeEventListener('theme:preset-change', onPresetChange)
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

// 顶栏右侧工具区：主题切换在选择「进入后台」左侧
.nav-tools {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    margin-left: auto;
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

.theme-select {
    appearance: none;
    -webkit-appearance: none;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    // 右侧留出让位给箭头，避免文字贴边
    padding: 0 2px;
    width: 76px;
    text-align: left;
    text-overflow: ellipsis;

    &:focus {
        outline: none;
    }

    // 展开后的选项由系统绘制，这里只保证文字在明暗下都可读
    option {
        color: #333;
        background: #fff;
    }
}

.theme-caret {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--portal-text-tertiary);
    pointer-events: none;
    transition: transform var(--portal-transition-fast), color var(--portal-transition-fast);
}

.theme-picker:hover .theme-caret {
    color: var(--portal-accent);
    transform: translateY(1px);
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
    }

    .theme-select {
        width: 0;
        padding: 0;
        overflow: hidden;
    }

    .theme-caret {
        display: none;
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
