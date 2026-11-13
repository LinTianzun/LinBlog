<template>
    <yk-modal :model-value="open" title="文章阅读" size="l" :show-footer="false" :closeable="true"
        content-height="calc(100vh - 148px)" @update:model-value="handleVisibleChange">
        <div v-if="article" class="detail-content" :class="{ loading: detailLoading }">
            <div v-if="detailLoading" class="detail-loading" aria-live="polite">
                <yk-spinner size="m" />
            </div>
            <!-- 阅读进度：跟随 yk-modal 内部滚动容器，不依赖 window -->
            <div class="reading-progress" aria-hidden="true">
                <span :style="{ width: `${readingProgress}%` }"></span>
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
                <template #actions>
                    <PortalShareButton :url="shareUrl" :title="article?.title"
                        :text="article?.introduce || ''" />
                </template>
            </ContentStatBar>
            <!-- 正文：独立阅读区，桌面端右侧目录，窄屏折叠到正文顶部 -->
            <div class="detail-layout">
                <article class="detail-reader">
                    <details v-if="hasOutline" class="reader-outline reader-outline--mobile">
                        <summary>本文目录 · {{ outline.length }} 节</summary>
                        <nav aria-label="文章目录">
                            <ol>
                                <li v-for="item in outline" :key="item.id"
                                    :class="[`level-${item.level}`, { active: activeHeadingId === item.id }]">
                                    <button type="button" @click="scrollToHeading(item.id)">
                                        {{ item.text }}
                                    </button>
                                </li>
                            </ol>
                        </nav>
                    </details>
                    <div ref="articleBodyRef" class="detail-html" v-html="articleHtml"></div>
                </article>
                <nav v-if="hasOutline" class="reader-outline reader-outline--desktop" aria-label="文章目录">
                    <p class="reader-outline__title">本文目录</p>
                    <ol>
                        <li v-for="item in outline" :key="item.id"
                            :class="[`level-${item.level}`, { active: activeHeadingId === item.id }]">
                            <button type="button" @click="scrollToHeading(item.id)">
                                {{ item.text }}
                            </button>
                        </li>
                    </ol>
                </nav>
            </div>

            <!-- 所属系列：展示系列位置与前后篇，可直接进入系列页继续顺序阅读 -->
            <section v-if="seriesLoading || articleSeries.length" class="article-series"
                aria-labelledby="article-series-heading">
                <header class="article-series-head">
                    <h2 id="article-series-heading">所属系列</h2>
                    <span>IN THIS COLLECTION</span>
                </header>
                <div v-if="seriesLoading" class="article-series-loading">
                    <yk-spinner size="s" />
                </div>
                <div v-else class="article-series-list">
                    <article v-for="context in articleSeries" :key="context.id" class="article-series-card">
                        <div class="article-series-meta">
                            <span>COLLECTION · {{ context.position }} / {{ context.total }}</span>
                            <button type="button" class="article-series-name" @click="openSeries(context.id)">
                                {{ context.name }}
                            </button>
                            <p v-if="context.description">{{ context.description }}</p>
                        </div>
                        <nav class="article-series-nav" :aria-label="`${context.name}系列导航`">
                            <button v-if="context.previous" type="button" class="article-series-step"
                                @click="openSeriesArticle(context.previous)">
                                <span>上一篇</span>
                                <strong>{{ context.previous.title }}</strong>
                            </button>
                            <span v-else class="article-series-step is-empty">已经是系列第一篇</span>

                            <button v-if="context.next" type="button" class="article-series-step is-next"
                                @click="openSeriesArticle(context.next)">
                                <span>下一篇</span>
                                <strong>{{ context.next.title }}</strong>
                            </button>
                            <span v-else class="article-series-step is-empty">已经是系列最后一篇</span>
                        </nav>
                    </article>
                </div>
            </section>

            <!-- 延伸阅读：按分类、标签与热度推荐，点击后原地切换文章 -->
            <section v-if="relatedArticles.length || relatedLoading" class="related-wrap"
                aria-labelledby="related-heading">
                <header class="related-head">
                    <h2 id="related-heading">延伸阅读</h2>
                    <span>RELATED NOTES</span>
                </header>
                <div v-if="relatedLoading" class="related-loading">
                    <yk-spinner size="s" />
                </div>
                <div v-else class="related-grid">
                    <button v-for="item in relatedArticles" :key="item.id" type="button"
                        class="related-card" @click="emit('open-related', item.id)">
                        <span class="related-cover" :class="{ 'is-empty': !relatedCover(item) }">
                            <img v-if="relatedCover(item)"
                                v-bind="responsiveImageAttrs(relatedCover(item), {
                                    widths: IMAGE_WIDTHS.card,
                                    sizes: '(max-width: 640px) 100vw, 220px'
                                })"
                                :alt="item.title" />
                            <span v-else class="related-glyph">
                                {{ (item.title || '文').trim().charAt(0) }}
                            </span>
                        </span>
                        <span class="related-body">
                            <span class="related-meta">{{ item.subsetName || '文章' }}</span>
                            <strong class="related-title">{{ item.title }}</strong>
                            <span class="related-intro">{{ item.introduce || '点击继续阅读' }}</span>
                        </span>
                    </button>
                </div>
            </section>

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
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
    extractArticleCover,
    formatArticleDate,
    parseArticleLabels,
    type ArticleItem,
} from '../../api/article'
import {
    getPublicArticles,
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
import {
    IMAGE_WIDTHS,
    optimizeRichContentImages,
    responsiveImageAttrs,
} from '../../utils/imageOptimization'
import { prepareArticleContent } from '../../utils/articleReading'
import { pickRelatedArticles } from '../../utils/relatedArticles'
import { portalItemUrl } from '../../utils/portalSeo'
import {
    getArticleSeries,
    type ArticleSeriesContext,
    type ArticleSeriesLink,
} from '../../api/collection'
import PortalShareButton from './PortalShareButton.vue'

const props = defineProps<{
    open: boolean
    article: ArticleItem | null
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'open-related', id: number): void
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

// 延伸阅读：详情内原地加载，切换文章时旧请求会被 token 丢弃
const relatedArticles = ref<ArticleItem[]>([])
const relatedLoading = ref(false)
let relatedToken = 0

// 所属系列：文章可能被收进多个系列，每个系列独立展示位置与前后篇
const articleSeries = ref<ArticleSeriesContext[]>([])
const seriesLoading = ref(false)
let seriesToken = 0

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
const shareUrl = computed(() =>
    props.article?.id ? portalItemUrl('article', props.article.id) : ''
)
const relatedCover = (item: ArticleItem): string => extractArticleCover(item)
const preparedContent = computed(() =>
    prepareArticleContent(optimizeRichContentImages(props.article?.content || ''))
)
const articleHtml = computed(() => preparedContent.value.html)
const outline = computed(() => preparedContent.value.outline)
const hasOutline = computed(() => outline.value.length > 1)

// 阅读进度与目录高亮：滚动节点是 yk-modal 内部的 yk-scrollbar__wrap
const articleBodyRef = ref<HTMLElement | null>(null)
const readingProgress = ref(0)
const activeHeadingId = ref('')
let readerScrollEl: HTMLElement | null = null
let headingElements: HTMLElement[] = []
let readingFrame = 0
let readerSetupToken = 0
let copyResetTimers: number[] = []

const findScrollContainer = (el: HTMLElement | null): HTMLElement | null => {
    let node = el?.parentElement ?? null
    while (node) {
        if (node.classList.contains('yk-scrollbar__wrap')) return node
        node = node.parentElement
    }
    return null
}

const updateReadingState = () => {
    const wrap = readerScrollEl
    const body = articleBodyRef.value
    if (!wrap || !body) return

    const wrapRect = wrap.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    const scrollable = bodyRect.height - wrap.clientHeight
    if (scrollable > 80) {
        const passed = Math.min(Math.max(-(bodyRect.top - wrapRect.top), 0), scrollable)
        readingProgress.value = Math.round((passed / scrollable) * 100)
    } else {
        readingProgress.value = 0
    }

    let current = ''
    for (const heading of headingElements) {
        if (heading.getBoundingClientRect().top - wrapRect.top <= 96) {
            current = heading.id
        } else {
            break
        }
    }
    activeHeadingId.value = current
}

const scheduleReadingUpdate = () => {
    if (readingFrame) return
    readingFrame = window.requestAnimationFrame(() => {
        readingFrame = 0
        updateReadingState()
    })
}

const scrollToHeading = (id: string) => {
    const target = document.getElementById(id)
    const wrap = readerScrollEl
    if (!target || !wrap) return

    const wrapRect = wrap.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    activeHeadingId.value = id
    wrap.scrollTo({
        top: Math.max(wrap.scrollTop + targetRect.top - wrapRect.top - 56, 0),
        behavior: reducedMotion ? 'auto' : 'smooth'
    })
}

const copyCodeBlock = async (pre: HTMLElement, button: HTMLButtonElement) => {
    const text = (
        pre.querySelector('code')?.textContent ??
        pre.dataset.codeText ??
        ''
    ).replace(/\n$/, '')
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
        } else {
            const textarea = document.createElement('textarea')
            textarea.value = text
            textarea.setAttribute('readonly', '')
            textarea.style.position = 'fixed'
            textarea.style.opacity = '0'
            document.body.appendChild(textarea)
            textarea.select()
            const copied = document.execCommand('copy')
            document.body.removeChild(textarea)
            if (!copied) throw new Error('copy failed')
        }
        button.textContent = '已复制'
        button.classList.add('copied')
    } catch {
        button.textContent = '复制失败'
    }
    copyResetTimers.push(window.setTimeout(() => {
        button.textContent = '复制'
        button.classList.remove('copied')
    }, 1600))
}

const enhanceCodeBlocks = (root: HTMLElement) => {
    root.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
        if (pre.querySelector(':scope > .code-copy')) return
        const codeText = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
        pre.dataset.codeText = codeText
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'code-copy'
        button.textContent = '复制'
        button.setAttribute('aria-label', '复制代码')
        button.addEventListener('click', () => {
            void copyCodeBlock(pre, button)
        })
        pre.appendChild(button)
    })
}

const teardownReader = () => {
    readerSetupToken += 1
    if (readerScrollEl) {
        readerScrollEl.removeEventListener('scroll', scheduleReadingUpdate)
    }
    if (readingFrame) window.cancelAnimationFrame(readingFrame)
    readingFrame = 0
    copyResetTimers.forEach((timer) => window.clearTimeout(timer))
    copyResetTimers = []
    readerScrollEl = null
    headingElements = []
    readingProgress.value = 0
    activeHeadingId.value = ''
}

const setupReader = async () => {
    teardownReader()
    const token = readerSetupToken
    await nextTick()
    if (token !== readerSetupToken) return

    const body = articleBodyRef.value
    if (!body) return
    readerScrollEl = findScrollContainer(body)
    if (readerScrollEl) readerScrollEl.scrollTop = 0
    headingElements = Array.from(body.querySelectorAll<HTMLElement>('h2[id], h3[id]'))
    enhanceCodeBlocks(body)
    readerScrollEl?.addEventListener('scroll', scheduleReadingUpdate, { passive: true })
    scheduleReadingUpdate()
}

watch(
    [() => props.open, () => props.article?.id, () => articleHtml.value],
    ([open]) => {
        if (open && props.article) {
            void setupReader()
        } else {
            teardownReader()
        }
    },
    { immediate: true, flush: 'post' }
)

onBeforeUnmount(teardownReader)

watch(
    [() => props.open, () => props.article?.id],
    ([open]) => {
        if (!open || !props.article) {
            relatedToken += 1
            relatedArticles.value = []
            relatedLoading.value = false
            return
        }
        void loadRelatedArticles(props.article)
    },
    { immediate: true }
)

const loadArticleSeries = async (articleId: number) => {
    const token = ++seriesToken
    seriesLoading.value = true
    try {
        const result = await getArticleSeries(articleId)
        if (token !== seriesToken) return
        articleSeries.value = result.code === 200 ? result.data?.list || [] : []
    } catch {
        if (token === seriesToken) articleSeries.value = []
    } finally {
        if (token === seriesToken) seriesLoading.value = false
    }
}

watch(
    [() => props.open, () => props.article?.id],
    ([open]) => {
        if (!open || !props.article?.id) {
            seriesToken += 1
            articleSeries.value = []
            seriesLoading.value = false
            return
        }
        void loadArticleSeries(props.article.id)
    },
    { immediate: true }
)

const openSeriesArticle = (link: ArticleSeriesLink | null): void => {
    if (link) emit('open-related', link.id)
}

const openSeries = (collectionId: number): void => {
    const query: Record<string, string> = { collection: String(collectionId) }
    if (props.article?.id) query.open = String(props.article.id)
    void router.push({ path: '/portal/series', query })
}

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

const loadRelatedArticles = async (current: ArticleItem) => {
    const token = ++relatedToken
    relatedLoading.value = true
    relatedArticles.value = []

    // 同时取「最新」「同分类」「同标签」三路候选，合并后按相关度排序。
    // 任何一路失败都不影响其余结果，最差也会退化成最新文章推荐。
    const requests = [
        getPublicArticles({ page: 1, pageSize: 8, sort: 'hot' }),
    ]
    if (current.subsetId) {
        requests.push(
            getPublicArticles({
                page: 1,
                pageSize: 8,
                subsetId: current.subsetId,
                sort: 'hot',
            })
        )
    }
    const firstLabel = parseArticleLabels(current.label)[0]
    if (firstLabel) {
        requests.push(
            getPublicArticles({
                page: 1,
                pageSize: 8,
                label: firstLabel,
                sort: 'hot',
            })
        )
    }

    try {
        const results = await Promise.allSettled(requests)
        if (token !== relatedToken) return

        const pool = new Map<number, ArticleItem>()
        for (const result of results) {
            if (result.status !== 'fulfilled' || result.value.code !== 200) continue
            for (const item of result.value.data?.list || []) {
                if (item.id !== current.id) pool.set(item.id, item)
            }
        }
        relatedArticles.value = pickRelatedArticles(current, [...pool.values()], 3)
    } catch {
        if (token === relatedToken) relatedArticles.value = []
    } finally {
        if (token === relatedToken) relatedLoading.value = false
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

// 阅读进度条：吸附在弹窗滚动容器顶部
.reading-progress {
    position: sticky;
    top: -4px;
    z-index: 6;
    height: 3px;
    margin: -4px -4px 12px;
    background: transparent;
    pointer-events: none;

    span {
        display: block;
        width: 0;
        height: 100%;
        border-radius: 0 2px 2px 0;
        background: @pcolor;
        transition: width 0.12s linear;
    }
}

// 正文与右侧目录：目录列宽为 0，靠溢出贴在正文右侧，正文仍保持居中
.detail-layout {
    display: grid;
    grid-template-columns: minmax(0, 720px) 0;
    justify-content: center;
    align-items: start;
}

.reader-outline {
    ol {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    li {
        margin: 0;
    }

    button {
        display: block;
        width: 100%;
        padding: 5px 8px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: @font-color-m;
        font-size: 12.5px;
        line-height: 1.5;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
        transition: color 0.15s ease, background-color 0.15s ease;

        &:hover,
        &:focus-visible {
            color: @pcolor;
            background: var(--pcolor1);
            outline: 2px solid @pcolor;
            outline-offset: 2px;
        }
    }

    li.level-3 button {
        padding-left: 20px;
        color: @font-color-s;
        font-size: 12px;
    }

    li.active button {
        color: @pcolor;
        background: var(--pcolor1);
        font-weight: 500;
    }
}

.reader-outline__title {
    margin: 0 0 8px;
    padding: 0 8px;
    color: @font-color-s;
    font-size: 11px;
    letter-spacing: 0.08em;
}

.reader-outline--desktop {
    display: none;
    grid-column: 2;
    align-self: start;
    position: sticky;
    top: 16px;
    width: 178px;
    max-height: min(62vh, 520px);
    margin-left: 28px;
    padding-left: 14px;
    overflow: auto;
    border-left: 1px solid @line-color-s;
}

.reader-outline--mobile {
    margin: 0 0 18px;
    padding: 10px 14px;
    border: 1px solid @line-color-s;
    border-radius: 10px;
    background: @bg-color-s;

    summary {
        display: flex;
        align-items: center;
        gap: 8px;
        color: @font-color-m;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        list-style: none;

        &::-webkit-details-marker {
            display: none;
        }

        &::before {
            content: '▸';
            color: @font-color-s;
            transition: transform 0.2s ease;
        }
    }

    &[open] summary::before {
        transform: rotate(90deg);
    }

    nav {
        margin-top: 10px;
    }
}

// 桌面端有足够侧边空间时才展示悬浮目录
@media (min-width: 1200px) {
    .reader-outline--desktop {
        display: block;
    }

    .reader-outline--mobile {
        display: none;
    }
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
        position: relative;
        padding: 12px;
        padding-top: 36px;
        border-radius: 8px;
        background: @bg-color-s;
        overflow-x: auto;

        code {
            padding: 0;
            background: transparent;
        }

        .code-copy {
            position: absolute;
            top: 7px;
            right: 8px;
            padding: 2px 9px;
            border: 1px solid @line-color-s;
            border-radius: 999px;
            background: color-mix(in srgb, @bg-color-l 82%, transparent);
            color: @font-color-s;
            font-size: 11px;
            line-height: 1.6;
            cursor: pointer;
            opacity: 0.62;
            transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;

            &:hover,
            &:focus-visible,
            &.copied {
                opacity: 1;
                border-color: @pcolor;
                color: @pcolor;
                outline: 2px solid @pcolor;
                outline-offset: 2px;
            }
        }
    }
}

// 所属系列：与正文同宽，展示当前在系列中的位置与前后篇
.article-series {
    max-width: 720px;
    margin: 44px auto 0;
    padding-top: 24px;
    border-top: 1px solid @line-color-s;
}

.article-series-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;

    h2 {
        margin: 0;
        font-family: var(--portal-serif);
        font-size: 19px;
        font-weight: 600;
        color: @font-color-l;
    }

    span {
        color: @font-color-s;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.14em;
    }
}

.article-series-loading {
    display: flex;
    min-height: 72px;
    align-items: center;
    justify-content: center;
}

.article-series-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.article-series-card {
    padding: 16px 17px;
    border: 1px solid @line-color-s;
    border-radius: 12px;
    background:
        linear-gradient(135deg, color-mix(in srgb, @pcolor 7%, transparent), transparent 62%),
        color-mix(in srgb, @bg-color-l 88%, transparent);
}

.article-series-meta {
    display: flex;
    flex-direction: column;
    gap: 5px;

    > span {
        color: @pcolor;
        font-size: 10px;
        font-weight: 650;
        letter-spacing: 0.09em;
    }

    p {
        margin: 2px 0 0;
        color: @font-color-m;
        font-size: 12px;
        line-height: 1.65;
    }
}

.article-series-name {
    width: fit-content;
    padding: 0;
    border: 0;
    color: @font-color-l;
    background: transparent;
    font-family: var(--portal-serif);
    font-size: 19px;
    font-weight: 600;
    line-height: 1.35;
    text-align: left;
    cursor: pointer;

    &:hover,
    &:focus-visible {
        color: @pcolor;
        outline: 2px solid @pcolor;
        outline-offset: 2px;
    }
}

.article-series-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
    margin-top: 14px;
}

.article-series-step {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border: 1px solid @line-color-s;
    border-radius: 9px;
    color: @font-color-l;
    background: color-mix(in srgb, @bg-color-s 72%, transparent);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;

    span {
        color: @font-color-s;
        font-size: 10px;
        letter-spacing: 0.05em;
    }

    strong {
        overflow: hidden;
        color: @font-color-l;
        font-size: 12px;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &:hover,
    &:focus-visible {
        border-color: color-mix(in srgb, @pcolor 36%, @line-color-s);
        background: color-mix(in srgb, @pcolor 6%, @bg-color-s);
        outline: 2px solid @pcolor;
        outline-offset: 2px;

        strong {
            color: @pcolor;
        }
    }

    &.is-next {
        text-align: right;
        align-items: flex-end;
    }

    &.is-empty {
        align-items: center;
        justify-content: center;
        color: @font-color-s;
        cursor: default;
        font-size: 11px;

        &:hover {
            border-color: @line-color-s;
            background: color-mix(in srgb, @bg-color-s 72%, transparent);
        }
    }
}

// 延伸阅读：与正文同宽，三列卡片在窄屏退化为单列
.related-wrap {
    max-width: 720px;
    margin: 44px auto 0;
    padding-top: 24px;
    border-top: 1px solid @line-color-s;
}

.related-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;

    h2 {
        margin: 0;
        font-family: var(--portal-serif);
        font-size: 19px;
        font-weight: 600;
        color: @font-color-l;
    }

    span {
        color: @font-color-s;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.14em;
    }
}

.related-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 86px;
}

.related-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
}

.related-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding: 0;
    border: 1px solid @line-color-s;
    border-radius: 12px;
    overflow: hidden;
    background: @bg-color-l;
    text-align: left;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;

    &:hover,
    &:focus-visible {
        transform: translateY(-2px);
        border-color: color-mix(in srgb, @pcolor 36%, @line-color-s);
        box-shadow: @shadow-s;
        outline: 2px solid @pcolor;
        outline-offset: 2px;
    }
}

.related-cover {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background:
        radial-gradient(circle at 24% 18%, color-mix(in srgb, @pcolor 22%, transparent), transparent 58%),
        @bg-color-s;

    img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.35s ease;
    }

    &.is-empty {
        background:
            linear-gradient(135deg, color-mix(in srgb, @pcolor 16%, transparent), transparent 60%),
            @bg-color-s;
    }
}

.related-card:hover .related-cover img {
    transform: scale(1.04);
}

.related-glyph {
    font-family: var(--portal-serif);
    font-size: 32px;
    font-weight: 600;
    color: @pcolor;
    opacity: 0.62;
}

.related-body {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
    padding: 12px 13px 14px;
}

.related-meta {
    color: @pcolor;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.related-title {
    color: @font-color-l;
    font-family: var(--portal-serif);
    font-size: 14.5px;
    font-weight: 600;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.related-intro {
    color: @font-color-s;
    font-size: 12px;
    line-height: 1.55;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
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

    .related-wrap {
        max-width: 100%;
        margin-top: 32px;
    }

    .article-series {
        max-width: 100%;
        margin-top: 32px;
    }

    .article-series-nav {
        grid-template-columns: 1fr;
    }

    .article-series-step.is-next {
        text-align: left;
        align-items: flex-start;
    }

    .related-grid {
        grid-template-columns: 1fr;
    }
}
</style>
