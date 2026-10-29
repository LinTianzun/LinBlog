<template>
    <yk-modal :model-value="modelValue" :title="article?.title || '图库详情'" size="xl" :show-footer="false"
        :closeable="true" content-height="calc(100vh - 120px)" @update:model-value="handleVisibleChange">
        <div v-if="modelValue" class="gallery-detail">
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

            <template v-else-if="article">
                <!-- 顶部：标题 + 管理操作 -->
                <header class="gallery-detail-head">
                    <div class="gallery-detail-head-main">
                        <h2 class="gallery-detail-title">{{ article.title }}</h2>
                        <p v-if="article.introduce" class="gallery-detail-introduce">
                            {{ article.introduce }}
                        </p>
                    </div>
                    <!-- 操作区与前台不同：后台保留管理动作 -->
                    <div v-if="access.canEdit(article)" class="gallery-detail-actions">
                        <yk-button size="s" @click="openEditor">
                            <IconFillOutline />编辑
                        </yk-button>
                    </div>
                </header>

                <!-- 开场：前 3 张组成接触印样，其余照片进入下方瀑布流 -->
                <ContentPhotoStage :photos="displayPhotos" :visible-count="stagePhotoCount"
                    empty-text="该图库还没有图片" @preview="openLightbox" />

                <!-- 信息面板：替代原来的 data + chips 双层重复统计 -->
                <dl class="gallery-detail-panel">
                    <div class="gallery-detail-panel-cell">
                        <dt>所属分类</dt>
                        <dd>{{ article.subsetName || '未分类' }}</dd>
                    </div>
                    <div class="gallery-detail-panel-cell">
                        <dt>作品状态</dt>
                        <dd class="is-state" :class="`is-${stateTone}`">
                            <span class="gallery-detail-dot" aria-hidden="true"></span>
                            {{ stateLabel }}
                        </dd>
                    </div>
                    <div class="gallery-detail-panel-cell">
                        <dt>图片数量</dt>
                        <dd>
                            <IconCameraOutline />{{ displayPhotos.length }} 张
                        </dd>
                    </div>
                    <div class="gallery-detail-panel-cell">
                        <dt>{{ publishedLabel }}</dt>
                        <dd>{{ createdText }}</dd>
                    </div>
                </dl>

                <!-- 浏览与评论：集中在一条 metrics 行，紧跟主图视线 -->
                <div class="gallery-detail-metrics">
                    <span class="gallery-detail-metric">
                        <IconEyeOutline />浏览 {{ article.views }}
                    </span>
                    <span class="gallery-detail-metric">
                        <IconHeartOutline />喜欢 {{ article.likes }}
                    </span>
                    <span class="gallery-detail-metric">
                        <IconCommentOutline />评论 {{ displayedCommentTotal }}
                    </span>
                </div>

                <!-- 图片区：开场已使用前 3 张，这里从后续照片继续 -->
                <section v-if="displayPhotos.length > stagePhotoCount" class="gallery-detail-photos">
                    <header class="gallery-detail-photos-head">
                        <h3>整组照片</h3>
                        <span>还有 {{ displayPhotos.length - stagePhotoCount }} 张，点击查看原图</span>
                    </header>
                    <ContentPhotoGrid :photos="restPhotos" layout="masonry" :show-index="true"
                        :start-index="stagePhotoCount" @preview="openLightbox" />
                </section>

                <!-- 评论区与后台文章详情保持同一套交互 -->
                <AdminCommentSection target-type="article" :target-id="article.id"
                    :initial-total="displayedCommentTotal" @comments-change="handleCommentTotalChange"
                    @changed="handleCommentsChanged" />
            </template>
        </div>

        <ContentLightbox :open="lightbox.open" :photos="displayPhotos" :index="lightbox.index"
            :title="article?.title" @close="closeLightbox" @update:index="lightbox.index = $event" />
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getArticleById, getArticleStateLabel, type ArticleItem } from '../../api/article.ts'
import {
    IconFillOutline,
    IconCameraOutline,
    IconEyeOutline,
    IconHeartOutline,
    IconCommentOutline,
} from '@yike-design/ui/es/components/svg-icon'
import { useContentAccess } from '../../utils/contentAccess.ts'
import ContentPhotoStage from '../content/ContentPhotoStage.vue'
import ContentPhotoGrid from '../content/ContentPhotoGrid.vue'
import ContentLightbox from '../content/ContentLightbox.vue'
import AdminCommentSection from '../content/AdminCommentSection.vue'

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

// 内容图片为空时用封面兜底，确保开场图与灯箱始终使用同一份可点击图片集
const displayPhotos = computed(() => {
    if (photos.value.length) return photos.value
    return article.value?.cover ? [article.value.cover] : []
})
const stagePhotoCount = computed(() => Math.min(displayPhotos.value.length, 3))
const restPhotos = computed(() => displayPhotos.value.slice(stagePhotoCount.value))

// 状态色语义与共享组件一致：已发布走成功色，其余走提醒色
const stateTone = computed(() => (article.value?.state === 'published' ? 'success' : 'warning'))

// 统计条与卡片、门户统一展示评论总数；标题处再拆一级评论与回复
const commentTotal = computed(() => {
    const current = article.value
    const hasSplitCounts = current?.rootComments !== undefined || current?.replyComments !== undefined
    if (hasSplitCounts) {
        return (current?.rootComments ?? 0) + (current?.replyComments ?? 0)
    }
    return current?.comments ?? 0
})

const commentTotalOverride = ref<number | null>(null)
const displayedCommentTotal = computed(
    () => commentTotalOverride.value ?? commentTotal.value
)

// 草稿没有发布时间，标签与文案同步切换，避免出现「发布时间 —」的空语义
const publishedLabel = computed(() =>
    article.value?.publishedAt ? '发布时间' : '创建时间'
)
const createdText = computed(() => {
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

const handleCommentTotalChange = (total: number): void => {
    commentTotalOverride.value = total
}

// 评论区已经回传最新总数；这里只通知列表刷新冗余计数，不重载详情造成闪烁
const handleCommentsChanged = (total: number): void => {
    commentTotalOverride.value = total
    emits('changed')
}

// 只在真正打开的图库 id 变化时重新拉取，避免 v-model 抖动造成重复请求
const loadKey = computed(() => (props.modelValue && props.galleryId ? `${props.galleryId}` : ''))

watch(loadKey, async (key, previousKey) => {
    if (key === previousKey) return

    if (!key) {
        article.value = null
        commentTotalOverride.value = null
        errorMessage.value = ''
        loading.value = false
        return
    }
    commentTotalOverride.value = null
    await loadGallery()
}, { immediate: true })
</script>

<style lang="less" scoped>
.gallery-detail {
    display: flex;
    min-height: 240px;
    flex-direction: column;
    gap: @space-m;

    &-state {
        display: flex;
        min-height: 240px;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
    }

    // 标题区：编辑按钮靠右，标题不再和按钮抢横向空间
    &-head {
        display: flex;
        flex-wrap: wrap;
        gap: @space-s @space-m;
        align-items: flex-start;
        justify-content: space-between;
    }

    &-head-main {
        display: flex;
        min-width: 0;
        flex: 1;
        flex-direction: column;
        gap: 6px;
    }

    &-title {
        margin: 0;
        color: var(--admin-ink, @font-color-l);
        font-size: clamp(21px, 2vw, 27px);
        font-weight: 650;
        line-height: 1.28;
        letter-spacing: -0.01em;
        overflow-wrap: anywhere;
    }

    &-introduce {
        max-width: 62ch;
        margin: 0;
        color: var(--admin-muted, @font-color-s);
        font-size: 14px;
        line-height: 1.8;
    }

    &-actions {
        display: flex;
        flex-wrap: wrap;
        gap: @space-s;
    }

    // 信息面板：四格两行的眼睛停留点，取代原来重复的 chip 行
    &-panel {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
        gap: 1px;
        margin: 0;
        overflow: hidden;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: @radius-m;
        background: var(--admin-line, var(--gray1));
    }

    &-panel-cell {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 5px;
        padding: @space-m;
        background: var(--admin-surface, var(--bgColor1));

        dt {
            color: var(--admin-muted, @font-color-s);
            font-size: @size-ss;
            letter-spacing: 0.03em;
        }

        dd {
            display: inline-flex;
            margin: 0;
            align-items: center;
            gap: 5px;
            color: var(--admin-ink, @font-color-l);
            font-size: 14.5px;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            overflow-wrap: anywhere;

            .yk-icon {
                width: 15px;
                height: 15px;
                flex: none;
                color: var(--admin-muted, @font-color-s);
            }
        }

        .is-state {
            gap: 7px;
        }
    }

    // 面板里的状态用同色圆点 + 文字，不再叠一层 chip 背景
    &-dot {
        width: 7px;
        height: 7px;
        flex: none;
        border-radius: 50%;
        background: currentColor;
    }

    .is-success {
        color: var(--scolor, #1fb4a2);
    }

    .is-warning {
        color: var(--wcolor, #e8a33d);
    }

    // 浏览/喜欢/评论：一条轻量指标行，不重复信息面板里的图片数
    &-metrics {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: @space-s @space-l;
        padding: 0 2px;
        color: var(--admin-muted, @font-color-s);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
    }

    &-metric {
        display: inline-flex;
        align-items: center;
        gap: 5px;

        .yk-icon {
            width: 15px;
            height: 15px;
        }
    }

    &-photos {
        display: flex;
        flex-direction: column;
        gap: @space-s;
        padding-top: @space-s;
        border-top: 1px solid var(--admin-line, var(--gray1));
    }

    &-photos-head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: @space-s;

        h3 {
            margin: 0;
            color: var(--admin-ink, @font-color-l);
            font-size: 17px;
            font-weight: 600;
        }

        span {
            color: var(--admin-muted, @font-color-s);
            font-size: @size-ss;
        }
    }

}

@media (max-width: 640px) {
    .gallery-detail {
        gap: @space-s;

        &-head {
            align-items: stretch;
            flex-direction: column;
        }
    }
}
</style>
