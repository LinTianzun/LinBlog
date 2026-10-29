<!--
    图片集展示：前台与后台的图库 / 随笔详情共用。
    共用排版（自适应网格 + 点击放大 + 计数），图片来源与权限判断留给外部。
-->
<template>
    <div v-if="photos.length" class="content-photo-grid" :class="`is-${layout}`">
        <button v-for="(photo, index) in photos" :key="`${photo}-${index}`" type="button"
            class="content-photo-cell" :aria-label="`查看第 ${startIndex + index + 1} 张`"
            @click="emit('preview', startIndex + index)">
            <img :src="photo" :alt="`第 ${startIndex + index + 1} 张`" loading="lazy" />
            <span v-if="showIndex" class="content-photo-index">
                {{ String(startIndex + index + 1).padStart(2, '0') }}
            </span>
        </button>
    </div>

    <div v-else class="content-photo-empty">
        <IconImageOutline />
        <p>{{ emptyText }}</p>
    </div>
</template>

<script lang="ts" setup>
import { IconImageOutline } from '@yike-design/ui/es/components/svg-icon'

withDefaults(defineProps<{
    photos: string[]
    // masonry 用于图库（高度随图片变化），strip 用于随笔（等高等宽）
    layout?: 'masonry' | 'strip'
    showIndex?: boolean
    emptyText?: string
    // 首图已在 Hero 展示时，网格从第 2 张开始编号与预览
    startIndex?: number
}>(), {
    layout: 'masonry',
    showIndex: false,
    emptyText: '这里还没有图片',
    startIndex: 0
})

const emit = defineEmits<{
    (e: 'preview', index: number): void
}>()
</script>

<style lang="less" scoped>
.content-photo-grid {
    display: grid;
    gap: 12px;
}

// 图库：CSS 多列瀑布流。高度由图片原始比例决定，不再用固定行高裁切，
// 避免横图被“拉平”或在网格里只显示中间一截。
.content-photo-grid.is-masonry {
    display: block;
    columns: 3 220px;
    column-gap: 14px;

    .content-photo-cell {
        display: block;
        width: 100%;
        margin: 0 0 14px;
        break-inside: avoid;
        border: 1px solid var(--content-photo-line, var(--admin-line, var(--gray1)));
        box-shadow: var(--content-photo-shadow-soft, 0 8px 24px rgba(18, 28, 45, 0.06));

        img {
            width: 100%;
            height: auto;
            object-fit: contain;
        }

        &:hover {
            transform: translateY(-3px);
            border-color: var(--content-photo-accent, var(--admin-accent, var(--pcolor)));

            img {
                transform: none;
            }
        }
    }
}

// 随笔：等高等宽四宫格
.content-photo-grid.is-strip {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr));
    grid-auto-rows: 140px;
}

.content-photo-cell {
    position: relative;
    overflow: hidden;
    padding: 0;
    border: none;
    border-radius: 12px;
    // 同 ContentStatBar：自定义 token 优先，未声明时回落到后台变量。
    // 门户在 portal.less 里覆盖这些 token，不在这里写默认值（scoped 特异性会压过它）
    background: var(--content-photo-soft, var(--admin-accent-soft, var(--pcolor2)));
    cursor: zoom-in;
    transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 400ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    &:hover {
        transform: translateY(-2px);
        box-shadow: var(--content-photo-shadow, var(--admin-shadow-md, 0 18px 44px rgba(0, 0, 0, 0.08)));

        img {
            transform: scale(1.04);
        }
    }
}

.content-photo-index {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 1px 7px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
}

.content-photo-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    border: 1px dashed var(--content-photo-line, var(--admin-line, var(--gray2)));
    border-radius: 12px;
    color: var(--content-photo-muted, var(--admin-muted, var(--gray6)));
    font-size: 13px;

    :deep(svg) {
        width: 26px;
        height: 26px;
    }

    p {
        margin: 0;
    }
}

@media (max-width: 640px) {
    .content-photo-grid.is-masonry {
        columns: 1;
    }
}

@media (min-width: 641px) and (max-width: 900px) {
    .content-photo-grid.is-masonry {
        columns: 2;
    }
}
</style>
