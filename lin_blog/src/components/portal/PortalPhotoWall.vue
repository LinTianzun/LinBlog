<template>
    <div class="photo-wall">
        <RouterLink v-for="(item, index) in items" :key="item.id" :to="item.to" class="wall-print"
            :class="[`is-${item.span}`, `at-${item.offset}`]"
            :style="{ animationDelay: `${Math.min(index, 11) * 55}ms` }">
            <div class="print-frame">
                <img v-if="item.image" :src="item.image" :alt="item.alt" loading="lazy" />
                <div v-else class="print-blank" :class="`tone-${item.tone ?? 0}`">
                    <span>{{ item.glyph }}</span>
                </div>
                <span class="print-count" v-if="item.count">{{ item.count }} 张</span>
            </div>
            <div class="print-caption">
                <h3>{{ item.title }}</h3>
                <p v-if="item.note">{{ item.note }}</p>
            </div>
        </RouterLink>
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
    to: string
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
</script>

<style lang="less" scoped>
.photo-wall {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    // dense：让后面的卡片自动填补前排留下的空洞，视觉更紧凑
    grid-auto-flow: dense;
    column-gap: 24px;
    row-gap: 52px;
    align-items: start;
}

.wall-print {
    display: block;
    text-decoration: none;
    // backwards：只保留入场前起始态，避免动画终态覆盖悬停位移
    animation: print-in 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    transition: transform 0.3s ease;

    &:hover {
        transform: translateY(-4px);

        .print-frame img {
            transform: scale(1.04);
        }

        .print-caption h3 {
            color: @pcolor;
        }
    }

    // 跨栏与错位：所有边缘都落在栏线上，偏移取自固定档位
    &.is-wide {
        grid-column: span 7;
    }

    &.is-portrait {
        grid-column: span 4;
    }

    &.is-small {
        grid-column: span 3;
    }

    &.at-0 {
        align-self: start;
    }

    &.at-1 {
        margin-top: 64px;
    }

    &.at-2 {
        margin-top: 132px;
    }
}

.print-frame {
    position: relative;
    overflow: hidden;
    border-radius: 2px;
    background: @bg-color-l;

    img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
    }
}

.is-wide .print-frame {
    aspect-ratio: 16 / 10;
}

.is-portrait .print-frame {
    aspect-ratio: 3 / 4;
}

.is-small .print-frame {
    aspect-ratio: 1 / 1;
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
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

.print-caption {
    padding-top: 12px;

    h3 {
        margin: 0;
        font-family: var(--portal-serif);
        font-size: 17px;
        font-weight: 600;
        line-height: 1.5;
        color: @font-color-l;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        transition: color 0.2s ease;
    }

    p {
        margin: 4px 0 0;
        font-size: 13px;
        line-height: 1.7;
        color: @font-color-s;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
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
        column-gap: 16px;
        row-gap: 36px;
    }

    .wall-print {
        &.is-wide {
            grid-column: span 12;
        }

        &.is-portrait {
            grid-column: span 7;
        }

        &.is-small {
            grid-column: span 5;
        }

        &.at-1 {
            margin-top: 40px;
        }

        &.at-2 {
            margin-top: 72px;
        }
    }
}

@media (max-width: 560px) {
    // 移动端保留错落感，但用交替宽度而非全部满宽
    .wall-print {
        &.is-wide {
            grid-column: span 12;
        }

        &.is-portrait {
            grid-column: span 8;
        }

        &.is-small {
            grid-column: span 7;
        }

        &.at-1 {
            margin-top: 28px;
        }

        &.at-2 {
            margin-top: 48px;
        }
    }
}
</style>
