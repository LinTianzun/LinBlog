<template>
    <PortalLayout>
        <!-- 首屏轮播 Hero：约 65vh，标题叠在照片上缘，底部渐变入页面底色 -->
        <section class="hero" :style="{ height: 'var(--portal-banner-height-home)' }">
            <div class="hero-slides">
                <div
                    v-for="(slide, i) in slides"
                    :key="slide.id"
                    class="hero-slide"
                    :class="{ active: i === currentIndex }"
                    :style="{ backgroundImage: `url(${slide.image}), ${themeGradient(slide)}` }"
                />
            </div>
            <!-- 底部渐变遮罩：明暗双态停靠到页面底色，禁止白色断层 -->
            <div class="hero-fade" />
            <div class="hero-content">
                <p class="hero-eyebrow">{{ currentSlide.subtitle }}</p>
                <h1 class="hero-title">{{ currentSlide.title }}</h1>
                <p class="hero-lead">
                    技术长文、摄影图库、带天气的随笔——同一个人的三种记录方式，都收在这里。
                </p>
                <div class="hero-links">
                    <RouterLink class="hero-pill" to="/portal/articles">读文章</RouterLink>
                    <RouterLink class="hero-pill" to="/portal/gallery">看照片</RouterLink>
                    <RouterLink class="hero-pill" to="/portal/diary">翻随笔</RouterLink>
                </div>
            </div>
            <!-- 轮播指示器 -->
            <div class="hero-dots">
                <button
                    v-for="(slide, i) in slides"
                    :key="slide.id"
                    type="button"
                    class="hero-dot"
                    :class="{ active: i === currentIndex }"
                    :aria-label="`切换到第 ${i + 1} 张`"
                    @click="goToSlide(i)"
                />
            </div>
        </section>

        <!-- 玻璃 fact 卡：数据条 -->
        <section class="facts-bar">
            <div v-for="fact in facts" :key="fact.label" class="fact-card portal-glass">
                <div class="fact-value">{{ fact.value }}</div>
                <div class="fact-label">{{ fact.label }}</div>
            </div>
        </section>

        <!-- 分类索引已移入文章页：页面内有完整的分类/标签/搜索/排序筛选，首页不再重复 -->
        <!-- 最新文章 -->
        <section class="block portal-reveal">
            <div class="block-head">
                <h2 class="portal-section-title">最新发布</h2>
                <RouterLink class="block-more" to="/portal/articles">
                    全部文章
                    <IconRightOutline />
                </RouterLink>
            </div>

            <div v-if="articleLoading" class="block-state">
                <yk-spinner size="m" />
            </div>
            <div v-else-if="articleList.length" class="post-list">
                <article v-for="(article, i) in articleList" :key="article.id" class="post-row"
                    :style="{ animationDelay: `${Math.min(i, 8) * 45}ms` }">
                    <button type="button" class="post-link" @click="openArticle(article.id)">
                        <!-- 封面：有图显示图，无图用主题色排印占位，不重复展示误导性默认图 -->
                        <span class="post-cover portal-media-box" :class="{ 'is-empty': !articleCover(article) }">
                            <img v-if="articleCover(article)" :src="articleCover(article)" :alt="article.title"
                                loading="lazy" />
                            <span v-else class="post-cover-glyph">{{ (article.title || '文').trim().charAt(0) }}</span>
                        </span>
                        <span class="post-body">
                            <time class="post-date">{{ formatDate(article.publishedAt || article.createdAt) }}</time>
                            <h3 class="post-title">{{ article.title }}</h3>
                            <p class="post-introduce">{{ article.introduce || '点击阅读全文' }}</p>
                            <span class="post-meta">
                                <span v-if="article.subsetName" class="post-chip">{{ article.subsetName }}</span>
                                <span><IconEyeOutline />{{ article.views }}</span>
                                <span><IconLikeOutline />{{ article.likes }}</span>
                            </span>
                        </span>
                    </button>
                </article>
            </div>
            <div v-else class="block-state">
                <yk-empty description="这里还没有已发布的文章" />
            </div>
        </section>

        <!-- 摄影图库预览 -->
        <section class="block portal-reveal">
            <div class="block-head">
                <h2 class="portal-section-title">摄影图库</h2>
                <RouterLink class="block-more" to="/portal/gallery">
                    全部图库
                    <IconRightOutline />
                </RouterLink>
            </div>

            <div v-if="galleryLoading" class="block-state">
                <yk-spinner size="m" />
            </div>
            <PortalPhotoWall v-else-if="galleryList.length" :items="galleryPrints" />
            <div v-else class="block-state">
                <yk-empty description="还没有发布摄影图库" />
            </div>
        </section>

        <!-- 随笔：带天气的小卡片 -->
        <section class="block portal-reveal">
            <div class="block-head">
                <h2 class="portal-section-title">随笔随记</h2>
                <RouterLink class="block-more" to="/portal/diary">
                    全部随笔
                    <IconRightOutline />
                </RouterLink>
            </div>

            <div v-if="diaryLoading" class="block-state">
                <yk-spinner size="m" />
            </div>
            <div v-else-if="diaryList.length" class="diary-grid">
                <button v-for="diary in diaryList" :key="diary.id" type="button" class="diary-card"
                    @click="openDiary(diary)">
                    <span class="diary-weather">
                        <img v-if="weatherIcon(diary.weatherName)" :src="weatherIcon(diary.weatherName)"
                            :alt="diary.weatherName || ''" />
                        <span>{{ diary.weatherName || '未记天气' }}</span>
                    </span>
                    <span class="diary-title">{{ diary.title }}</span>
                    <span class="diary-text">{{ diary.content }}</span>
                    <time class="diary-date">{{ formatDate(diary.createdAt) }}</time>
                </button>
            </div>
            <div v-else class="block-state">
                <yk-empty description="还没有随笔" />
            </div>
        </section>
        <PortalArticleDetail :open="articleVisible" :article="activeArticle" @close="closeArticle"
            @interaction-change="handleInteractionChange" @view-counted="handleViewCounted" />
        <PortalDiaryDetail :open="diaryVisible" :item="activeDiary" @close="closeDiary"
            @view-counted="handleDiaryViewCounted" />
    </PortalLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import PortalLayout from '../components/portal/PortalLayout.vue'
import PortalPhotoWall, { type WallPrint } from '../components/portal/PortalPhotoWall.vue'
import PortalArticleDetail from '../components/portal/PortalArticleDetail.vue'
import PortalDiaryDetail from '../components/portal/PortalDiaryDetail.vue'
import { BANNER_SLIDES, type BannerSlide, deriveCurrentIndex, getSlide, startBannerRotation, subscribeBanner } from '../utils/portalBanner'
import { useThemeDark } from '../utils/themeMode'
import {
    getPublicArticles,
    getPublicArticleById,
    getPublicSubsets,
    getPublicDiaries,
    type PortalDiary,
    type PortalSubset,
} from '../api/portal'
import { extractArticleCover, parseGalleryContent, type ArticleItem } from '../api/article'
import { weathers } from '../utils/weather'

const articleList = ref<ArticleItem[]>([])
const articleLoading = ref(false)
const galleryList = ref<ArticleItem[]>([])
const galleryLoading = ref(false)
const diaryList = ref<PortalDiary[]>([])
const diaryLoading = ref(false)
const subsetList = ref<PortalSubset[]>([])

const articleVisible = ref(false)
const activeArticle = ref<ArticleItem | null>(null)
const diaryVisible = ref(false)
const activeDiary = ref<PortalDiary | null>(null)

const totalArticles = ref(0)
const totalDiaries = ref(0)

// 轮播共享状态：首页全显示（intensity=1），跨页共享 index/timestamp
const slides = BANNER_SLIDES
const currentIndex = ref(0)
const isDark = useThemeDark()
const themeGradient = (slide: BannerSlide): string => {
    return isDark.value ? slide.gradient.dark : slide.gradient.light
}
const currentSlide = computed(() => getSlide(currentIndex.value))
const goToSlide = (i: number) => {
    currentIndex.value = i
}
let stopRotation: (() => void) | null = null
let unsub: (() => void) | null = null

const stats = computed(() => ({
    articles: totalArticles.value,
    galleries: galleryList.value.length,
    diaries: totalDiaries.value,
    categories: subsetList.value.length
}))

// 玻璃 fact 卡数据
const facts = computed(() => [
    { label: '篇文章', value: stats.value.articles },
    { label: '组图库', value: stats.value.galleries },
    { label: '篇随笔', value: stats.value.diaries },
    { label: '个分类', value: stats.value.categories }
])

// 图库橱窗的排版：大图、小图、竖图交错落位
const galleryPrints = computed<WallPrint[]>(() => galleryList.value.map((item, index) => {
    const images = parseGalleryContent(item.content)
    const cover = item.cover || images[0] || ''
    // 首图作主导大图，之后依次以方形小图落在右列，形成主次分明的三联
    const span: WallPrint['span'] = index === 0 ? 'wide' : index % 2 === 1 ? 'portrait' : 'small'
    return {
        id: item.id,
        title: item.title,
        note: item.subsetName || '',
        image: cover,
        alt: item.title,
        glyph: (item.title || '影').trim().charAt(0),
        tone: Math.abs(item.id) % 4,
        count: images.length,
        to: `/portal/gallery?open=${item.id}`,
        span,
        offset: 0
    }
}))

const weatherIcon = (name: string | null): string => {
    if (!name) return ''
    return weathers.find(item => item.name === name)?.iconUrl || ''
}

const formatDate = (value: string): string => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN')
}

// 列表封面：没有真实封面时返回空，改走主题色排印占位
const articleCover = (article: ArticleItem): string => extractArticleCover(article)

const loadArticles = async () => {
    articleLoading.value = true
    try {
        // 首页只做精选预览，完整列表在文章页/图库页翻阅
        const result = await getPublicArticles({ page: 1, pageSize: 3 })
        if (result.code === 200) {
            articleList.value = result.data?.list || []
            totalArticles.value = result.data?.total || 0
        }
    } finally {
        articleLoading.value = false
    }
}

const loadGallery = async () => {
    galleryLoading.value = true
    try {
        const result = await getPublicArticles({ page: 1, pageSize: 3, classify: 'image' })
        if (result.code === 200) {
            galleryList.value = result.data?.list || []
        }
    } catch {
        // 图库为空时不影响首页其他板块
    } finally {
        galleryLoading.value = false
    }
}

const loadDiary = async () => {
    diaryLoading.value = true
    try {
        const result = await getPublicDiaries({ page: 1, pageSize: 3 })
        if (result.code === 200) {
            diaryList.value = result.data?.list || []
            totalDiaries.value = result.data?.total || 0
        }
    } catch {
        // 同上
    } finally {
        diaryLoading.value = false
    }
}

// 首页不再展示分类/标签列表，只取分类数量用于统计卡
const loadSubsetCount = async () => {
    try {
        const result = await getPublicSubsets()
        if (result.code === 200) {
            subsetList.value = (result.data?.list || []).filter(item => item.value > 0)
        }
    } catch {
        // 统计失败不影响首页其他板块
    }
}

const closeArticle = () => {
    articleVisible.value = false
    activeArticle.value = null
}

const handleInteractionChange = (payload: { likes: number; comments: number }) => {
    if (!activeArticle.value) return
    activeArticle.value = {
        ...activeArticle.value,
        likes: payload.likes,
        comments: payload.comments
    }
    const target = articleList.value.find(item => item.id === activeArticle.value?.id)
    if (target) {
        target.likes = payload.likes
        target.comments = payload.comments
    }
}

// 详情回读的真实浏览量写回首页列表卡片
const handleViewCounted = (payload: { views: number }) => {
    if (!activeArticle.value) return
    activeArticle.value = { ...activeArticle.value, views: payload.views }
    const target = articleList.value.find(item => item.id === activeArticle.value?.id)
    if (target) target.views = payload.views
}

const handleDiaryViewCounted = (payload: { id: number; views: number }) => {
    const target = diaryList.value.find(item => item.id === payload.id)
    if (target) target.views = payload.views
}

const openArticle = async (id: number) => {
    // 先加载详情，数据就绪后再开 modal，避免 modal 先开空态再填内容造成的闪烁
    try {
        const result = await getPublicArticleById(id)
        if (result.code === 200) {
            activeArticle.value = result.data || null
            articleVisible.value = true
        }
    } catch {
        articleVisible.value = false
    }
}

const openDiary = (item: PortalDiary) => {
    activeDiary.value = item
    diaryVisible.value = true
}

const closeDiary = () => {
    diaryVisible.value = false
    activeDiary.value = null
}

onMounted(() => {
    void loadArticles()
    void loadGallery()
    void loadDiary()
    void loadSubsetCount()
    // 启动轮播：单一共享 interval，切页不重置
    currentIndex.value = deriveCurrentIndex()
    stopRotation = startBannerRotation((idx) => {
        currentIndex.value = idx
    })
    unsub = subscribeBanner((idx) => {
        currentIndex.value = idx
    })
})

onUnmounted(() => {
    stopRotation?.()
    unsub?.()
})
</script>
<style lang="less" scoped>
// ---------- 首屏轮播 Hero ----------
.hero {
    position: relative;
    width: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
    margin-top: -1px;
}

// 照片上统一压一层深色遮罩：浅色主题避免亮图吞掉白字，
// 深色主题也不会再把文字反转成近黑色。
.hero::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background:
        linear-gradient(
            90deg,
            rgba(7, 10, 17, 0.64) 0%,
            rgba(7, 10, 17, 0.4) 42%,
            rgba(7, 10, 17, 0.08) 74%,
            transparent 100%
        ),
        linear-gradient(
            180deg,
            rgba(7, 10, 17, 0.2) 0%,
            transparent 36%,
            rgba(7, 10, 17, 0.08) 72%,
            transparent 100%
        );
}

.hero-slides {
    position: absolute;
    inset: 0;
    z-index: 1;
}

.hero-slide {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity var(--portal-transition-slow) ease;
    background-size: cover, cover;
    background-position: center, center;
    &.active {
        opacity: 1;
    }
}

// 底部渐变：明暗双态停靠到页面底色，禁止白色断层
.hero-fade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 45%;
    z-index: 3;
    background: linear-gradient(
        to bottom,
        transparent 0%,
        color-mix(in srgb, var(--portal-page-bg) 30%, transparent) 40%,
        color-mix(in srgb, var(--portal-page-bg) 70%, transparent) 70%,
        var(--portal-page-bg) 100%
    );
    pointer-events: none;
}

.hero-content {
    position: relative;
    z-index: 4;
    width: var(--portal-page-width);
    margin: 0 auto;
    padding: 0 0 8vh;
    color: var(--portal-hero-ink);
    text-shadow: var(--portal-hero-shadow);
}

.hero-eyebrow {
    margin: 0 0 16px;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.18em;
    color: var(--portal-hero-ink-muted);
}

.hero-title {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: clamp(38px, 4.6vw, 64px);
    font-weight: 600;
    line-height: 1.16;
    letter-spacing: 0.01em;
    color: var(--portal-hero-ink);
    text-shadow: 0 3px 34px rgba(0, 0, 0, 0.62);
}

.hero-lead {
    max-width: 46ch;
    margin: 20px 0 0;
    font-size: 16px;
    line-height: 1.85;
    color: var(--portal-hero-ink-muted);
}

.hero-links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 28px;
}

.hero-pill {
    padding: 10px 22px;
    border-radius: var(--portal-radius-pill);
    background: var(--portal-hero-surface);
    border: 1px solid var(--portal-hero-border);
    font-size: 14px;
    font-weight: 500;
    color: var(--portal-hero-ink);
    text-decoration: none;
    text-shadow: none;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.14);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition: all var(--portal-transition-fast);

    &:hover,
    &:focus-visible {
        background: var(--portal-hero-button-hover-bg);
        border-color: rgba(255, 255, 255, 0.95);
        color: var(--portal-hero-button-hover-ink);
        transform: translateY(-1px);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24);
    }

    &:focus-visible {
        outline: 2px solid rgba(255, 255, 255, 0.88);
        outline-offset: 3px;
    }
}

.hero-dots {
    position: absolute;
    bottom: 4vh;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: var(--portal-radius-pill);
    background: rgba(7, 10, 17, 0.3);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}

.hero-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.52);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.18);
    cursor: pointer;
    transition: all var(--portal-transition-fast);
    &.active {
        background: var(--portal-hero-ink);
        width: 24px;
        border-radius: var(--portal-radius-pill);
    }
    &:hover {
        background: var(--portal-hero-ink);
    }
    &:focus-visible {
        outline: 2px solid rgba(255, 255, 255, 0.9);
        outline-offset: 3px;
    }
}

// ---------- 玻璃 fact 卡 ----------
.facts-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin: -6vh auto 0;
    position: relative;
    z-index: 5;
    width: var(--portal-page-width);
}

.fact-card {
    flex: 1;
    min-width: 140px;
    padding: 22px 26px;
    text-align: center;
    transition: transform var(--portal-transition-medium);
    &:hover {
        transform: translateY(-3px);
        box-shadow: var(--portal-shadow-hover);
    }
}

.fact-value {
    font-family: var(--portal-serif);
    font-size: 32px;
    font-weight: 600;
    line-height: 1;
    color: var(--portal-accent-strong);
    font-variant-numeric: tabular-nums;
}

.fact-label {
    margin-top: 6px;
    font-size: 13px;
    color: var(--portal-text-secondary);
}

// ---------- 通用板块 ----------
.block {
    margin-top: 88px;
}

.block-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 28px;
}

.block-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    color: var(--portal-text-secondary);
    text-decoration: none;
    transition: color var(--portal-transition-fast);

    &:hover {
        color: var(--portal-accent);
    }
}

.block-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
}

// ---------- 文章列表 ----------
.post-list {
    display: flex;
    flex-direction: column;
}

.post-row {
    border-bottom: 1px solid var(--portal-line-soft);
    animation: portal-reveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;

    &:last-child {
        border-bottom: none;
    }
}

.post-link {
    display: grid;
    grid-template-columns: 168px 1fr;
    column-gap: 24px;
    width: 100%;
    padding: 24px 0;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    text-decoration: none;
    transition: background-color 0.2s ease;
}

// 封面：固定 4:3 比例容器，避免原始尺寸撑破布局
.post-cover {
    grid-row: 1 / span 3;
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: var(--portal-radius-small);
    overflow: hidden;
    background: var(--portal-accent-soft);
    transition: transform var(--portal-transition-medium), box-shadow var(--portal-transition-medium);

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
}

// 无封面时的排印占位：主题色渐变 + 标题首字，避免生硬灰块
.post-cover-glyph {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
    font-family: var(--portal-serif);
    font-size: 40px;
    font-weight: 600;
    color: var(--portal-accent-strong);
    opacity: 0.55;
}

.post-body {
    display: block;
    min-width: 0;
}

.post-date {
    font-size: 13px;
    color: var(--portal-text-secondary);
    font-variant-numeric: tabular-nums;
    padding-top: 4px;
}

.post-title {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: 20px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--portal-text-primary);
    transition: color var(--portal-transition-fast);
}

.post-introduce {
    margin: 6px 0 0;
    font-size: 14px;
    line-height: 1.75;
    color: var(--portal-text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.post-meta {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 10px;
    font-size: 13px;
    color: var(--portal-text-secondary);

    span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
}

.post-chip {
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--portal-accent-soft);
    color: var(--portal-accent-strong);
    font-weight: 500;
}

.post-row:hover {
    .post-title {
        color: var(--portal-accent);
    }

    // hover 时封面轻微放大与描边，强化可点击感
    .post-cover {
        transform: scale(1.02);
        box-shadow: var(--portal-shadow-hover);
    }
}

// ---------- 随笔卡片 ----------
.diary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 18px;
}

.diary-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 22px;
    border-radius: var(--portal-radius-card);
    text-align: left;
    cursor: pointer;
    transition: all var(--portal-transition-medium);

    &:hover {
        transform: translateY(-3px);
        box-shadow: var(--portal-shadow-hover);
        background: var(--portal-surface-hover);
    }
}

.diary-weather {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--portal-text-secondary);

    img {
        width: 18px;
        height: 18px;
    }
}

.diary-title {
    font-family: var(--portal-serif);
    font-size: 18px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--portal-text-primary);
}

.diary-text {
    flex: 1;
    font-size: 14px;
    line-height: 1.8;
    color: var(--portal-text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.diary-date {
    font-size: 12px;
    color: var(--portal-text-secondary);
    font-variant-numeric: tabular-nums;
}


// ---------- 响应式 ----------
@media (max-width: 1279px) {
    .hero-content {
        padding-bottom: 6vh;
    }
    .facts-bar {
        flex-wrap: wrap;
        margin-top: -4vh;
    }
    .fact-card {
        min-width: calc(33% - 11px);
    }
}

@media (max-width: 900px) {
    .facts-bar {
        margin-top: -4vh;
    }
    .fact-card {
        min-width: calc(50% - 8px);
    }
    .block {
        margin-top: 64px;
    }
    .post-link {
        grid-template-columns: 1fr;
        row-gap: 12px;
    }

    // 窄屏改为封面在上、16:9 全宽，阅读流更自然
    .post-cover {
        grid-row: auto;
        aspect-ratio: 16 / 9;
    }
}

@media (max-width: 768px) {
    .hero-content {
        padding: 0 24px 4vh;
    }
    .facts-bar {
        gap: 10px;
    }
    .fact-card {
        min-width: calc(50% - 5px);
        padding: 16px 18px;
    }
    .fact-value {
        font-size: 26px;
    }
}

@media (max-width: 560px) {
    .hero-title {
        font-size: 34px;
    }
    .diary-grid {
        grid-template-columns: 1fr;
    }
}

// 旧主题色样式回退：被移除的旧选择器保留空，避免遗留引用报错
.hero-inner,
.hero-copy,
.hero-figure,
.hero-print,
.hero-facts,
.hero-link {
    display: none;
}
</style>
