<!--
    内容详情头部：前台与后台的文章 / 图库 / 随笔详情共用。
    split 用于文章（文字 + 封面），immersive 用于图库（首图覆盖标题），
    plain 用于随笔（纯文字标题）。后台只额外挂管理操作，不改内容骨架。
-->
<template>
    <header class="content-detail-hero"
        :class="[`is-${variant}`, `density-${density}`, { 'has-cover': Boolean(cover) }]">
        <figure v-if="variant === 'immersive' && cover"
            class="content-detail-hero-media is-clickable"
            :class="`is-fit-${coverFit}`"
            @click="emit('cover-click')">
            <img :src="cover" :alt="title" loading="eager" @error="emit('cover-error')" />
            <span class="content-detail-hero-veil" aria-hidden="true"></span>
            <figcaption class="content-detail-hero-caption">
                <span v-if="badges.length" class="content-detail-hero-badges">
                    <span v-for="badge in badges" :key="badge.text" class="content-detail-hero-badge"
                        :class="`is-${badge.tone || 'accent'}`">
                        <img v-if="badge.icon" :src="badge.icon" :alt="badge.text" />
                        {{ badge.text }}
                    </span>
                </span>
                <h1 class="content-detail-hero-title">{{ title }}</h1>
                <p v-if="introduce" class="content-detail-hero-introduce">{{ introduce }}</p>
                <span v-if="coverHint" class="content-detail-hero-hint">
                    <IconZoomInOutline />{{ coverHint }}
                </span>
            </figcaption>
        </figure>

        <template v-else>
            <div class="content-detail-hero-copy">
                <span v-if="badges.length" class="content-detail-hero-badges">
                    <span v-for="badge in badges" :key="badge.text" class="content-detail-hero-badge"
                        :class="`is-${badge.tone || 'accent'}`">
                        <img v-if="badge.icon" :src="badge.icon" :alt="badge.text" />
                        {{ badge.text }}
                    </span>
                </span>

                <h1 class="content-detail-hero-title">{{ title }}</h1>
                <p v-if="introduce" class="content-detail-hero-introduce">{{ introduce }}</p>

                <span v-if="labels.length" class="content-detail-hero-labels">
                    <span v-for="label in labels" :key="label">{{ label }}</span>
                </span>
            </div>

            <figure v-if="cover" class="content-detail-hero-media"
                :class="[`is-fit-${coverFit}`, { 'is-clickable': Boolean(coverHint) }]"
                @click="emit('cover-click')">
                <img :src="cover" :alt="title" loading="lazy" @error="emit('cover-error')" />
                <span v-if="coverHint" class="content-detail-hero-hint">
                    <IconZoomInOutline />{{ coverHint }}
                </span>
            </figure>
        </template>
    </header>
</template>

<script lang="ts" setup>
import { IconZoomInOutline } from '@yike-design/ui/es/components/svg-icon'

export interface HeroBadge {
    text: string
    tone?: 'plain' | 'accent' | 'success' | 'warning'
    icon?: string
}

withDefaults(defineProps<{
    title: string
    introduce?: string
    cover?: string
    variant?: 'split' | 'immersive' | 'plain'
    // compact 用于后台弹窗：保留共用视觉语言，但压缩首图高度与文字尺度
    density?: 'comfortable' | 'compact'
    badges?: HeroBadge[]
    labels?: string[]
    coverHint?: string
    // 图库首图需要完整呈现，文章封面仍默认裁切填充
    coverFit?: 'cover' | 'contain'
}>(), {
    introduce: '',
    cover: '',
    variant: 'split',
    density: 'comfortable',
    badges: () => [],
    labels: () => [],
    coverHint: '',
    coverFit: 'cover'
})

const emit = defineEmits<{
    (e: 'cover-click'): void
    (e: 'cover-error'): void
}>()
</script>

<style lang="less" scoped>
.content-detail-hero {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
    gap: clamp(20px, 3vw, 44px);
    align-items: center;
    padding: clamp(22px, 3vw, 36px);
    border-radius: var(--content-hero-radius, 20px);
    background:
        radial-gradient(circle at 94% 2%, var(--content-hero-accent-soft, var(--admin-accent-soft, var(--pcolor2))), transparent 42%),
        linear-gradient(135deg,
            var(--content-hero-surface, var(--admin-surface, var(--bgColor1))) 0%,
            var(--content-hero-surface-soft, var(--admin-surface-soft, var(--bgColor2))) 100%);

    &.is-plain {
        grid-template-columns: minmax(0, 1fr);
        padding: 0;
        border-radius: 0;
        background: transparent;
    }

    &.is-immersive {
        display: block;
        padding: 0;
        background: transparent;
    }
}

.content-detail-hero-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 12px;
}

.content-detail-hero-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.content-detail-hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--content-hero-accent-soft, var(--admin-accent-soft, var(--pcolor2)));
    color: var(--content-hero-accent, var(--admin-accent, var(--pcolor)));
    font-size: 12px;
    line-height: 20px;

    img {
        width: 15px;
        height: 15px;
        object-fit: contain;
    }

    &.is-plain {
        border: 1px solid var(--content-hero-line, var(--admin-line, var(--gray2)));
        background: transparent;
        color: var(--content-hero-muted, var(--admin-muted, var(--gray6)));
    }

    &.is-success {
        background: color-mix(in srgb, var(--content-hero-success, var(--scolor, #1fb4a2)) 16%, transparent);
        color: var(--content-hero-success, var(--scolor, #1fb4a2));
    }

    &.is-warning {
        background: color-mix(in srgb, var(--content-hero-warning, var(--wcolor, #e8a33d)) 18%, transparent);
        color: var(--content-hero-warning, var(--wcolor, #e8a33d));
    }
}

.content-detail-hero-title {
    margin: 0;
    color: var(--content-hero-ink, var(--admin-ink, var(--gray)));
    font-family: var(--content-hero-title-font, inherit);
    font-size: clamp(24px, 2.6vw, 34px);
    font-weight: 650;
    line-height: 1.3;
    letter-spacing: -0.015em;
    overflow-wrap: anywhere;
}

.is-plain .content-detail-hero-title {
    max-width: 24ch;
    font-size: clamp(27px, 3vw, 40px);
    line-height: 1.22;
}

.content-detail-hero-introduce {
    max-width: 720px;
    margin: 0;
    color: var(--content-hero-muted, var(--admin-muted, var(--gray6)));
    font-size: 14px;
    line-height: 1.85;
    overflow-wrap: anywhere;
}

.content-detail-hero-labels {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;

    span {
        padding: 2px 9px;
        border: 1px solid var(--content-hero-line, var(--admin-line, var(--gray2)));
        border-radius: 999px;
        color: var(--content-hero-muted, var(--admin-muted, var(--gray6)));
        font-size: 12px;
        line-height: 20px;
    }
}

.content-detail-hero-media {
    position: relative;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    border-radius: 14px;
    background: var(--content-hero-accent-soft, var(--admin-accent-soft, var(--pcolor2)));
    box-shadow: var(--content-hero-shadow, var(--admin-shadow-md, 0 14px 34px rgba(21, 38, 79, 0.14)));

    img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    &.is-fit-contain {
        background:
            radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.08), transparent 56%),
            var(--content-hero-media-soft, var(--admin-surface-soft, var(--bgColor2)));

        img {
            object-fit: contain;
        }
    }

    &:hover img {
        transform: scale(1.025);
    }

    &.is-fit-contain:hover img {
        transform: none;
    }
}

.is-split .content-detail-hero-media {
    aspect-ratio: 4 / 3;
}

.is-split .content-detail-hero-media.is-clickable {
    cursor: zoom-in;
}

.is-immersive .content-detail-hero-media {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: var(--content-hero-radius, 20px);
}

.is-immersive.density-compact .content-detail-hero-media {
    max-height: 280px;
    aspect-ratio: 21 / 9;
}

.density-compact .content-detail-hero-caption {
    gap: 7px;
    padding: clamp(16px, 2vw, 24px);

    .content-detail-hero-title {
        max-width: 28ch;
        font-size: clamp(22px, 2.4vw, 30px);
    }

    .content-detail-hero-introduce {
        -webkit-line-clamp: 1;
    }
}

.is-immersive .content-detail-hero-media.is-clickable {
    cursor: zoom-in;
}

.content-detail-hero-veil {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(180deg,
        transparent 38%,
        rgba(0, 0, 0, 0.3) 68%,
        rgba(0, 0, 0, 0.62) 100%);
}

.content-detail-hero-caption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: clamp(18px, 3vw, 34px);
    pointer-events: none;

    .content-detail-hero-badge {
        border: 1px solid rgba(255, 255, 255, 0.28);
        background: rgba(0, 0, 0, 0.26);
        color: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(8px);
    }

    .content-detail-hero-title {
        max-width: 18ch;
        color: #fff;
        font-size: clamp(28px, 4vw, 48px);
        line-height: 1.16;
        text-shadow: 0 2px 18px rgba(0, 0, 0, 0.5);
    }

    .content-detail-hero-introduce {
        max-width: 52ch;
        color: rgba(255, 255, 255, 0.84);
        text-shadow: 0 1px 8px rgba(0, 0, 0, 0.42);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
}

.content-detail-hero-hint {
    position: absolute;
    right: 16px;
    bottom: 16px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 11px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.34);
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    line-height: 20px;
    pointer-events: none;
    backdrop-filter: blur(8px);

    :deep(svg) {
        width: 14px;
        height: 14px;
    }
}

.is-immersive .content-detail-hero-caption .content-detail-hero-hint {
    position: static;
    width: fit-content;
    margin-top: 2px;
    background: rgba(0, 0, 0, 0.28);
}

@media (max-width: 760px) {
    .content-detail-hero.is-split {
        grid-template-columns: minmax(0, 1fr);
        padding: clamp(18px, 4vw, 26px);
    }

    .is-split .content-detail-hero-media {
        order: -1;
        width: 100%;
        max-width: none;
        aspect-ratio: 16 / 9;
    }

    .is-immersive .content-detail-hero-media {
        aspect-ratio: 4 / 3;
    }

    .is-immersive.density-compact .content-detail-hero-media {
        max-height: 220px;
        aspect-ratio: 16 / 9;
    }

    .content-detail-hero-caption .content-detail-hero-title {
        font-size: clamp(24px, 7vw, 34px);
    }
}

@media (prefers-reduced-motion: reduce) {
    .content-detail-hero-media img {
        transition: none;
    }
}
</style>
