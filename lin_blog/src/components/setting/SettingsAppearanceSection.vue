<template>
    <!-- ── 外观 ── -->
    <section id="set-appearance" class="set-section settings-appearance">
        <header class="set-section-head">
            <yk-title :level="4" style="margin: 0">外观</yk-title>
            <yk-text type="secondary">
                当前：{{ activePreset?.name }}（{{ activePreset?.base === 'dark' ? '深色' : '浅色' }}）
            </yk-text>
        </header>

        <div class="set-card">
            <div class="set-subhead">
                <span class="set-label">明暗基调</span>
                <div class="set-mode-switch">
                    <button type="button" class="set-mode" :class="{ 'is-active': !isDark }"
                        @click="switchMode('light')">
                        <IconSunFill />浅色
                    </button>
                    <button type="button" class="set-mode" :class="{ 'is-active': isDark }"
                        @click="switchMode('dark')">
                        <IconMoonFill />深色
                    </button>
                </div>
            </div>

            <!-- 描边强度只对渐变主题生效，纯色主题下整段隐藏 -->
            <div v-if="isGradient" class="set-subhead">
                <span class="set-label">卡片描边</span>
                <yk-text type="tertiary">控制卡片边缘的渐变光圈</yk-text>
            </div>

            <div v-if="isGradient" class="set-card set-edge">
                <div class="set-edge-options">
                    <button v-for="level in edgeLevels" :key="level" type="button" class="set-edge-option"
                        :class="{ 'is-active': level === edgeLevel }"
                        @click="selectEdgeLevel(level)">
                        <span class="set-edge-ring" :data-level="level">
                            <span class="set-edge-core" />
                        </span>
                        <span class="set-edge-name">{{ edgeLevelLabels[level] }}</span>
                    </button>
                </div>
                <p class="set-edge-hint">
                    {{ edgeLevel === 0 ? '已关闭，卡片为普通边框' : '描边随主题色在卡片边缘流动' }}
                </p>
            </div>

            <div v-for="group in presetGroups" :key="group.key" class="set-theme-group">
                <div class="set-subhead">
                    <span class="set-label">{{ group.label }}</span>
                    <yk-text type="tertiary">
                        {{ isDark ? '深色' : '浅色' }}系 · 共 {{ group.items.length }} 套
                    </yk-text>
                </div>

                <div class="set-themes">
                    <button v-for="preset in group.items" :key="preset.id" type="button"
                        class="set-theme" :class="{
                            'is-active': preset.id === activePresetId,
                            'is-gradient': preset.kind === 'gradient'
                        }" @click="selectTheme(preset.id)">
                        <span class="set-theme-swatch" :style="swatchStyle(preset)">
                            <span class="set-theme-dot" :style="{ background: preset.primary }" />
                            <span v-if="preset.kind === 'gradient'" class="set-theme-kind">渐变</span>
                        </span>
                        <span class="set-theme-name">{{ preset.name }}</span>
                        <IconTickOutline v-if="preset.id === activePresetId" class="set-theme-check" />
                    </button>
                </div>
            </div>
        </div>

        <div class="set-subhead">
            <span class="set-label">我的宠物</span>
            <yk-text type="tertiary">
                仅本机生效；静态模式可在桌宠菜单中开启，养成状态与展示行为请前往「宠物管理」
            </yk-text>
        </div>

        <div class="set-card set-pet set-local-pet">
            <div class="set-pet-row">
                <div class="set-pet-copy">
                    <strong>本机隐藏桌宠</strong>
                    <p>隐藏后会在右下角保留一个小爪印，随时可以点回来。</p>
                </div>
                <yk-switch :model-value="visitorPrefs.hidden" :checked-value="true"
                    :unchecked-value="false" @update:model-value="setLocalHidden" />
            </div>

            <div class="set-pet-row">
                <div class="set-pet-copy">
                    <strong>夜间安静时段</strong>
                    <p>
                        时段内不漫游、不碎碎念，并自动入睡。
                        {{ quietActive ? '当前正处于安静时段。' : '当前不在安静时段。' }}
                    </p>
                </div>
                <yk-switch :model-value="visitorPrefs.quietHoursEnabled" :checked-value="true"
                    :unchecked-value="false" @update:model-value="setQuietEnabled" />
            </div>

            <div v-if="visitorPrefs.quietHoursEnabled" class="set-pet-row">
                <div class="set-pet-copy">
                    <strong>安静时间</strong>
                    <p>支持跨零点，例如 23:00 至次日 07:00。</p>
                </div>
                <div class="set-pet-time">
                    <input type="time" :value="visitorPrefs.quietStart" aria-label="安静时段开始时间"
                        @change="setQuietStart" />
                    <span>至</span>
                    <input type="time" :value="visitorPrefs.quietEnd" aria-label="安静时段结束时间"
                        @change="setQuietEnd" />
                </div>
            </div>

            <div class="set-pet-row">
                <div class="set-pet-copy">
                    <strong>重置本机偏好</strong>
                    <p>清除本机隐藏与安静时段，恢复默认问候设置；养成状态会保留。</p>
                </div>
                <yk-button type="secondary" size="s" @click="resetLocalPetPrefs">
                    恢复默认
                </yk-button>
            </div>
        </div>
    </section>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, onUnmounted, reactive } from 'vue'
import { themePresets, type ThemePreset } from '../../utils/themes'
import {
    applyThemePreset,
    applyEdgeLevel,
    getStoredPresetId,
    getStoredEdgeLevel,
    EDGE_LEVELS,
    EDGE_LEVEL_LABELS,
    type EdgeLevel
} from '../../utils/themePreset'
import {
    DEFAULT_VISITOR_PET_PREFERENCES,
    getVisitorPetPreferences,
    isWithinQuietHours,
    onVisitorPetPreferencesChange,
    setVisitorPetPreferences,
    type VisitorPetPreferences,
} from '../../utils/desktopPetVisitor'
import { IconMoonFill, IconSunFill, IconTickOutline } from '@yike-design/ui/es/components/svg-icon'

const proxy = getCurrentInstance()?.proxy

// ── 主题 ──
const activePresetId = defineModel<string>('presetId', { required: true })
const edgeLevel = defineModel<EdgeLevel>('edgeLevel', { required: true })
const edgeLevels = EDGE_LEVELS
const edgeLevelLabels = EDGE_LEVEL_LABELS

const activePreset = computed(() =>
    themePresets.find(p => p.id === activePresetId.value) || themePresets[0]
)
const isDark = computed(() => activePreset.value.base === 'dark')
// 描边是渐变主题的专属装饰，纯色主题下没有可调节的对象
const isGradient = computed(() => activePreset.value.kind === 'gradient')

// 主题配色先按当前基调过滤，再按纯色/渐变分段：
// 浅色 tab 只出浅色系，深色 tab 只出深色系，同基调内渐变色系单独成组
const presetGroups = computed(() => {
    const matched = themePresets.filter(p => p.base === activePreset.value.base)
    return [
        { key: 'solid', label: '纯色系', items: matched.filter(p => (p.kind || 'solid') === 'solid') },
        { key: 'gradient', label: '渐变系', items: matched.filter(p => p.kind === 'gradient') }
    ].filter(group => group.items.length > 0)
})

const selectTheme = (presetId: string) => {
    if (presetId === activePresetId.value) return
    applyThemePreset(presetId)
    activePresetId.value = presetId
}

const selectEdgeLevel = (level: EdgeLevel) => {
    if (level === edgeLevel.value) return
    edgeLevel.value = applyEdgeLevel(level)
}

// 明暗切换：切到该基调的第一套配色，列表随之换成对应系别的卡片
const switchMode = (mode: 'light' | 'dark') => {
    if (isDark.value === (mode === 'dark')) return
    const candidate = themePresets.find(p => p.base === mode)
    if (candidate) selectTheme(candidate.id)
}

const swatchStyle = (preset: ThemePreset) => ({
    background: preset.preview || preset.background,
})

// ── 本机宠物偏好：不写入服务器，所有登录用户都可自由调整 ──
const visitorPrefs = reactive<VisitorPetPreferences>(getVisitorPetPreferences())
const quietActive = computed(() => isWithinQuietHours(visitorPrefs))
const unsubscribeVisitorPrefs = onVisitorPetPreferencesChange((next) => {
    Object.assign(visitorPrefs, next)
})

const updateVisitorPrefs = (patch: Partial<VisitorPetPreferences>) => {
    Object.assign(visitorPrefs, setVisitorPetPreferences(patch))
}
const setLocalHidden = (value: boolean | string | number) =>
    updateVisitorPrefs({ hidden: value === true || value === 1 || value === 'true' })
const setQuietEnabled = (value: boolean | string | number) =>
    updateVisitorPrefs({
        quietHoursEnabled: value === true || value === 1 || value === 'true',
    })
const setQuietStart = (event: Event) => {
    updateVisitorPrefs({ quietStart: (event.target as HTMLInputElement).value })
}
const setQuietEnd = (event: Event) => {
    updateVisitorPrefs({ quietEnd: (event.target as HTMLInputElement).value })
}
const resetLocalPetPrefs = () => {
    updateVisitorPrefs({ ...DEFAULT_VISITOR_PET_PREFERENCES })
    proxy?.$message?.({ type: 'success', message: '本机桌宠偏好已恢复默认' })
}

// 顶栏快捷明暗切换会回落到默认主题，这里同步卡片选中态
const onPresetChange = (event: Event) => {
    const presetId = (event as CustomEvent<{ presetId: string }>).detail?.presetId
    if (presetId) activePresetId.value = presetId
}

onMounted(() => {
    if (!activePresetId.value) activePresetId.value = getStoredPresetId()
    if (edgeLevel.value === undefined) edgeLevel.value = getStoredEdgeLevel()
    window.addEventListener('theme:preset-change', onPresetChange)
})
onUnmounted(() => {
    window.removeEventListener('theme:preset-change', onPresetChange)
    unsubscribeVisitorPrefs()
})
</script>

<style lang="less" scoped>
// 外观分区样式：与系统设置页共享 .set-* 设计变量。
// scoped 样式在编译后同样会带上本组件独有的 data-v 属性，子元素全都能命中，
// 因此这里保持与拆分前一致的 .set-* 选择器，不再依赖父页面 :deep()，
// 也不会有全局污染。
.settings-appearance {
    gap: @space-l;
}

.set-card {
    display: flex;
    flex-direction: column;
    gap: @space-m;
    padding: 22px 24px;
    border-radius: var(--admin-radius, 18px);
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
    box-sizing: border-box;
}

.set-subhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.set-label {
    display: block;
    color: var(--admin-text, var(--gray));
    font-size: 13px;
    font-weight: 600;
}

.set-mode-switch {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 999px;
    background: var(--bgColor2);
}

.set-mode {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 18px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--admin-muted, var(--gray6));
    font-size: 13px;
    cursor: pointer;
    transition: all 0.18s ease;

    .yk-icon {
        width: 15px;
        height: 15px;
    }

    &.is-active {
        background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
        color: #fff;
        font-weight: 600;
        box-shadow: 0 4px 12px var(--pcolor3);
    }
}

// ── 卡片描边强度 ──
// 预览环复用真实的 --lin-edge-* 变量：切等级时预览与页面卡片同步变化，
// 而不是另写一套仅供展示的色值
.set-edge-options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.set-edge-option {
    display: flex;
    flex: 1 1 96px;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px 6px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: var(--admin-radius-sm, 12px);
    background: var(--admin-surface-soft, var(--bgColor2));
    cursor: pointer;
    transition: border-color 0.2s ease, transform 0.2s ease;

    &:hover {
        transform: translateY(-2px);
    }

    &.is-active {
        border-color: var(--pcolor);
        box-shadow: 0 0 0 3px var(--pcolor2);
    }
}

.set-edge-ring {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--admin-surface, var(--bgColor1));
}

// 预览环按等级直接改宽度变量，让同一套 mask 规则画出粗细不同的边
.set-edge-ring[data-level='0'] {
    --lin-edge-width: 0px;
}

.set-edge-ring[data-level='1'] {
    --lin-edge-width: 1px;
}

.set-edge-ring[data-level='2'] {
    --lin-edge-width: 1.5px;
}

.set-edge-ring[data-level='3'] {
    --lin-edge-width: 2px;
}

.set-edge-core {
    position: relative;
    isolation: isolate;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    background: var(--admin-surface, var(--bgColor1));

    &::before {
        position: absolute;
        inset: 0;
        z-index: -1;
        content: '';
        border-radius: inherit;
        padding: var(--lin-edge-width);
        background: var(--lin-edge-gradient, transparent);
        -webkit-mask: linear-gradient(#000, #000) content-box, linear-gradient(#000, #000);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#000, #000) content-box, linear-gradient(#000, #000);
        mask-composite: exclude;
    }
}

.set-edge-name {
    color: var(--admin-text, var(--gray));
    font-size: 12px;
}

.set-edge-hint {
    margin: 0;
    color: var(--admin-muted, var(--gray6));
    font-size: 12px;
}

.set-theme-group+.set-theme-group {
    margin-top: @space-m;
}

.set-pet {
    display: flex;
    flex-direction: column;
    gap: @space-m;
}

.set-pet-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: @space-l;

    & + & {
        padding-top: @space-m;
        border-top: 1px solid var(--admin-line, var(--gray1));
    }
}

.set-pet-time {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 8px;
    color: var(--font-color3);
    font-size: 12px;

    input {
        padding: 6px 10px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 8px;
        background: var(--bgColor2);
        color: var(--font-color1);
        font-family: inherit;
        font-size: 13px;
    }
}

.set-pet-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;

    strong {
        font-size: 14px;
        color: var(--font-color1);
    }

    p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--font-color3);
    }
}

.set-themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(126px, 1fr));
    gap: @space-m;
}

.set-theme {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 2px solid transparent;
    border-radius: var(--admin-radius-sm, 12px);
    background: var(--bgColor2);
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;

    &:hover {
        transform: translateY(-2px);
        box-shadow: var(--admin-shadow-sm, @shadow-s);
    }

    &.is-active {
        border-color: var(--pcolor);
        box-shadow: 0 0 0 3px var(--pcolor2);
    }
}

.set-theme-swatch {
    position: relative;
    display: block;
    height: 52px;
    overflow: hidden;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 8px;
}

.set-theme-dot {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.35);
}

.set-theme-kind {
    position: absolute;
    right: 4px;
    bottom: 4px;
    padding: 1px 5px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.42);
    color: #fff;
    font-size: 10px;
    line-height: 1.5;
    letter-spacing: 0.04em;
}

.set-theme-name {
    color: var(--admin-text, var(--gray));
    font-size: 12px;
    text-align: center;
}

.set-theme-check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 16px;
    height: 16px;
    padding: 2px;
    border-radius: 50%;
    background: var(--pcolor);
    color: #fff;
}

@media (max-width: 700px) {
    .set-pet-row {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
    }

    .set-pet-time {
        flex-wrap: wrap;
        justify-content: flex-start;
    }
}

@media (prefers-reduced-motion: reduce) {
    .set-theme {
        transition: none;
    }

    .set-theme:hover {
        transform: none;
    }
}
</style>

