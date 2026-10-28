<template>
    <yk-modal :model-value="modelValue" :title="article?.title || '图库详情'" size="xl" :show-footer="false"
        :closeable="true" @update:model-value="handleVisibleChange">
        <div v-if="article" class="gallery-detail">
            <div v-if="loading" class="gallery-detail-state">
                <yk-spinner size="m" />
                <yk-text type="secondary">正在加载图库...</yk-text>
            </div>

            <div v-else-if="errorMessage" class="gallery-detail-state">
                <yk-empty description="无法打开图库">
                    <yk-text type="secondary">{{ errorMessage }}</yk-text>
                    <yk-button type="secondary" @click="loadGallery">重新加载</yk-button>
                </yk-empty>
            </div>

            <template v-else>
                <div class="gallery-detail-head">
                    <yk-space size="m" align="center" wrap>
                        <yk-tag v-if="article.subsetName" shape="round">{{ article.subsetName }}</yk-tag>
                        <yk-tag :color="stateColor" shape="round">{{ stateLabel }}</yk-tag>
                        <yk-text type="secondary">{{ publishedText }}</yk-text>
                    </yk-space>

                    <yk-space size="xl" align="center" wrap>
                        <yk-text type="third">
                            <IconEyeOutline /> {{ article.views }} 次浏览
                        </yk-text>
                        <yk-text type="third">
                            <IconHeartOutline /> {{ article.likes }} 人喜欢
                        </yk-text>
                        <yk-text type="third">
                            <IconCommentOutline /> {{ rootComments }} 条评论
                        </yk-text>
                        <yk-text type="third">
                            <IconRotateLeftOutline /> {{ replyComments }} 条回复
                        </yk-text>
                        <yk-button v-if="access.canEdit(article)" type="secondary" size="s" @click="openEditor">
                            <IconFillOutline />编辑
                        </yk-button>
                    </yk-space>
                </div>

                <yk-image-preview-group v-if="photos.length" :src-list="photos" width="100%" height="200"
                    fit="cover" />
                <div v-else class="gallery-detail-blank">该图库还没有图片</div>

                <p v-if="article.introduce" class="gallery-detail-introduce">{{ article.introduce }}</p>

                <div class="gallery-detail-comment">
                    <p class="gallery-detail-comment-title">
                        评论 {{ rootComments }} · 回复 {{ replyComments }}
                    </p>
                    <reply-list :article-id="article.id" :page-size="20" @changed="handleCommentsChanged" />
                </div>
            </template>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getArticleById, getArticleStateLabel, type ArticleItem } from '../../api/article.ts'
import {
    IconEyeOutline,
    IconFillOutline,
    IconRotateLeftOutline,
    IconCommentOutline,
    IconHeartOutline,
} from '@yike-design/ui/es/components/svg-icon'
import ReplyList from '../reply/commentList.vue'
import { useContentAccess } from '../../utils/contentAccess.ts'

const props = defineProps<{
    modelValue: boolean
    galleryId: number | null
}>()

const emits = defineEmits<{
    (event: 'update:modelValue', value: boolean): void
    (event: 'changed'): void
}>()

const router = useRouter()
const access = useContentAccess('gallery')

const article = ref<ArticleItem | null>(null)
const loading = ref(false)
const errorMessage = ref('')

const photos = computed(() => {
    const content = article.value?.content
    if (!content) return []
    try {
        const parsed = JSON.parse(content)
        return Array.isArray(parsed)
            ? parsed.filter((item: unknown): item is string => typeof item === 'string')
            : []
    } catch {
        return []
    }
})

const stateLabel = computed(() => getArticleStateLabel(article.value?.state))

// 评论与回复分开统计：后端按 parent_id 聚合，没回传时按总数兜底
const rootComments = computed(() => article.value?.rootComments ?? article.value?.comments ?? 0)
const replyComments = computed(() => article.value?.replyComments ?? 0)

// 状态标签配色：与列表卡片保持一致
const stateColor = computed(() => {
    const state = article.value?.state
    if (state === 'published') return 'success'
    if (state === 'rejected') return 'danger'
    return 'primary'
})

const publishedText = computed(() => {
    const value = article.value?.publishedAt || article.value?.createdAt
    if (!value) return '暂无时间'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '暂无时间'
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
})

const loadGallery = async (): Promise<void> => {
    if (!props.galleryId) return

    loading.value = true
    errorMessage.value = ''
    try {
        const result = await getArticleById(props.galleryId)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '图库加载失败')
        }
        article.value = result.data
    } catch {
        article.value = null
        errorMessage.value = '图库加载失败，请稍后重试'
    } finally {
        loading.value = false
    }
}

const handleVisibleChange = (value: boolean): void => {
    emits('update:modelValue', value)
}

const openEditor = (): void => {
    if (props.galleryId) void router.push(`/editgallery/${props.galleryId}`)
}

// 评论增删后刷新计数与列表，让弹窗里的数字不再滞后
const handleCommentsChanged = (): void => {
    void loadGallery()
    emits('changed')
}

// 只在真正打开的图库 id 变化时重新拉取，避免 v-model 抖动造成重复请求
const loadKey = computed(() => (props.modelValue && props.galleryId ? `${props.galleryId}` : ''))

watch(loadKey, async (key, previousKey) => {
    if (key === previousKey) return

    if (!key) {
        article.value = null
        errorMessage.value = ''
        loading.value = false
        return
    }
    await loadGallery()
}, { immediate: true })
</script>

<style lang="less" scoped>
.gallery-detail {
    display: flex;
    min-height: 240px;
    flex-direction: column;
    gap: @space-l;

    &-state {
        display: flex;
        min-height: 240px;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
    }

    &-head {
        display: flex;
        flex-wrap: wrap;
        gap: @space-m;
        align-items: center;
        justify-content: space-between;
        padding-bottom: @space-m;
        border-bottom: 1px solid var(--admin-line, var(--gray1));
    }

    &-blank {
        display: flex;
        height: 180px;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: var(--gray1);
        color: var(--gray6);
        font-size: 14px;
    }

    &-introduce {
        margin: 0;
        color: var(--gray6);
        font-size: 14px;
        line-height: 1.9;
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
    .gallery-detail {
        gap: @space-m;

        &-head {
            align-items: flex-start;
        }
    }
}
</style>
