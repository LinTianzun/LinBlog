<template>
    <span ref="triggerRef" class="confirm-popover-trigger" @click.stop="toggle">
        <slot />
    </span>

    <!-- 确认面板挂到 body：卡片普遍有 overflow:hidden 和 transform 层叠上下文，
         就地渲染的浮层会被裁掉或压住，Teleport 是唯一稳的做法 -->
    <Teleport to="body">
        <transition name="confirm-popover-fade">
            <div v-if="open" ref="panelRef" class="confirm-popover" :class="`is-${resolvedPlacement}`"
                :style="panelStyle" role="dialog" :aria-label="title" @click.stop>
                <p class="confirm-popover-title">{{ title }}</p>
                <p v-if="content" class="confirm-popover-content">{{ content }}</p>
                <div class="confirm-popover-actions">
                    <button type="button" class="confirm-popover-btn" @click="close">取消</button>
                    <button type="button" class="confirm-popover-btn is-danger" @click="confirm">确认</button>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

type Placement = 'top' | 'topRight' | 'bottom' | 'bottomRight' | 'leftTop'

const props = withDefaults(defineProps<{
    title: string
    content?: string
    placement?: Placement
}>(), {
    content: '',
    placement: 'topRight',
})

const emits = defineEmits<{
    (event: 'confirm'): void
    (event: 'cancel'): void
}>()

const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const open = ref(false)
const coords = ref({ top: 0, left: 0 })
// 上方空间不足时自动翻到下方，避免面板顶出视口
const flipped = ref(false)

const resolvedPlacement = computed<Placement>(() => {
    if (!flipped.value) return props.placement
    return props.placement === 'leftTop' ? 'bottomRight' : 'bottom'
})

const panelStyle = computed(() => ({
    top: `${coords.value.top}px`,
    left: `${coords.value.left}px`,
}))

const GAP = 8
const MARGIN = 8

const updatePosition = (): void => {
    const trigger = triggerRef.value
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const panel = panelRef.value
    const panelWidth = panel?.offsetWidth || 240
    const panelHeight = panel?.offsetHeight || 120

    const alignRight = props.placement === 'topRight' || props.placement === 'bottomRight' || props.placement === 'leftTop'
    let left = alignRight ? rect.right - panelWidth : rect.left
    left = Math.min(Math.max(MARGIN, left), window.innerWidth - panelWidth - MARGIN)

    // 上方放不下就翻到下方
    const wantTop = props.placement !== 'bottom' && props.placement !== 'bottomRight'
    const spaceAbove = rect.top - GAP - MARGIN
    const spaceBelow = window.innerHeight - rect.bottom - GAP - MARGIN
    const placeAbove = wantTop ? spaceAbove >= panelHeight || spaceAbove >= spaceBelow : false

    flipped.value = wantTop && !placeAbove
    const top = placeAbove ? rect.top - GAP - panelHeight : rect.bottom + GAP

    coords.value = { top, left }
}

const addListeners = (): void => {
    document.addEventListener('mousedown', onDocumentMouseDown, true)
    document.addEventListener('keydown', onKeydown, true)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
}

const removeListeners = (): void => {
    document.removeEventListener('mousedown', onDocumentMouseDown, true)
    document.removeEventListener('keydown', onKeydown, true)
    window.removeEventListener('resize', updatePosition)
    window.removeEventListener('scroll', updatePosition, true)
}

const onDocumentMouseDown = (event: MouseEvent): void => {
    const target = event.target as Node | null
    if (!target) return
    if (panelRef.value?.contains(target)) return
    if (triggerRef.value?.contains(target)) return
    close()
}

const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close()
}

const close = (): void => {
    if (!open.value) return
    open.value = false
    removeListeners()
}

const toggle = async (): Promise<void> => {
    if (open.value) {
        close()
        return
    }

    open.value = true
    await nextTick()
    updatePosition()
    // 面板尺寸拿到后再校正一次，避免首次定位偏一截
    await nextTick()
    updatePosition()
    addListeners()
}

const confirm = (): void => {
    close()
    emits('confirm')
}

onBeforeUnmount(removeListeners)
</script>

<style lang="less" scoped>
.confirm-popover-trigger {
    display: inline-flex;
}

.confirm-popover {
    position: fixed;
    z-index: 3000;
    width: 232px;
    padding: 14px 14px 10px;
    border: 1px solid var(--admin-line-strong, var(--gray3));
    border-radius: 12px;
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: 0 16px 44px rgba(12, 16, 24, 0.24);
    box-sizing: border-box;

    &-title {
        margin: 0;
        color: var(--admin-text, var(--gray));
        font-size: 14px;
        font-weight: 600;
        line-height: 1.5;
    }

    &-content {
        margin: 6px 0 0;
        color: var(--gray6);
        font-size: 12px;
        line-height: 1.7;
    }

    &-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 12px;
    }

    &-btn {
        padding: 5px 14px;
        border: 1px solid var(--admin-line-strong, var(--gray3));
        border-radius: 8px;
        background: transparent;
        color: var(--admin-text, var(--gray));
        font-size: 12px;
        cursor: pointer;
        transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;

        &:hover {
            border-color: var(--pcolor);
            color: var(--pcolor);
        }

        &.is-danger {
            border-color: color-mix(in srgb, var(--ecolor) 55%, transparent);
            background: color-mix(in srgb, var(--ecolor) 10%, transparent);
            color: var(--ecolor);

            &:hover {
                border-color: var(--ecolor);
                background: color-mix(in srgb, var(--ecolor) 18%, transparent);
            }
        }
    }
}

.confirm-popover-fade-enter-active,
.confirm-popover-fade-leave-active {
    transition: opacity 0.14s ease, transform 0.14s ease;
}

.confirm-popover-fade-enter-from,
.confirm-popover-fade-leave-to {
    opacity: 0;
    transform: translateY(4px);
}
</style>
