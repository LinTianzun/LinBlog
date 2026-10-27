<template>
    <!-- 环境背景层：非首页用模糊低透明度轮播 + 渐变遮罩，与首页共享 index/timestamp -->
    <div class="portal-ambient" aria-hidden="true">
        <div
            v-for="(slide, i) in slides"
            :key="slide.id"
            class="portal-ambient-slide"
            :class="{ active: i === currentIndex }"
            :style="{ backgroundImage: `url(${slide.image}), ${themeGradient(slide)}` }"
        />
        <div class="portal-ambient-mask" />
    </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { BANNER_SLIDES, type BannerSlide, deriveCurrentIndex, startBannerRotation, subscribeBanner } from '../../utils/portalBanner'
import { useDark } from '@vueuse/core'

const props = withDefaults(defineProps<{
    intensity?: number
}>(), {
    intensity: 0.18
})

const slides = BANNER_SLIDES
const currentIndex = ref(0)
const isDark = useDark({ attribute: 'data-theme', selector: 'html' })

const themeGradient = (slide: BannerSlide): string => {
    return isDark.value ? slide.gradient.dark : slide.gradient.light
}

let unsub: (() => void) | null = null
let stopRotation: (() => void) | null = null

onMounted(() => {
    currentIndex.value = deriveCurrentIndex()
    stopRotation = startBannerRotation((idx) => {
        currentIndex.value = idx
    })
    unsub = subscribeBanner((idx) => {
        currentIndex.value = idx
    })
})

onUnmounted(() => {
    stopRotation?.()
    unsub?.()
})
</script>

<style lang="less" scoped>
.portal-ambient {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    opacity: v-bind('props.intensity');
    backdrop-filter: blur(var(--portal-ambient-blur));
    -webkit-backdrop-filter: blur(var(--portal-ambient-blur));
}

.portal-ambient-slide {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity var(--portal-transition-slow) ease;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;

    &.active {
        opacity: 1;
    }
}

.portal-ambient-mask {
    position: absolute;
    inset: 0;
    background: linear-gradient(
        to bottom,
        transparent 0%,
        color-mix(in srgb, var(--portal-page-bg) 40%, transparent) 60%,
        var(--portal-page-bg) 100%
    );
}

@supports not (background: color-mix(in srgb, red 50%, blue)) {
    .portal-ambient-mask {
        background: var(--portal-page-bg);
    }
}
</style>
