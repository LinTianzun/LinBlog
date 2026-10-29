<!--
    图片集展示：前台与后台的图库 / 随笔详情共用。
    共用排版（自适应网格 + 点击放大 + 计数），图片来源与权限判断留给外部。
-->
<template>
    <div v-if="photos.length" class="content-photo-grid" :class="`is-${layout}`">
        <button v-for="(photo, index) in photos" :key="`${photo}-${index}`" type="button"
            class="content-photo-cell" :aria-label="`查看第 ${index + 1} 张`" @click="emit('preview', index)">
            <img :src="photo" :alt="`第 ${index + 1} 张`" loading="lazy" />
            <span v-if="showIndex" class="content-photo-index">{{ String(index + 1).padStart(2, '0') }}</span>
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
}>(), {
    layout: 'masonry',
    showIndex: false,
    emptyText: '这里还没有图片'
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

// 图库：自适应列 + 不等高，保留照片原本比例
.content-photo-grid.is-masonry {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
    grid-auto-rows: 180px;

    // 每 5 张里让第 1 张跨两格，形成错落的刊物排版
    .content-photo-cell:nth-child(5n + 1) {
        grid-column: span 2;
        grid-row: span 2;
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
    transition: transform 200ms ease, box-shadow 200ms ease;

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
        grid-auto-rows: 150px;

        // 单列下跨格会撑破布局，取消错落
        .content-photo-cell:nth-child(5n + 1) {
            grid-column: span 1;
            grid-row: span 1;
        }
    }
}
</style>
