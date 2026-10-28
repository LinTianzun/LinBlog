<template>
    <yk-modal :model-value="modelValue" :title="diary?.title || '随笔详情'" size="l" :show-footer="false"
        :closeable="true" @update:model-value="handleVisibleChange">
        <div v-if="diary" class="diary-detail">
            <div class="diary-detail-head">
                <yk-space size="m" align="center" wrap>
                    <yk-space v-if="weatherName" size="xs" align="center">
                        <img v-if="weatherIcon" :src="weatherIcon" :alt="weatherName" />
                        <yk-text>{{ weatherName }}</yk-text>
                    </yk-space>
                    <yk-text type="secondary">{{ momentText }}</yk-text>
                </yk-space>

                <yk-space size="xl" align="center" wrap>
                    <yk-text type="third">
                        <IconEyeOutline /> {{ diary.views ?? 0 }} 次浏览
                    </yk-text>
                    <yk-text type="third">
                        <IconHeartOutline /> {{ diary.likes ?? 0 }} 人喜欢
                    </yk-text>
                    <yk-text type="third">
                        <IconCommentOutline /> {{ rootComments }} 条评论
                    </yk-text>
                    <yk-text type="third">
                        <IconRotateLeftOutline /> {{ replyComments }} 条回复
                    </yk-text>
                </yk-space>
            </div>

            <p class="diary-detail-text">{{ diary.content }}</p>

            <yk-image-preview-group v-if="pictures.length" :src-list="pictures" width="100%" height="180"
                fit="cover" />

            <div class="diary-detail-comment">
                <p class="diary-detail-comment-title">
                    评论 {{ rootComments }} · 回复 {{ replyComments }}
                </p>
                <diaryCommentList :diary-id="diary.id" :page-size="20" @changed="handleCommentsChanged" />
            </div>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import {
    IconRotateLeftOutline,
    IconCommentOutline,
    IconEyeOutline,
    IconHeartOutline,
} from '@yike-design/ui/es/components/svg-icon'
import type { DiaryData } from '../../utils/interface'
import { weathers } from '../../utils/weather'
import { momentl } from '../../utils/moment'
import diaryCommentList from './diaryCommentList.vue'

const props = defineProps<{
    modelValue: boolean
    diary: DiaryData | null
}>()

const emits = defineEmits<{
    (event: 'update:modelValue', value: boolean): void
    (event: 'changed'): void
}>()

const weatherName = computed(() => props.diary?.weatherName || '')
const weatherIcon = computed(() =>
    weathers.find(item => item.name === weatherName.value)?.iconUrl || ''
)
const pictures = computed(() => props.diary?.picture || [])

// 评论与回复分开统计：后端按 parent_id 聚合，没回传时按总数兜底
const rootComments = computed(() => props.diary?.rootComments ?? props.diary?.comments ?? 0)
const replyComments = computed(() => props.diary?.replyComments ?? 0)

const momentText = computed(() =>
    props.diary?.moment ? momentl(props.diary.moment) : '暂无时间'
)

// 评论数由列表数据提供，删除评论后本地减一，避免再刷新整个列表
const commentOffset = ref(0)

const handleVisibleChange = (value: boolean): void => {
    emits('update:modelValue', value)
}

const handleCommentsChanged = (): void => {
    commentOffset.value += 1
    emits('changed')
}

watch(() => props.modelValue, visible => {
    // 每次打开重新计数，避免上一次的本地修正残留
    if (visible) commentOffset.value = 0
})

defineExpose({
    // 供父组件读取删除偏移后修正列表计数（无需额外请求）
    offset: computed(() => commentOffset.value)
})
</script>

<style lang="less" scoped>
.diary-detail {
    display: flex;
    min-height: 180px;
    flex-direction: column;
    gap: @space-l;

    &-head {
        display: flex;
        flex-wrap: wrap;
        gap: @space-m;
        align-items: center;
        justify-content: space-between;
        padding-bottom: @space-m;
        border-bottom: 1px solid var(--admin-line, var(--gray1));

        img {
            width: 20px;
            height: 20px;
        }
    }

    &-text {
        margin: 0;
        color: var(--gray);
        font-size: 15px;
        line-height: 2;
        white-space: pre-wrap;
        word-break: break-word;
    }

    &-comment {
        padding-top: @space-m;
        border-top: 1px solid var(--admin-line, var(--gray1));

        &-title {
            margin: 0 0 @space-m;
            color: var(--gray);
            font-size: 16px;
            font-weight: 600;
        }
    }
}

@media (max-width: 640px) {
    .diary-detail {
        gap: @space-m;
    }
}
</style>
