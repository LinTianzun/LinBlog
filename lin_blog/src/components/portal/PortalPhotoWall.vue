<template>
    <div class="photo-wall">
        <button v-for="(item, index) in items" :key="item.id" type="button" class="wall-print"
            :class="[`is-${item.span}`, `tone-${item.tone ?? 0}`]"
            :style="{ animationDelay: `${Math.min(index, 11) * 55}ms` }" @click="emit('select', item.id)">
            <div class="print-frame portal-edge">
                <img v-if="item.image" :src="item.image" :alt="item.alt" loading="lazy" />
                <div v-else class="print-blank" :class="`tone-${item.tone ?? 0}`">
                    <span>{{ item.glyph }}</span>
                </div>
                <span class="print-count" v-if="item.count">{{ item.count }} 张</span>
                <!-- 悬停时从底部升起的说明层，保证文字在图片上也能读清 -->
                <div class="print-veil">
                    <span class="print-veil-title">{{ item.title }}</span>
                    <span v-if="item.note" class="print-veil-note">{{ item.note }}</span>
                </div>
            </div>
            <div class="print-caption">
                <h3>{{ item.title }}</h3>
            </div>
        </button>
    </div>
</template>

<script lang="ts" setup>
export interface WallPrint {
    id: number | string
    title: string
    note?: string
    image?: string
    alt?: string
    glyph?: string
    tone?: number
    count?: number
    // 跨栏：wide 占 7 列，portrait 占 4 列，small 占 3 列
    span: 'wide' | 'portrait' | 'small'
    // 垂直错位档位
    offset: 0 | 1 | 2
}

withDefaults(defineProps<{
    items: WallPrint[]
}>(), {
    items: () => []
})

const emit = defineEmits<{
    (e: 'select', id: WallPrint['id']): void
}>()
</script>

<style lang="less" scoped>
.photo-wall {
    display: grid;
    // 稳定三联：左侧一张大图主导，右侧两张小图叠放，
    // 避免 12 栏 dense 在只有少量卡片时留下大片空洞
    grid-template-columns: 1.6fr 1fr;
    grid-auto-rows: min-content;
    column-gap: 20px;
    row-gap: 20px;
    align-items: start;
}

.wall-print {
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-decoration: none;
    // backwards：只保留入场前起始态，避免动画终态覆盖悬停位移
    animation: print-in 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    transition: transform 0.3s ease;

    &:hover {
        transform: translateY(-4px);

        .print-frame img {
            transform: scale(1.04);
        }

        .print-veil {
            opacity: 1;
        }

        .print-caption h3 {
            color: var(--portal-accent);
        }
    }

    // 大图占左侧整列，小图依次落在右列，整体高度由内容自然撑开
    &.is-wide {
        grid-column: 1;
        grid-row: 1 / span 2;
    }

    &.is-portrait {
        grid-column: 2;
    }

    &.is-small {
        grid-column: 2;
    }
}

.print-frame {
    position: relative;
    overflow: hidden;
    border-radius: var(--portal-radius-card);
    // 玻璃卡：与首页其它板块保持一致的质感
    border: 1px solid var(--portal-surface-border);
    background: var(--portal-surface);
    box-shadow: var(--portal-shadow-soft);
    transition: box-shadow var(--portal-transition-medium);

    img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
    }
}

// 大图更高，小图矮一些，形成主次
.is-wide .print-frame {
    aspect-ratio: 4 / 5;
}

.is-small .print-frame {
    aspect-ratio: 1 / 1;
}

.is-portrait .print-frame {
    aspect-ratio: 1 / 1;
}

// 悬停说明层：从底部升起的渐变，保证文字在任意图片上都可读
.print-veil {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 28px 14px 12px;
    opacity: 0;
    transition: opacity var(--portal-transition-medium);
    background: linear-gradient(
        to top,
        color-mix(in srgb, var(--portal-page-bg) 88%, transparent),
        color-mix(in srgb, var(--portal-page-bg) 40%, transparent) 60%,
        transparent
    );
}

.print-veil-title {
    font-family: var(--portal-serif);
    font-size: 15px;
    font-weight: 600;
    color: var(--portal-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.print-veil-note {
    font-size: 12px;
    color: var(--portal-text-secondary);
}

// 不支持 color-mix 时退回纯色渐变，避免出现透明无效层
@supports not (background: color-mix(in srgb, red 50%, blue)) {
    .print-veil {
        background: linear-gradient(to top, var(--portal-page-bg), transparent);
    }
}

// 无封面时的排印占位：主色块 + 首字，不用图片也不用灰色空块
.print-blank {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;

    span {
        font-family: var(--portal-serif);
        font-size: clamp(40px, 6vw, 76px);
        font-weight: 700;
        line-height: 1;
        color: rgba(255, 255, 255, 0.9);
    }

    &.tone-0 {
        background: @pcolor;
    }

    &.tone-1 {
        background: @pcolor-8;
    }

    &.tone-2 {
        background: @pcolor-9;
    }

    &.tone-3 {
        background: @pcolor-6;
    }
}

.print-count {
    position: absolute;
    right: 10px;
    bottom: 10px;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--portal-surface-strong);
    border: 1px solid var(--portal-surface-border);
    color: var(--portal-text-secondary);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    z-index: 3;
}

.print-caption {
    padding-top: 10px;

    h3 {
        margin: 0;
        font-family: var(--portal-serif);
        font-size: 16px;
        font-weight: 600;
        line-height: 1.5;
        color: var(--portal-text-primary);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        transition: color 0.2s ease;
    }
}

@keyframes print-in {
    from {
        opacity: 0;
        transform: translateY(18px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (max-width: 900px) {
    .photo-wall {
        grid-template-columns: 1fr 1fr;
        column-gap: 14px;
        row-gap: 22px;
    }

    .wall-print {
        &.is-wide {
            grid-column: 1 / span 2;
            grid-row: auto;
        }

        &.is-portrait,
        &.is-small {
            grid-column: auto;
        }
    }

    .is-wide .print-frame {
        aspect-ratio: 16 / 10;
    }
}

@media (max-width: 560px) {
    // 移动端退回单列，触屏没有 hover，说明层常驻展示
    .photo-wall {
        grid-template-columns: 1fr;
    }

    .wall-print {
        &.is-wide,
        &.is-portrait,
        &.is-small {
            grid-column: 1;
        }
    }

    .print-veil {
        opacity: 1;
    }
}
</style>
