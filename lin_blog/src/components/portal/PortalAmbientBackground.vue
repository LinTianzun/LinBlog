<template>
    <!-- 环境背景层：非首页用模糊低透明度轮播 + 渐变遮罩，与首页共享 index/timestamp -->
    <div class="portal-ambient" aria-hidden="true">
        <template v-for="(slide, i) in slides" :key="slide.id">
            <div
                v-if="shouldRenderSlide(i, currentIndex, slides.length)"
                class="portal-ambient-slide"
                :class="{ active: i === currentIndex }"
                :style="{ backgroundImage: themeGradient(slide) }"
            >
                <!--
                    这是低透明度的装饰层，永远不参与 LCP 竞争：
                    fetchpriority=low 让浏览器把带宽留给卡片与正文图片。
                -->
                <img
                    class="portal-ambient-photo"
                    :src="bannerSrc(slide.image)"
                    :srcset="bannerSrcset(slide.image)"
                    sizes="100vw"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    fetchpriority="low"
                    decoding="async"
                />
            </div>
        </template>
        <div class="portal-ambient-mask" />
    </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'
import {
    BANNER_SLIDES,
    type BannerSlide,
    bannerSrc,
    bannerSrcset,
    deriveCurrentIndex,
    shouldRenderSlide,
    startBannerRotation,
    subscribeBanner,
} from '../../utils/portalBanner'
import { useThemeDark } from '../../utils/themeMode'

const props = withDefaults(defineProps<{
    intensity?: number
}>(), {
    intensity: 0.18
})

const slides = BANNER_SLIDES
const currentIndex = ref(0)
// 与 themePreset 共用同一存储键，避免组件重新挂载时把 data-theme 覆写成空串
const isDark = useThemeDark()

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

.portal-ambient-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
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

// 渐变主题：与首页 hero 同手法——把页面渐变本尊按遮罩淡入，
// 并固定到视口，保证与 #app.is-portal 的页面底色严格连续
.portal-ambient-mask::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--portal-page-gradient);
    background-attachment: fixed;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.5) 58%, #000 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.5) 58%, #000 100%);
}

@supports not (background: color-mix(in srgb, red 50%, blue)) {
    .portal-ambient-mask {
        background: var(--portal-page-bg);
    }
}
</style>
