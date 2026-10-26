<template>
    <yk-modal :model-value="open" :title="item?.title || '随笔详情'" size="l" :show-footer="false" :closeable="true"
        @update:model-value="handleVisibleChange">
        <div v-if="item" class="diary-detail">
            <div class="detail-meta">
                <span v-if="weatherName" class="meta-weather">
                    <img v-if="weatherIcon" :src="weatherIcon" :alt="weatherName" />
                    {{ weatherName }}
                </span>
                <time>{{ formatDate(item.createdAt) }}</time>
            </div>
            <p class="diary-text">{{ item.content }}</p>
            <div v-if="item.picture.length" class="diary-images">
                <yk-image-preview-group :src-list="item.picture" width="100%" height="180" fit="cover" />
            </div>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { weathers } from '../../utils/weather'
import type { PortalDiary } from '../../api/portal'

const props = defineProps<{
    open: boolean
    item: PortalDiary | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const weatherName = computed(() => props.item?.weatherName || '')
const weatherIcon = computed(() =>
    weathers.find(w => w.name === weatherName.value)?.iconUrl || ''
)

const handleVisibleChange = (value: boolean) => {
    if (!value) emit('close')
}

const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<style lang="less" scoped>
.diary-detail {
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

    .meta-weather {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 10px;
        border-radius: 999px;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;

        img {
            width: 16px;
            height: 16px;
        }
    }
}

.diary-text {
    margin: 0;
    font-size: 15px;
    line-height: 2;
    color: @font-color-l;
    white-space: pre-wrap;
    word-break: break-word;
}

.diary-images {
    // yk-image-preview-group 的根节点是 Fragment，外部 class 不会落到 yk-space 上，
    // 因此这里用 wrapper + :deep 覆盖内部布局
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

@media (max-width: 640px) {
    .diary-images :deep(.yk-space) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
