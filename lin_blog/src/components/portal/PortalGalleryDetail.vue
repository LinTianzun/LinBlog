<template>
    <yk-modal :model-value="open" :title="item?.title || '图库详情'" size="xl" :show-footer="false" :closeable="true"
        content-height="calc(100vh - 148px)" @update:model-value="handleVisibleChange">
        <div v-if="item" class="gallery-detail">
            <div class="detail-meta">
                <span v-if="item.subsetName" class="meta-chip">{{ item.subsetName }}</span>
                <time>{{ formatDate(item.publishedAt || item.createdAt) }}</time>
                <span><IconEyeOutline />{{ item.views }}</span>
                <span><IconLikeOutline />{{ item.likes }}</span>
                <span><IconCameraOutline />{{ images.length }} 张</span>
            </div>
            <div class="gallery-grid">
                <yk-image-preview-group :src-list="images" width="100%" height="200" fit="cover" class="grid-inner" />
            </div>
            <p v-if="item.introduce" class="gallery-introduce">{{ item.introduce }}</p>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { parseGalleryContent, type ArticleItem } from '../../api/article'

const props = defineProps<{
    open: boolean
    item: ArticleItem | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const images = computed(() => (props.item ? parseGalleryContent(props.item.content) : []))

const handleVisibleChange = (value: boolean) => {
    if (!value) emit('close')
}

const formatDate = (value?: string | null) => {
    const date = new Date(value || '')
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN')
}
</script>

<style lang="less" scoped>
.gallery-detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.detail-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid @line-color-s;
    color: @font-color-s;
    font-size: @size-s;

    .meta-chip {
        padding: 2px 10px;
        border-radius: 999px;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;
    }

    span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
}

// yk-image-preview-group 内部是 flex 容器，这里覆盖为网格，保证缩略图等宽换行
.gallery-grid {
    .grid-inner {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;

        :deep(.yk-image) {
            width: 100% !important;
        }
    }
}

.gallery-introduce {
    margin: 0;
    font-size: @size-s;
    line-height: 1.8;
    color: @font-color-s;
}

@media (max-width: 640px) {
    .gallery-grid {
        .grid-inner {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
}
</style>
