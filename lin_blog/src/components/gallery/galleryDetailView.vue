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
                <!-- 与前台图库详情共用沉浸式头部：首图、标题、简介与元信息 -->
                <ContentDetailHero :title="article.title" :introduce="article.introduce || ''"
                    :cover="photos[0] || article.cover || ''" variant="immersive" :badges="heroBadges"
                    cover-hint="点击放大" @cover-click="openLightbox(0)" />

                <!-- 与前台共用统计条：后台这是只读展示，故不传点赞按钮 -->
                <ContentStatBar :views="article.views" :comments="rootComments"
                    :photo-count="photos.length" :meta-text="publishedText" :meta-chips="metaChips" />

                <!-- 操作区与前台不同：后台保留管理动作 -->
                <div class="gallery-detail-actions">
                    <yk-button v-if="access.canEdit(article)" size="s" @click="openEditor">
                        <IconFillOutline />编辑
                    </yk-button>
                </div>

                <!-- 图片集：与前台共用排版，点击后打开共用灯箱 -->
                <ContentPhotoGrid :photos="photos" layout="masonry" :show-index="true"
                    empty-text="该图库还没有图片" @preview="openLightbox" />

                <div class="gallery-detail-comment">
                    <p class="gallery-detail-comment-title">
                        评论 {{ rootComments }} · 回复 {{ replyComments }}
                    </p>
                    <reply-list :article-id="article.id" :page-size="20" @changed="handleCommentsChanged" />
                </div>
            </template>
        </div>

        <ContentLightbox :open="lightbox.open" :photos="photos" :index="lightbox.index"
            :title="article?.title" @close="closeLightbox" @update:index="lightbox.index = $event" />
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getArticleById, getArticleStateLabel, type ArticleItem } from '../../api/article.ts'
import {
    IconFillOutline,
} from '@yike-design/ui/es/components/svg-icon'
import ReplyList from '../reply/commentList.vue'
import { useContentAccess } from '../../utils/contentAccess.ts'
import ContentDetailHero from '../content/ContentDetailHero.vue'
import ContentStatBar from '../content/ContentStatBar.vue'
import ContentPhotoGrid from '../content/ContentPhotoGrid.vue'
import ContentLightbox from '../content/ContentLightbox.vue'

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

// 灯箱：与前台共用同一个组件，这里只管开关与当前帧
const lightbox = ref({ open: false, index: 0 })
const openLightbox = (index: number): void => {
    lightbox.value = { open: true, index }
}
const closeLightbox = (): void => {
    lightbox.value.open = false
}

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

// 头部与前台图库详情共用同一组标签语义：分类、图片数、状态
const heroBadges = computed(() => {
    const badges: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning' }[] = []
    if (article.value?.subsetName) badges.push({ text: article.value.subsetName, tone: 'accent' })
    badges.push({ text: `${photos.value.length} 张`, tone: 'plain' })
    badges.push({
        text: stateLabel.value,
        tone: article.value?.state === 'published' ? 'success' : 'warning'
    })
    return badges
})

// 统计条左侧的分类与状态标签
const metaChips = computed(() => {
    const chips: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning' }[] = []
    if (article.value?.subsetName) chips.push({ text: article.value.subsetName })
    chips.push({
        text: stateLabel.value,
        tone: article.value?.state === 'published' ? 'success' : 'warning'
    })
    return chips
})

// 评论与回复分开统计：后端按 parent_id 聚合，没回传时按总数兜底
const rootComments = computed(() => article.value?.rootComments ?? article.value?.comments ?? 0)
const replyComments = computed(() => article.value?.replyComments ?? 0)

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

    // 统计条与操作区之间收窄一档，避免两行各占一个大间距
    &-actions {
        display: flex;
        flex-wrap: wrap;
        gap: @space-s;
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
    }
}
</style>
