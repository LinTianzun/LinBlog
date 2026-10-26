<template>
    <yk-modal :model-value="open" :title="item?.title || '图库详情'" size="xl" :show-footer="false" :closeable="true"
        @update:model-value="handleVisibleChange">
        <div v-if="item" class="gallery-detail">
            <div class="detail-meta">
                <span v-if="item.subsetName" class="meta-chip">{{ item.subsetName }}</span>
                <time>{{ formatDate(item.publishedAt || item.createdAt) }}</time>
                <span><IconEyeOutline />{{ views }}</span>
                <span><IconLikeOutline />{{ item.likes }}</span>
                <span><IconCameraOutline />{{ images.length }} 张</span>
            </div>
            <div class="gallery-grid">
                <yk-image-preview-group :src-list="images" width="100%" height="200" fit="cover" />
            </div>
            <p v-if="item.introduce" class="gallery-introduce">{{ item.introduce }}</p>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { parseGalleryContent, type ArticleItem } from '../../api/article'
import { recordView } from '../../api/portal'

const props = defineProps<{
    open: boolean
    item: ArticleItem | null
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'view-counted', payload: { id: number; views: number }): void
}>()

const images = computed(() => (props.item ? parseGalleryContent(props.item.content) : []))

// 浏览量本地副本：接口回读后立即刷新
const views = ref(0)

const handleVisibleChange = (value: boolean) => {
    if (!value) emit('close')
}

const formatDate = (value?: string | null) => {
    const date = new Date(value || '')
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN')
}

// 打开图库即计一次浏览；后端按访客去重，失败不影响图片展示
const countView = async (galleryId: number) => {
    try {
        const result = await recordView('image', galleryId)
        if (result.code === 200 && result.data) {
            views.value = result.data.views
            emit('view-counted', { id: galleryId, views: result.data.views })
        }
    } catch {
        // 浏览计数失败时保持列表原有数字
    }
}

watch(
    () => [props.open, props.item?.id] as const,
    ([open, galleryId]) => {
        views.value = props.item?.views ?? 0
        if (!open || !galleryId) return
        void countView(galleryId)
    },
    { immediate: true }
)
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
// 该组件根节点是 Fragment，外部 class 不会落到 yk-space 上，需用 :deep 定位
.gallery-grid {
    :deep(.yk-space) {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        width: 100%;
    }

    :deep(.yk-image) {
        width: 100% !important;
    }
}

.gallery-introduce {
    margin: 0;
    font-size: @size-s;
    line-height: 1.8;
    color: @font-color-s;
}

@media (max-width: 640px) {
    .gallery-grid :deep(.yk-space) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
