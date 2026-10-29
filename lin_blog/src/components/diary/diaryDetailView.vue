<template>
    <yk-modal :model-value="modelValue" :title="diary?.title || '随笔详情'" size="l" :show-footer="false"
        :closeable="true" @update:model-value="handleVisibleChange">
        <div v-if="diary" class="diary-detail">
            <!-- 与前台随笔详情共用纯文字头部：标题 + 天气/日期标签 -->
            <ContentDetailHero :title="diary.title" variant="plain" :badges="heroBadges" />

            <!-- 与前台随笔详情共用统计条 -->
            <ContentStatBar :views="diary.views ?? 0" :comments="rootComments"
                :meta-text="momentText" :meta-chips="metaChips" />

            <p class="diary-detail-text">{{ diary.content }}</p>

            <ContentPhotoGrid :photos="pictures" layout="strip" empty-text="这篇随笔没有配图"
                @preview="openLightbox" />

            <div class="diary-detail-comment">
                <p class="diary-detail-comment-title">
                    评论 {{ rootComments }} · 回复 {{ replyComments }}
                </p>
                <diaryCommentList :diary-id="diary.id" :page-size="20" @changed="handleCommentsChanged" />
            </div>
        </div>

        <ContentLightbox :open="lightbox.open" :photos="pictures" :index="lightbox.index"
            :title="diary?.title" @close="closeLightbox" @update:index="lightbox.index = $event" />
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import type { DiaryData } from '../../utils/interface'
import { weathers } from '../../utils/weather'
import { momentl } from '../../utils/moment'
import diaryCommentList from './diaryCommentList.vue'
import ContentDetailHero from '../content/ContentDetailHero.vue'
import ContentStatBar from '../content/ContentStatBar.vue'
import ContentPhotoGrid from '../content/ContentPhotoGrid.vue'
import ContentLightbox from '../content/ContentLightbox.vue'

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

// 统计条左侧：天气单独成 chip，与后台其它详情的标签风格一致
const metaChips = computed(() => {
    const chips: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning'; icon?: string }[] = []
    if (weatherName.value) {
        chips.push({ text: weatherName.value, tone: 'accent', icon: weatherIcon.value || undefined })
    }
    return chips
})

// 头部与前台随笔详情共用同一组标签语义：天气、日期
const heroBadges = computed(() => {
    const badges: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning'; icon?: string }[] = []
    if (weatherName.value) {
        badges.push({ text: weatherName.value, tone: 'accent', icon: weatherIcon.value || undefined })
    }
    if (momentText.value) badges.push({ text: momentText.value, tone: 'plain' })
    return badges
})

// 灯箱：与前台/图库共用同一个组件
const lightbox = ref({ open: false, index: 0 })
const openLightbox = (index: number): void => {
    lightbox.value = { open: true, index }
}
const closeLightbox = (): void => {
    lightbox.value.open = false
}

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
