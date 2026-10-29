<!--
    图片灯箱：前台与后台共用。
    焦点在打开时移入容器内，Esc / 左右键翻页；点击图片外的暗区关闭。
-->
<template>
    <Teleport to="body">
        <Transition name="lightbox">
            <div v-if="open" ref="rootRef" class="content-lightbox" role="dialog" aria-modal="true"
                :aria-label="`图片 ${index + 1} / ${photos.length}`" tabindex="-1" @click.self="close"
                @keydown.esc.prevent="close" @keydown.left.prevent="step(-1)"
                @keydown.right.prevent="step(1)">
                <button type="button" class="content-lb-close" aria-label="关闭" @click="close">
                    <IconCrossOutline />
                </button>

                <button v-if="index > 0" type="button" class="content-lb-nav is-prev" aria-label="上一张"
                    @click="step(-1)">
                    <IconRightOutline class="is-flipped" />
                </button>

                <div class="content-lb-stage" @click.self="close">
                    <img v-if="photos[index]" :key="index" :src="photos[index]"
                        :alt="`${title || '图片'} - ${index + 1}`" />
                </div>

                <button v-if="index < photos.length - 1" type="button" class="content-lb-nav is-next"
                    aria-label="下一张" @click="step(1)">
                    <IconRightOutline />
                </button>

                <div class="content-lb-counter">{{ index + 1 }} / {{ photos.length }}</div>
            </div>
        </Transition>
    </Teleport>
</template>

<script lang="ts" setup>
import { nextTick, ref, watch } from 'vue'
import {
    IconCrossOutline,
    IconRightOutline,
} from '@yike-design/ui/es/components/svg-icon'

const props = defineProps<{
    open: boolean
    photos: string[]
    index: number
    title?: string
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'update:index', value: number): void
}>()

const rootRef = ref<HTMLElement | null>(null)

const close = (): void => emit('close')

const step = (delta: number): void => {
    const next = props.index + delta
    if (next < 0 || next >= props.photos.length) return
    emit('update:index', next)
}

// 打开后把焦点移进灯箱，键盘翻页才生效（否则焦点还在背后的按钮上）
watch(() => props.open, async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    rootRef.value?.focus()
})
</script>

<style lang="less" scoped>
.content-lightbox {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: grid;
    place-items: center;
    background: rgba(8, 10, 14, 0.92);
    outline: none;
}

.content-lb-stage {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 64px clamp(24px, 8vw, 96px);
    box-sizing: border-box;

    img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 6px;
        animation: lightbox-in 260ms cubic-bezier(0.22, 1, 0.36, 1);
    }
}

.content-lb-close,
.content-lb-nav {
    position: absolute;
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    cursor: pointer;
    transition: background 160ms ease, transform 160ms ease;

    &:hover {
        background: rgba(255, 255, 255, 0.18);
        transform: scale(1.05);
    }

    :deep(svg) {
        width: 20px;
        height: 20px;
    }
}

.content-lb-close {
    top: 20px;
    right: 20px;
}

.content-lb-nav {
    top: 50%;
    margin-top: -21px;

    &.is-prev {
        left: clamp(12px, 3vw, 28px);
    }

    &.is-next {
        right: clamp(12px, 3vw, 28px);
    }

    .is-flipped {
        transform: rotate(180deg);
    }
}

.content-lb-counter {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 5px 14px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.45);
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
}

@keyframes lightbox-in {
    from {
        opacity: 0;
        transform: scale(0.97);
    }

    to {
        opacity: 1;
        transform: scale(1);
    }
}

.lightbox-enter-active,
.lightbox-leave-active {
    transition: opacity 200ms ease;
}

.lightbox-enter-from,
.lightbox-leave-to {
    opacity: 0;
}

@media (max-width: 640px) {
    .content-lb-nav {
        width: 38px;
        height: 38px;
    }
}

@media (prefers-reduced-motion: reduce) {
    .content-lb-stage img {
        animation: none;
    }
}
</style>
