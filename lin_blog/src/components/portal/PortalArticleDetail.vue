<template>
    <yk-modal :model-value="open" title="文章阅读" size="l" :show-footer="false" :closeable="true"
        content-height="calc(100vh - 148px)" @update:model-value="handleVisibleChange">
        <div v-if="article" class="detail-content" :class="{ loading: detailLoading }">
            <div v-if="detailLoading" class="detail-loading" aria-live="polite">
                <yk-spinner size="m" />
            </div>
            <!-- 与后台文章详情共用头部：标题、导语、封面 -->
            <ContentDetailHero :title="article.title" :introduce="article.introduce || ''"
                :cover="article.cover || ''" :badges="heroBadges" :labels="labels"
                :cover-hint="article.cover ? '查看封面' : ''" @cover-click="openCover" />
            <!-- 与后台文章详情共用统计条，点赞按钮走插槽 -->
            <ContentStatBar :views="views" :comments="commentTotal"
                :meta-text="formatArticleDate(article.publishedAt || article.createdAt)"
                :meta-chips="metaChips">
                <template #like>
                    <button type="button" class="meta-like" :class="{ liked: likeState.liked, busy: likeBusy }"
                        :disabled="likeBusy || likePending"
                        :title="canInteract ? '点赞 / 取消点赞' : '登录后可点赞'"
                        @click="handleLike">
                        <!-- 状态未就绪时先不渲染图标，避免「未点赞→已点赞」的图标跳变 -->
                        <template v-if="!likePending">
                            <IconLikeFill v-if="likeState.liked" />
                            <IconLikeOutline v-else />
                        </template>
                        {{ likeState.likes }}
                    </button>
                </template>
            </ContentStatBar>
            <!-- 正文：独立阅读区，行宽收窄，图片改为居中卡片 -->
            <article class="detail-reader">
                <div class="detail-html" v-html="article.content"></div>
            </article>

            <!-- 评论区：与图库/随笔详情共用同一套两级评论组件 -->
            <div class="comment-wrap">
                <PortalCommentSection
                    target-type="article"
                    :target-id="article?.id ?? null"
                    @comments-change="onCommentsChange"
                    @need-login="goLogin" />
            </div>
        </div>

        <ContentLightbox :open="coverLightbox" :photos="article?.cover ? [article.cover] : []" :index="0"
            :title="article?.title" @close="coverLightbox = false" />
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
    formatArticleDate,
    parseArticleLabels,
    type ArticleItem,
} from '../../api/article'
import {
    getLikeState,
    toggleLike,
    recordView,
    type LikeState
} from '../../api/portal'
import PortalCommentSection from './PortalCommentSection.vue'
import { useSessionStore } from '../../store/session.ts'
import ContentDetailHero from '../content/ContentDetailHero.vue'
import ContentLightbox from '../content/ContentLightbox.vue'
import ContentStatBar from '../content/ContentStatBar.vue'

const props = defineProps<{
    open: boolean
    article: ArticleItem | null
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'interaction-change', payload: { likes: number; comments: number }): void
    (e: 'view-counted', payload: { views: number }): void
}>()
// 评论区最新总数，用于点赞/评论后回写列表卡片
const commentTotal = ref(0)
const detailLoading = ref(false)
const coverLightbox = ref(false)

const likeState = ref<LikeState>({ liked: false, likes: 0 })
const likeBusy = ref(false)
// 点赞状态加载中：此期间不渲染图标，避免打开弹窗时图标与计数跳变
const likePending = ref(false)

// 浏览量本地副本：接口回读后立即刷新，避免列表与弹窗数字不一致
const views = ref(0)

const router = useRouter()
const proxy = getCurrentInstance()?.proxy
const session = useSessionStore()

// 点赞能力按 comment.like 权限判定，游客角色默认没有该权限
const canInteract = computed(
    () => Boolean(localStorage.getItem('token')) && session.can('comment.like')
)

// 评论区最新总数变化后同步到列表卡片（点赞/评论共用）
const onCommentsChange = (total: number) => {
    commentTotal.value = total
}

// 统计条左侧的分类标签
const metaChips = computed(() => {
    const chips: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning' }[] = []
    if (props.article?.subsetName) chips.push({ text: props.article.subsetName, tone: 'accent' })
    return chips
})

const labels = computed(() => parseArticleLabels(props.article?.label))

// 头部与后台文章详情共用同一组标签语义：分类、状态、发布日期
const heroBadges = computed(() => {
    const badges: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning' }[] = []
    if (props.article?.subsetName) badges.push({ text: props.article.subsetName, tone: 'accent' })
    badges.push({
        text: formatArticleDate(props.article?.publishedAt || props.article?.createdAt || ''),
        tone: 'plain'
    })
    return badges
})

const handleVisibleChange = (value: boolean) => {
    if (!value) emit('close')
}

const loadLikeState = async (articleId: number) => {
    try {
        const result = await getLikeState(articleId)
        if (result.code === 200 && result.data) {
            likeState.value = result.data
        }
    } catch {
        // 点赞状态失败时回退到文章自带的 likes 字段
    }
}

// 打开详情即计一次浏览；后端按访客去重，失败不影响正文展示
const countView = async (articleId: number) => {
    try {
        const result = await recordView('article', articleId)
        if (result.code === 200 && result.data) {
            views.value = result.data.views
            emit('view-counted', { views: result.data.views })
        }
    } catch {
        // 浏览计数失败时保持列表原有数字
    }
}

const goLogin = () => {
    emit('close')
    void router.push('/loginRegister')
}

const openCover = (): void => {
    if (props.article?.cover) coverLightbox.value = true
}

const handleLike = async () => {
    const articleId = props.article?.id
    if (!articleId || likeBusy.value) return

    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后可点赞' })
        return
    }

    likeBusy.value = true
    try {
        const result = await toggleLike(articleId)
        if (result.code === 200 && result.data) {
            likeState.value = result.data
            emit('interaction-change', {
                likes: result.data.likes,
                comments: commentTotal.value
            })
        }
    } catch (error) {
        const message = (error as { response?: { data?: { message?: string } } })
            .response?.data?.message
        proxy?.$message?.({ type: 'error', message: message || '点赞失败，请稍后重试' })
    } finally {
        likeBusy.value = false
    }
}

const loadKey = computed(() => (props.open && props.article?.id ? `${props.article.id}` : ''))

watch(loadKey, async (key, previousKey) => {
    // 同一个 key 不再重复加载，避免父组件更新引起的抖动
    if (key === previousKey) return

    if (!key) {
        commentTotal.value = 0
        detailLoading.value = false
        likePending.value = false
        coverLightbox.value = false
        return
    }

    const articleId = Number(key)
    if (!Number.isFinite(articleId)) return

    {
        // modal 打开期间加载点赞态，用遮罩盖住加载中的跳变
        // 评论由 PortalCommentSection 自己按 targetId 加载
        detailLoading.value = true
        // 计数先用列表数据兜底避免闪成 0；图标等真实状态返回后再渲染，
        // 否则会先显示「未点赞」再跳成「已点赞」，看起来像在闪烁
        likePending.value = true
        likeState.value = {
            liked: false,
            likes: props.article?.likes ?? 0
        }
        views.value = props.article?.views ?? 0
        await loadLikeState(articleId)
        likePending.value = false
        await countView(articleId)
        detailLoading.value = false
    }
}, { immediate: true })
</script>

<style lang="less" scoped>
.detail-content {
    // 滚动交给 yk-modal 自身的 scrollbar，避免嵌套双滚动条
    padding: 4px 4px 8px;
}

.detail-content.loading {
    position: relative;
    min-height: 120px;
    // 加载期间内容半透明，遮罩居中显示 spinner
    & > :not(.detail-loading) {
        opacity: 0.45;
        transition: opacity 0.15s ease;
    }
}

.detail-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
}

// 统计条：与正文阅读区同宽居中，视觉上与正文对齐
.detail-content > :deep(.content-detail-hero) {
    max-width: 820px;
    margin: 0 auto 20px;
}

.content-stat-bar {
    max-width: 720px;
    margin: 0 auto;
    padding-bottom: 16px;
}

// 点赞按钮：与只读 meta 并排，但保留可点击的视觉反馈
.meta-like {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: @font-color-s;
    font-size: @size-s;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;

    &:hover:not(:disabled) {
        border-color: @pcolor;
        color: @pcolor;
    }

    &.liked {
        border-color: @pcolor;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;
    }

    &.busy,
    &:disabled {
        cursor: progress;
        opacity: 0.7;
    }
}

// 阅读区：行宽收窄居中，长文阅读节奏更舒适
.detail-reader {
    max-width: 720px;
    margin: 0 auto;
}

.detail-html {
    font-size: 15.5px;
    line-height: 1.95;
    color: @font-color-l;
    word-break: break-word;

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4) {
        margin: 1.6em 0 0.6em;
        font-family: var(--portal-serif);
        font-weight: 600;
        line-height: 1.4;
        color: @font-color-l;

        &:first-child {
            margin-top: 0;
        }
    }

    :deep(h1) {
        font-size: 24px;
    }

    :deep(h2) {
        font-size: 21px;
    }

    :deep(h3) {
        font-size: 18px;
    }

    :deep(p) {
        margin: 0 0 1em;
    }

    :deep(a) {
        color: @pcolor;
    }

    :deep(blockquote) {
        margin: 1.2em 0;
        padding: 4px 0 4px 16px;
        border-left: 3px solid @pcolor;
        color: @font-color-m;
    }

    :deep(code) {
        padding: 2px 5px;
        border-radius: 3px;
        background: @bg-color-s;
        font-size: 0.92em;
    }

    // 正文图：居中卡片式，不再铺满整行
    :deep(img) {
        display: block;
        // 编辑器保存的内联 width/height 会覆盖 CSS，这里强制兜底
        width: auto !important;
        height: auto !important;
        // 再收一档宽度，让大图以“照片卡片”的形式出现，而不是铺满正文
        max-width: min(88%, 620px) !important;
        // 竖长图限高但不裁切，保持原始比例
        max-height: 380px;
        object-fit: contain;
        margin: 28px auto;
        border-radius: 12px;
        border: 1px solid @line-color-s;
        box-shadow: 0 10px 28px color-mix(in srgb, @font-color-l 10%, transparent);
        cursor: zoom-in;
        transition: transform 0.25s ease, box-shadow 0.25s ease;

        &:hover {
            transform: translateY(-2px);
            box-shadow: @shadow-m;
        }
    }

    // 图床/编辑器常把图片单独包在 p 里，去掉段间距避免图片上下空档过大
    :deep(p:has(> img:only-child)) {
        margin: 0;
    }

    :deep(ul),
    :deep(ol) {
        margin: 0 0 1em;
        padding-left: 1.6em;
    }

    :deep(li) {
        margin: 0.3em 0;
    }

    :deep(hr) {
        margin: 2em auto;
        width: 40%;
        border: none;
        border-top: 1px solid @line-color-s;
    }

    :deep(table) {
        width: 100%;
        margin: 1.4em 0;
        border-collapse: collapse;
        font-size: 0.94em;

        th,
        td {
            padding: 8px 12px;
            border: 1px solid @line-color-s;
            text-align: left;
        }

        th {
            background: @bg-color-s;
            font-weight: 600;
        }
    }

    :deep(pre) {
        padding: 12px;
        border-radius: 8px;
        background: @bg-color-s;
        overflow-x: auto;

        code {
            padding: 0;
            background: transparent;
        }
    }
}

// 评论区：与正文阅读区同宽居中
// 评论区：宽度与正文阅读区对齐，具体样式由 PortalCommentSection 自带
.comment-wrap {
    max-width: 720px;
    margin: 32px auto 0;
}
// 窄屏：阅读区放开到容器宽度，头图改为 16:10 减少留白
@media (max-width: 640px) {
    .detail-reader,
    .content-stat-bar,
    .comment-wrap {
        max-width: 100%;
    }

    .detail-html :deep(img) {
        max-width: 100% !important;
        max-height: 340px;
        margin: 22px auto;
    }

    .detail-html {
        font-size: 15px;
        line-height: 1.85;
    }
}
</style>
