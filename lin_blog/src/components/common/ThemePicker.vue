<template>
    <div ref="pickerRef" class="theme-picker">
        <button ref="themeTriggerRef" type="button" class="theme-trigger" :class="{ open: themeOpen }"
            :title="`当前主题：${activePresetName}`" aria-haspopup="listbox" :aria-expanded="themeOpen"
            @click="toggleThemePanel" @keydown.down.prevent="openThemePanel('current')"
            @keydown.up.prevent="openThemePanel('last')">
            <span class="theme-dot" :style="{ background: activePresetPrimary }" aria-hidden="true" />
            <span class="theme-name">{{ activePresetName }}</span>
            <span class="theme-caret" aria-hidden="true">
                <IconDownOutline />
            </span>
        </button>

        <Transition name="theme-panel">
            <div v-if="themeOpen" class="theme-panel" role="listbox" aria-label="选择主题">
                <div class="theme-panel-head">
                    <span>主题</span>
                    <span class="theme-panel-hint">{{ themePresets.length }} 套</span>
                </div>
                <ul ref="themeListRef" class="theme-options" @keydown="onThemeListKeydown">
                    <li v-for="(preset, index) in themePresets" :key="preset.id" role="presentation">
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
                            <span v-if="preset.kind === 'gradient'" class="option-kind">渐变</span>
                            <span class="option-tick" aria-hidden="true">
                                <IconTickOutline />
                            </span>
                        </button>
                    </li>
                </ul>
            </div>
        </Transition>
    </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { IconDownOutline, IconTickOutline } from '@yike-design/ui/es/components/svg-icon'
import { findPreset, themePresets } from '../../utils/themes'
import { applyThemePreset, getStoredPresetId } from '../../utils/themePreset'

/**
 * 主题选择下拉：门户顶栏与后台顶栏共用。
 *
 * 只承担「选主题 + 键盘交互」；外观全部交给使用方的 CSS 变量，
 * 这样门户可以保持玻璃拟态、后台保持扁平按钮，而不必维护两份逻辑。
 *
 * 可定制变量（未设置时用组件的通用兜底值）：
 *   --theme-picker-panel-bg / --theme-picker-panel-border / --theme-picker-panel-radius
 *   --theme-picker-accent / --theme-picker-accent-soft
 *   --theme-picker-text / --theme-picker-text-secondary
 */
const activePresetId = ref(getStoredPresetId())
const activePreset = computed(() => findPreset(activePresetId.value))
const activePresetName = computed(() => activePreset.value.name)
const activePresetPrimary = computed(() => activePreset.value.primary)

const pickerRef = ref<HTMLElement | null>(null)
const themeTriggerRef = ref<HTMLButtonElement | null>(null)
const themeListRef = ref<HTMLElement | null>(null)
const themeOpen = ref(false)

const themeOptions = (): HTMLButtonElement[] =>
    Array.from(themeListRef.value?.querySelectorAll<HTMLButtonElement>('.theme-option') ?? [])

const focusThemeOption = (index: number) => {
    const options = themeOptions()
    if (!options.length) return
    options[Math.min(Math.max(index, 0), options.length - 1)]?.focus()
}

// 打开面板后把焦点交给当前主题，键盘用户可直接用方向键浏览
const openThemePanel = async (position: 'current' | 'first' | 'last' = 'current') => {
    themeOpen.value = true
    await nextTick()
    const current = themePresets.findIndex(preset => preset.id === activePresetId.value)
    if (position === 'first') {
        focusThemeOption(0)
        return
    }
    if (position === 'last') {
        focusThemeOption(themePresets.length - 1)
        return
    }
    focusThemeOption(current >= 0 ? current : 0)
}

const toggleThemePanel = () => {
    if (themeOpen.value) {
        themeOpen.value = false
        return
    }
    void openThemePanel()
}

// 真正的应用逻辑仍走 applyThemePreset，保持门户与后台双向同步
const selectPreset = (presetId: string) => {
    activePresetId.value = presetId
    applyThemePreset(presetId)
    themeOpen.value = false
    void nextTick(() => themeTriggerRef.value?.focus())
}

// listbox 的 roving focus：方向键 / Home / End 在选项间移动，Esc 关闭并归还焦点
const onThemeListKeydown = (event: KeyboardEvent) => {
    const options = themeOptions()
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown') {
        event.preventDefault()
        focusThemeOption(current < 0 ? 0 : (current + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        focusThemeOption(current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length)
    } else if (event.key === 'Home') {
        event.preventDefault()
        focusThemeOption(0)
    } else if (event.key === 'End') {
        event.preventDefault()
        focusThemeOption(options.length - 1)
    } else if (event.key === 'Escape') {
        event.preventDefault()
        themeOpen.value = false
        void nextTick(() => themeTriggerRef.value?.focus())
    } else if (event.key === 'Tab') {
        themeOpen.value = false
    }
}

onClickOutside(pickerRef, () => {
    themeOpen.value = false
})

// Esc 收起，符合浮层键盘习惯（面板内没有焦点时也要能关）
const onGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !themeOpen.value) return
    themeOpen.value = false
    void nextTick(() => themeTriggerRef.value?.focus())
}

// 另一处（后台 / 门户 / 设置页）切换主题后同步选中项
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

defineExpose({ openThemePanel })
</script>

<style lang="less" scoped>
.theme-picker {
    position: relative;
    display: inline-flex;
    align-items: center;
}

.theme-trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 100%;
    padding: 0;
    border: none;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
}

.theme-caret {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    font-size: 12px;
    color: var(--theme-picker-text-secondary);
    transition: transform 180ms ease, color 180ms ease;

    .theme-trigger.open & {
        color: var(--theme-picker-accent);
        transform: rotate(180deg);
    }
}

.theme-dot {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-picker-text-secondary) 30%, transparent),
        inset 0 1px 2px rgba(0, 0, 0, 0.12);
    transition: background 250ms ease;
}

.theme-name {
    max-width: 96px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

// 下拉面板：外观由使用方变量决定，未设置时用中性兜底
.theme-panel {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    z-index: 40;
    width: 248px;
    padding: 10px;
    border: 1px solid var(--theme-picker-panel-border, transparent);
    border-radius: var(--theme-picker-panel-radius, 14px);
    background: var(--theme-picker-panel-bg, #fff);
    box-shadow: var(--theme-picker-panel-shadow, 0 16px 40px rgba(15, 23, 42, 0.16));
    transform-origin: top right;
}

.theme-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 8px;
    color: var(--theme-picker-text-secondary);
    font-size: 12px;

    .theme-panel-hint {
        padding: 1px 8px;
        border-radius: 999px;
        background: var(--theme-picker-accent-soft);
        color: var(--theme-picker-accent);
        font-size: 11px;
    }
}

.theme-options {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 340px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    scrollbar-width: thin;
    scrollbar-color: var(--theme-picker-accent-soft) transparent;

    &::-webkit-scrollbar {
        width: 6px;
    }

    &::-webkit-scrollbar-track {
        background: transparent;
    }

    &::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: color-mix(in srgb, var(--theme-picker-text-secondary) 32%, transparent);
    }
}

.theme-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--theme-picker-text);
    font-family: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    animation: theme-option-in 250ms cubic-bezier(0.22, 1, 0.36, 1) both;
    transition: background 160ms ease, color 160ms ease;

    &:hover {
        background: var(--theme-picker-accent-soft);
    }

    &:focus-visible {
        background: var(--theme-picker-accent-soft);
        outline: 2px solid var(--theme-picker-accent);
        outline-offset: -2px;
    }

    &.active {
        color: var(--theme-picker-accent);
        font-weight: 600;

        .option-tick {
            opacity: 1;
        }
    }
}

.option-swatch {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-picker-text-secondary) 24%, transparent);
}

.option-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

// 渐变主题的类型标记，与纯色主题区分
.option-kind {
    flex-shrink: 0;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--theme-picker-accent-soft);
    color: var(--theme-picker-accent);
    font-size: 11px;
    line-height: 16px;
}

.option-tick {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    color: var(--theme-picker-accent);
    font-size: 14px;
    opacity: 0;
    transition: opacity 160ms ease;
}

.theme-panel-enter-active,
.theme-panel-leave-active {
    transition: opacity 160ms ease, transform 160ms ease;
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

@media (prefers-reduced-motion: reduce) {
    .theme-option {
        animation: none;
    }

    .theme-panel-enter-active,
    .theme-panel-leave-active {
        transition: none;
    }
}
</style>
