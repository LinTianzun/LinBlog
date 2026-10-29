<!--
    图库开场：前台与后台共用的多图接触印样。
    前 1-3 张组成完整开场，后续照片交给 ContentPhotoGrid。
-->
<template>
    <div v-if="visiblePhotos.length" class="content-photo-stage" :class="`is-count-${visiblePhotos.length}`">
        <div class="content-photo-stage-grid">
            <button v-for="(photo, index) in visiblePhotos" :key="`${photo}-${index}`" type="button"
                class="content-photo-stage-cell" :class="{ 'is-lead': index === 0 }"
                :aria-label="`查看第 ${startIndex + index + 1} 张`" @click="emit('preview', startIndex + index)">
                <img
                    v-bind="responsiveImageAttrs(photo, {
                        widths: IMAGE_WIDTHS.hero,
                        sizes: index === 0
                            ? '(max-width: 760px) 100vw, 60vw'
                            : '(max-width: 760px) 50vw, 30vw',
                        loading: index === 0 ? 'eager' : 'lazy',
                        fetchPriority: index === 0 ? 'high' : undefined
                    })"
                    :alt="`第 ${startIndex + index + 1} 张`" />
                <span class="content-photo-stage-zoom" aria-hidden="true">
                    <IconZoomInOutline />
                </span>
            </button>
        </div>
    </div>

    <div v-else class="content-photo-stage-empty">
        <IconImageOutline />
        <p>{{ emptyText }}</p>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import {
    IconImageOutline,
    IconZoomInOutline,
} from '@yike-design/ui/es/components/svg-icon'
import { IMAGE_WIDTHS, responsiveImageAttrs } from '../../utils/imageOptimization'

const props = withDefaults(defineProps<{
    photos: string[]
    visibleCount?: number
    startIndex?: number
    emptyText?: string
}>(), {
    visibleCount: 3,
    startIndex: 0,
    emptyText: '这里还没有图片'
})

const visiblePhotos = computed(() =>
    props.photos.slice(0, Math.max(1, props.visibleCount))
)

const emit = defineEmits<{
    (e: 'preview', index: number): void
}>()
</script>

<style lang="less" scoped>
.content-photo-stage {
    padding: clamp(6px, 0.9vw, 12px);
    border: 1px solid var(--content-photo-stage-line, var(--admin-line, var(--gray1)));
    border-radius: var(--content-photo-stage-radius, 16px);
    background: var(--content-photo-stage-surface, var(--admin-surface-soft, var(--bgColor2)));
    box-shadow: var(--content-photo-stage-shadow, var(--admin-shadow-sm, none));
}

.content-photo-stage-grid {
    display: grid;
    height: clamp(380px, 40vw, 540px);
    grid-template-columns: minmax(0, 1.62fr) minmax(190px, 0.78fr);
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: clamp(6px, 0.9vw, 10px);
}

.content-photo-stage-cell {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--content-photo-stage-frame-line, var(--admin-line, var(--gray1)));
    border-radius: var(--content-photo-stage-frame-radius, 10px);
    background: var(--content-photo-stage-frame, var(--admin-surface, var(--bgColor1)));
    cursor: zoom-in;
    transition: border-color 180ms ease, background-color 180ms ease;

    &.is-lead {
        grid-row: 1 / -1;
    }

    img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    &:hover {
        border-color: var(--content-photo-stage-accent, var(--admin-accent, var(--pcolor)));
    }

    &:focus-visible {
        outline: 2px solid var(--content-photo-stage-accent, var(--admin-accent, var(--pcolor)));
        outline-offset: -2px;
    }
}

.content-photo-stage-zoom {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    background: rgba(12, 16, 24, 0.56);
    color: #fff;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 180ms ease, transform 180ms ease;
    pointer-events: none;
    backdrop-filter: blur(8px);

    :deep(svg) {
        width: 15px;
        height: 15px;
    }
}

.content-photo-stage-cell:hover .content-photo-stage-zoom,
.content-photo-stage-cell:focus-visible .content-photo-stage-zoom {
    opacity: 1;
    transform: translateY(0);
}

.content-photo-stage.is-count-1 {
    .content-photo-stage-grid {
        height: clamp(280px, 54vh, 660px);
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
    }

    .content-photo-stage-cell {
        grid-row: auto;
    }
}

.content-photo-stage.is-count-2 {
    .content-photo-stage-grid {
        height: clamp(320px, 36vw, 490px);
        grid-template-columns: minmax(0, 1.14fr) minmax(0, 0.86fr);
        grid-template-rows: minmax(0, 1fr);
    }

    .content-photo-stage-cell {
        grid-row: auto;
    }
}

.content-photo-stage-empty {
    display: flex;
    min-height: 180px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px dashed var(--content-photo-stage-line, var(--admin-line, var(--gray2)));
    border-radius: var(--content-photo-stage-radius, 16px);
    color: var(--content-photo-stage-muted, var(--admin-muted, var(--gray6)));
    font-size: 13px;

    :deep(svg) {
        width: 28px;
        height: 28px;
    }

    p {
        margin: 0;
    }
}

@media (max-width: 760px) {
    .content-photo-stage-grid {
        height: auto;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-rows: minmax(260px, 46vh) 170px;
    }

    .content-photo-stage-cell.is-lead {
        grid-column: 1 / -1;
        grid-row: 1;
    }

    .content-photo-stage-cell:not(.is-lead) {
        grid-row: 2;
    }

    .content-photo-stage.is-count-2 {
        .content-photo-stage-grid {
            height: clamp(280px, 46vh, 440px);
            grid-template-rows: minmax(0, 1fr);
        }

        .content-photo-stage-cell {
            grid-column: span 1;
            grid-row: 1;
        }
    }

    .content-photo-stage.is-count-1 {
        .content-photo-stage-grid {
            height: clamp(280px, 48vh, 520px);
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: minmax(0, 1fr);
        }

        .content-photo-stage-cell {
            grid-column: auto;
        }
    }
}

@media (prefers-reduced-motion: reduce) {
    .content-photo-stage-cell,
    .content-photo-stage-zoom {
        transition: none;
    }
}
</style>
