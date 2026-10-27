<template>
    <PortalLayout>
        <!-- 首屏轮播 Hero：照片负责氛围，左右双栏负责叙事与入口 -->
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
                <div class="hero-copy">
                    <p class="hero-eyebrow">
                        <span class="hero-issue">ISSUE {{ slideNumber }}</span>
                        <span>{{ currentSlide.subtitle }}</span>
                    </p>
                    <h1 class="hero-title">{{ currentSlide.title }}</h1>
                    <p class="hero-lead">
                        把技术里的推敲、镜头里的光线和日子里的情绪放在一起，
                        写成一份缓慢更新、但始终诚实的个人刊物。
                    </p>
                    <div class="hero-links">
                        <RouterLink class="hero-pill hero-pill-primary" to="/portal/articles">
                            开始阅读
                            <IconRightOutline />
                        </RouterLink>
                        <RouterLink class="hero-pill" to="/portal/gallery">浏览摄影集</RouterLink>
                        <RouterLink class="hero-pill" to="/portal/diary">翻看随笔</RouterLink>
                    </div>
                </div>

                <aside class="hero-aside" aria-label="卷首语">
                    <span class="hero-aside-kicker">EDITOR'S NOTE</span>
                    <blockquote>
                        记录不是为了证明什么，
                        只是让那些一闪而过的时刻，有地方留下来。
                    </blockquote>
                    <div class="hero-aside-foot">
                        <span>林知雨 · 个人刊物</span>
                        <RouterLink to="/portal/messages">
                            留言给我
                            <IconRightOutline />
                        </RouterLink>
                    </div>
                </aside>
            </div>
            <div class="hero-meta">
                <span class="hero-counter">{{ slideNumber }} / {{ slideTotal }}</span>
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
                <span class="hero-scroll">SCROLL TO READ</span>
            </div>
        </section>

        <!-- 刊物索引：用一条横向目录替代四张同构统计卡 -->
        <section class="journal-index portal-glass portal-reveal">
            <div class="index-intro">
                <span class="index-kicker">CONTENTS / 本期目录</span>
                <h2>写作、光线，<br />还有普通日子。</h2>
                <p>持续记录中，欢迎随意翻阅。</p>
            </div>
            <div class="index-facts">
                <div v-for="(fact, index) in facts" :key="fact.label" class="fact-card">
                    <span class="fact-index">0{{ index + 1 }}</span>
                    <span class="fact-value">{{ fact.value }}</span>
                    <span class="fact-label">{{ fact.label }}</span>
                </div>
            </div>
        </section>

        <!-- 分类索引已移入文章页：页面内有完整的分类/标签/搜索/排序筛选，首页不再重复 -->
        <!-- 最新文章 -->
        <section class="block portal-reveal">
            <div class="block-head">
                <div class="block-heading">
                    <span class="block-kicker">01 / LATEST NOTES</span>
                    <h2 class="portal-section-title">最近写下的</h2>
                </div>
                <RouterLink class="block-more" to="/portal/articles">
                    全部文章
                    <IconRightOutline />
                </RouterLink>
            </div>

            <div v-if="articleLoading" class="block-state">
                <yk-spinner size="m" />
            </div>
            <div v-else-if="featuredArticle" class="story-layout">
                <article class="story-featured">
                    <button type="button" class="story-feature-link" @click="openArticle(featuredArticle.id)">
                        <span class="story-feature-media portal-media-box"
                            :class="{ 'is-empty': !articleCover(featuredArticle) }">
                            <img v-if="articleCover(featuredArticle)" :src="articleCover(featuredArticle)"
                                :alt="featuredArticle.title" loading="lazy" />
                            <span v-else class="story-placeholder">
                                {{ (featuredArticle.title || '文').trim().charAt(0) }}
                            </span>
                            <span class="story-feature-shade" />
                            <span class="story-feature-copy">
                                <span class="story-meta-line">
                                    <span>{{ featuredArticle.subsetName || '随笔' }}</span>
                                    <time>{{ formatDate(featuredArticle.publishedAt || featuredArticle.createdAt) }}</time>
                                </span>
                                <strong>{{ featuredArticle.title }}</strong>
                                <span class="story-feature-intro">
                                    {{ featuredArticle.introduce || '点击阅读全文' }}
                                </span>
                                <span class="story-feature-stats">
                                    <span><IconEyeOutline />{{ featuredArticle.views }}</span>
                                    <span><IconLikeOutline />{{ featuredArticle.likes }}</span>
                                </span>
                            </span>
                        </span>
                    </button>
                </article>

                <div class="story-side">
                    <article v-for="(article, i) in secondaryArticles" :key="article.id" class="story-compact"
                        :style="{ animationDelay: `${i * 70}ms` }">
                        <button type="button" class="story-compact-link" @click="openArticle(article.id)">
                            <span class="story-compact-number">0{{ i + 2 }}</span>
                            <span class="story-compact-body">
                                <span class="story-compact-meta">
                                    <span>{{ article.subsetName || '文章' }}</span>
                                    <time>{{ formatDate(article.publishedAt || article.createdAt) }}</time>
                                </span>
                                <strong>{{ article.title }}</strong>
                                <span class="story-compact-intro">
                                    {{ article.introduce || '点击阅读全文' }}
                                </span>
                            </span>
                            <span class="story-compact-arrow" aria-hidden="true">
                                <IconRightOutline />
                            </span>
                        </button>
                    </article>
                    <RouterLink class="story-all" to="/portal/articles">
                        <span>继续翻阅全部文章</span>
                        <IconRightOutline />
                    </RouterLink>
                </div>
            </div>
            <div v-else class="block-state">
                <yk-empty description="这里还没有已发布的文章" />
            </div>
        </section>

        <!-- 摄影图库预览 -->
        <section class="block portal-reveal">
            <div class="block-head">
                <div class="block-heading">
                    <span class="block-kicker">02 / PHOTOGRAPHS</span>
                    <h2 class="portal-section-title">光落下的地方</h2>
                </div>
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
                <div class="block-heading">
                    <span class="block-kicker">03 / MICRO JOURNAL</span>
                    <h2 class="portal-section-title">日子与天气</h2>
                </div>
                <RouterLink class="block-more" to="/portal/diary">
                    全部随笔
                    <IconRightOutline />
                </RouterLink>
            </div>

            <div v-if="diaryLoading" class="block-state">
                <yk-spinner size="m" />
            </div>
            <div v-else-if="diaryList.length" class="diary-grid">
                <button v-for="(diary, index) in diaryList" :key="diary.id" type="button"
                    class="diary-card" :class="`tone-${index % 3}`" @click="openDiary(diary)">
                    <span class="diary-mark" aria-hidden="true">“</span>
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

        <section class="closing-note portal-reveal">
            <div>
                <span class="block-kicker">04 / KEEP IN TOUCH</span>
                <h2>如果你也刚好路过，<br />留下一句话再走吧。</h2>
            </div>
            <div class="closing-side">
                <p>这里没有催促，也没有算法。更新随缘，阅读也一样。</p>
                <RouterLink class="closing-link" to="/portal/messages">
                    去留言墙
                    <IconRightOutline />
                </RouterLink>
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
const slideNumber = computed(() => String(currentIndex.value + 1).padStart(2, '0'))
const slideTotal = computed(() => String(slides.length).padStart(2, '0'))
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

const featuredArticle = computed(() => articleList.value[0] || null)
const secondaryArticles = computed(() => articleList.value.slice(1, 3))

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
    // 轮播内容与照片边缘至少保留一档呼吸空间，避免文字和按钮贴边
    --hero-inline-padding: clamp(28px, 4vw, 64px);
    position: relative;
    width: 100%;
    overflow: hidden;
    display: flex;
    align-items: stretch;
    margin-top: -1px;
    background: #111720;
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
            rgba(7, 10, 17, 0.76) 0%,
            rgba(7, 10, 17, 0.48) 44%,
            rgba(7, 10, 17, 0.12) 76%,
            transparent 100%
        ),
        linear-gradient(
            180deg,
            rgba(7, 10, 17, 0.34) 0%,
            transparent 38%,
            rgba(7, 10, 17, 0.12) 70%,
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
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
    align-items: end;
    gap: clamp(40px, 7vw, 112px);
    width: 100%;
    margin: 0 auto;
    padding: clamp(88px, 12vh, 150px) var(--hero-inline-padding) calc(9vh + 30px);
    box-sizing: border-box;
    color: var(--portal-hero-ink);
    text-shadow: var(--portal-hero-shadow);
}

.hero-copy {
    max-width: 760px;
}

.hero-eyebrow {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 0 16px;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.1em;
    color: var(--portal-hero-ink-muted);
}

.hero-issue {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.34);
    border-radius: var(--portal-radius-pill);
    background: rgba(7, 10, 17, 0.24);
    color: var(--portal-hero-ink);
    font-size: 11px;
    letter-spacing: 0.14em;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}

.hero-title {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: clamp(48px, 6.2vw, 92px);
    font-weight: 600;
    line-height: 1.08;
    letter-spacing: -0.025em;
    color: var(--portal-hero-ink);
    text-shadow: 0 3px 34px rgba(0, 0, 0, 0.62);
}

.hero-lead {
    max-width: 50ch;
    margin: 24px 0 0;
    font-size: 17px;
    line-height: 1.9;
    color: var(--portal-hero-ink-muted);
}

.hero-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 34px;
}

.hero-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 22px;
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

.hero-pill-primary {
    background: rgba(255, 255, 255, 0.94);
    border-color: rgba(255, 255, 255, 0.94);
    color: var(--portal-hero-button-hover-ink);
}

.hero-aside {
    align-self: end;
    max-width: 360px;
    margin-left: auto;
    padding: 26px 28px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: calc(var(--portal-radius-card) + 8px);
    background: rgba(7, 10, 17, 0.34);
    color: var(--portal-hero-ink);
    backdrop-filter: blur(18px) saturate(130%);
    -webkit-backdrop-filter: blur(18px) saturate(130%);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
}

.hero-aside-kicker {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.2em;
    color: var(--portal-hero-ink-muted);
}

.hero-aside blockquote {
    margin: 20px 0 24px;
    font-family: var(--portal-serif);
    font-size: clamp(19px, 1.6vw, 24px);
    line-height: 1.75;
    color: var(--portal-hero-ink);
}

.hero-aside-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-top: 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.18);
    font-size: 12px;
    color: var(--portal-hero-ink-muted);

    a {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--portal-hero-ink);
        text-decoration: none;

        &:hover {
            text-decoration: underline;
            text-underline-offset: 4px;
        }
    }
}

.hero-meta {
    position: absolute;
    left: 50%;
    bottom: calc(5vh + 20px);
    z-index: 5;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 20px;
    width: 100%;
    padding-inline: var(--hero-inline-padding);
    box-sizing: border-box;
    transform: translateX(-50%);
    color: var(--portal-hero-ink-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
}

.hero-counter {
    justify-self: start;
    font-variant-numeric: tabular-nums;
}

.hero-scroll {
    justify-self: end;
}

.hero-dots {
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
        width: 28px;
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

// ---------- 刊物索引 ----------
.journal-index {
    display: grid;
    grid-template-columns: minmax(250px, 0.72fr) minmax(0, 1.28fr);
    gap: clamp(32px, 5vw, 72px);
    margin: -5vh auto 0;
    position: relative;
    z-index: 5;
    width: 100%;
    padding: clamp(28px, 3.2vw, 46px);
    border-radius: calc(var(--portal-radius-card) + 8px);
}

.index-intro {
    padding-right: 28px;
    border-right: 1px solid var(--portal-line-soft);

    h2 {
        margin: 12px 0 14px;
        font-family: var(--portal-serif);
        font-size: clamp(25px, 2.3vw, 36px);
        font-weight: 600;
        line-height: 1.35;
        color: var(--portal-text-primary);
    }

    p {
        margin: 0;
        font-size: 13px;
        color: var(--portal-text-tertiary);
    }
}

.index-kicker,
.block-kicker {
    color: var(--portal-accent-strong);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
}

.index-facts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: stretch;
}

.fact-card {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    padding: 10px 22px;
    border-left: 1px solid var(--portal-line-soft);
    transition: transform var(--portal-transition-medium), color var(--portal-transition-fast);

    &:first-child {
        border-left: none;
    }

    &:hover {
        transform: translateY(-2px);
    }
}

.fact-index {
    margin-bottom: 22px;
    color: var(--portal-text-tertiary);
    font-size: 10px;
    letter-spacing: 0.14em;
}

.fact-value {
    font-family: var(--portal-serif);
    font-size: clamp(34px, 3.4vw, 52px);
    font-weight: 600;
    line-height: 1;
    color: var(--portal-accent-strong);
    font-variant-numeric: tabular-nums;
}

.fact-label {
    margin-top: 10px;
    font-size: 13px;
    color: var(--portal-text-secondary);
}

// ---------- 通用板块 ----------
.block {
    margin-top: 88px;
}

.block-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 32px;
}

.block-heading {
    display: flex;
    flex-direction: column;
    gap: 10px;
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
        transform: translateX(2px);
    }
}

.block-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
}

// ---------- 文章：主稿 + 次条 ----------
.story-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
    gap: 22px;
    align-items: stretch;
}

.story-featured,
.story-feature-link,
.story-feature-media {
    width: 100%;
    height: 100%;
}

.story-feature-link {
    display: block;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
}

.story-feature-media {
    position: relative;
    display: block;
    min-height: 520px;
    border-radius: calc(var(--portal-radius-card) + 6px);
    isolation: isolate;
}

.story-feature-media img {
    transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

.story-feature-link:hover .story-feature-media img {
    transform: scale(1.035);
}

.story-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
    font-family: var(--portal-serif);
    font-size: clamp(80px, 11vw, 150px);
    font-weight: 600;
    color: color-mix(in srgb, var(--portal-accent-strong) 44%, transparent);
}

.story-feature-shade {
    position: absolute;
    inset: 0;
    z-index: 2;
    background:
        linear-gradient(to top, rgba(7, 10, 17, 0.9) 0%, rgba(7, 10, 17, 0.28) 56%, transparent 100%),
        linear-gradient(120deg, rgba(7, 10, 17, 0.28), transparent 62%);
}

.story-feature-copy {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: clamp(28px, 4vw, 48px);
    color: #fff;
}

.story-meta-line,
.story-compact-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.72);
    text-transform: uppercase;
}

.story-feature-copy strong {
    max-width: 19ch;
    font-family: var(--portal-serif);
    font-size: clamp(30px, 3.2vw, 48px);
    font-weight: 600;
    line-height: 1.24;
    color: #fff;
}

.story-feature-intro {
    max-width: 58ch;
    color: rgba(255, 255, 255, 0.78);
    font-size: 14px;
    line-height: 1.8;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.story-feature-stats {
    display: flex;
    gap: 18px;
    padding-top: 4px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;

    span {
        display: inline-flex;
        align-items: center;
        gap: 5px;
    }
}

.story-side {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.story-compact {
    flex: 1;
    animation: portal-reveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.story-compact-link {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 28px;
    align-items: start;
    gap: 16px;
    width: 100%;
    height: 100%;
    padding: 24px;
    border: 1px solid var(--portal-surface-border);
    border-radius: var(--portal-radius-card);
    background: var(--portal-surface);
    color: var(--portal-text-primary);
    text-align: left;
    cursor: pointer;
    backdrop-filter: blur(var(--portal-blur-glass));
    -webkit-backdrop-filter: blur(var(--portal-blur-glass));
    box-shadow: var(--portal-shadow-soft);
    transition: transform var(--portal-transition-medium), border-color var(--portal-transition-fast),
        box-shadow var(--portal-transition-medium);

    &:hover {
        transform: translateY(-3px);
        border-color: var(--portal-accent-soft);
        box-shadow: var(--portal-shadow-hover);
    }
}

.story-compact-number {
    padding-top: 2px;
    color: var(--portal-accent-strong);
    font-family: var(--portal-serif);
    font-size: 18px;
    font-weight: 600;
}

.story-compact-body {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 10px;
}

.story-compact-meta {
    color: var(--portal-text-tertiary);

    time {
        font-weight: 400;
        letter-spacing: 0;
    }
}

.story-compact-body strong {
    font-family: var(--portal-serif);
    font-size: clamp(20px, 1.6vw, 25px);
    font-weight: 600;
    line-height: 1.45;
}

.story-compact-intro {
    color: var(--portal-text-secondary);
    font-size: 13px;
    line-height: 1.75;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.story-compact-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--portal-surface-border);
    border-radius: 50%;
    color: var(--portal-text-secondary);
    transition: all var(--portal-transition-fast);
}

.story-compact-link:hover .story-compact-arrow {
    border-color: var(--portal-accent);
    background: var(--portal-accent);
    color: var(--portal-text-on-accent);
    transform: translateX(2px);
}

.story-all {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 17px 24px;
    border: 1px dashed var(--portal-surface-border);
    border-radius: var(--portal-radius-card);
    color: var(--portal-text-secondary);
    font-size: 13px;
    text-decoration: none;
    transition: all var(--portal-transition-fast);

    &:hover {
        border-color: var(--portal-accent);
        color: var(--portal-accent);
        background: var(--portal-accent-soft);
    }
}

// ---------- 随笔卡片 ----------
.diary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
}

.diary-card {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 260px;
    gap: 12px;
    padding: 28px;
    overflow: hidden;
    border: 1px solid var(--portal-surface-border);
    border-radius: var(--portal-radius-card);
    background: var(--portal-surface);
    text-align: left;
    cursor: pointer;
    box-shadow: var(--portal-shadow-soft);
    transition: transform var(--portal-transition-medium), box-shadow var(--portal-transition-medium),
        border-color var(--portal-transition-fast);

    &:hover {
        transform: translateY(-4px);
        border-color: var(--portal-accent-soft);
        box-shadow: var(--portal-shadow-hover);
    }

    &.tone-0 {
        background:
            linear-gradient(145deg, color-mix(in srgb, var(--pcolor) 10%, var(--portal-surface)), var(--portal-surface));
    }

    &.tone-1 {
        background:
            linear-gradient(145deg, color-mix(in srgb, var(--pcolor8) 12%, var(--portal-surface)), var(--portal-surface));
    }

    &.tone-2 {
        background:
            linear-gradient(145deg, color-mix(in srgb, var(--pcolor6) 10%, var(--portal-surface)), var(--portal-surface));
    }
}

.diary-mark {
    position: absolute;
    top: -18px;
    right: 14px;
    color: color-mix(in srgb, var(--portal-accent) 12%, transparent);
    font-family: var(--portal-serif);
    font-size: 112px;
    line-height: 1;
    pointer-events: none;
}

.diary-weather {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    position: relative;
    z-index: 1;
    font-size: 13px;
    color: var(--portal-text-secondary);

    img {
        width: 18px;
        height: 18px;
    }
}

.diary-title {
    position: relative;
    z-index: 1;
    font-family: var(--portal-serif);
    font-size: 21px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--portal-text-primary);
}

.diary-text {
    position: relative;
    z-index: 1;
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
    position: relative;
    z-index: 1;
    padding-top: 14px;
    border-top: 1px solid var(--portal-line-soft);
    font-size: 12px;
    color: var(--portal-text-secondary);
    font-variant-numeric: tabular-nums;
}

.closing-note {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
    gap: clamp(32px, 6vw, 90px);
    align-items: end;
    margin-top: 96px;
    padding: clamp(34px, 4.5vw, 64px);
    border: 1px solid var(--portal-surface-border);
    border-radius: calc(var(--portal-radius-card) + 10px);
    background:
        radial-gradient(circle at 8% 0%, var(--portal-accent-soft), transparent 38%),
        var(--portal-surface);
    backdrop-filter: blur(var(--portal-blur-glass));
    -webkit-backdrop-filter: blur(var(--portal-blur-glass));
    box-shadow: var(--portal-shadow-soft);

    h2 {
        margin: 14px 0 0;
        font-family: var(--portal-serif);
        font-size: clamp(30px, 3.5vw, 48px);
        font-weight: 600;
        line-height: 1.35;
        color: var(--portal-text-primary);
    }
}

.closing-side {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 24px;

    p {
        max-width: 34ch;
        margin: 0;
        color: var(--portal-text-secondary);
        font-size: 14px;
        line-height: 1.85;
    }
}

.closing-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 20px;
    border-radius: var(--portal-radius-pill);
    background: var(--portal-accent);
    color: var(--portal-text-on-accent);
    font-size: 14px;
    text-decoration: none;
    transition: all var(--portal-transition-fast);

    &:hover {
        transform: translateY(-2px);
        box-shadow: var(--portal-shadow-soft);
        filter: brightness(1.06);
    }
}


// ---------- 响应式 ----------
@media (max-width: 1279px) {
    .hero-content {
        grid-template-columns: minmax(0, 1.3fr) minmax(250px, 0.7fr);
        gap: 42px;
        padding-bottom: 8vh;
    }

    .journal-index {
        grid-template-columns: 1fr;
    }

    .index-intro {
        padding: 0 0 24px;
        border-right: none;
        border-bottom: 1px solid var(--portal-line-soft);
    }

    .story-layout {
        grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
    }

    .story-feature-media {
        min-height: 470px;
    }
}

@media (max-width: 900px) {
    .hero-content {
        display: flex;
        align-items: flex-end;
        padding: 80px var(--hero-inline-padding) calc(9vh + 26px);
    }

    .hero-aside {
        display: none;
    }

    .hero-title {
        font-size: clamp(42px, 8vw, 70px);
    }

    .hero-meta {
        grid-template-columns: auto 1fr;
        bottom: calc(4vh + 16px);
    }

    .hero-scroll {
        display: none;
    }

    .hero-dots {
        justify-self: end;
    }

    .journal-index {
        margin-top: -4vh;
    }

    .index-facts {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .fact-card {
        min-height: 116px;
        padding: 16px 20px;

        &:nth-child(3) {
            border-left: none;
        }

        &:nth-child(n + 3) {
            border-top: 1px solid var(--portal-line-soft);
        }
    }

    .block {
        margin-top: 64px;
    }

    .story-layout {
        grid-template-columns: 1fr;
    }

    .story-feature-media {
        min-height: 440px;
    }

    .story-side {
        display: grid;
        grid-template-columns: 1fr 1fr;
    }

    .story-all {
        grid-column: 1 / -1;
    }

    .diary-grid {
        grid-template-columns: 1fr 1fr;
    }

    .closing-note {
        grid-template-columns: 1fr;
        align-items: start;
    }
}

@media (max-width: 768px) {
    .hero-content {
        width: 100%;
        padding: 68px var(--hero-inline-padding) calc(8vh + 24px);
    }

    .hero-eyebrow {
        align-items: flex-start;
        flex-direction: column;
        gap: 10px;
        letter-spacing: 0.04em;
    }

    .hero-issue {
        min-height: 24px;
    }

    .hero-lead {
        font-size: 15px;
        line-height: 1.8;
    }

    .hero-links {
        gap: 8px;
        margin-top: 24px;
    }

    .hero-pill {
        padding: 10px 16px;
        font-size: 13px;
    }

    .hero-meta {
        width: 100%;
        bottom: calc(4vh + 12px);
    }

    .fact-card {
        min-height: 104px;
        padding: 13px 16px;
    }

    .fact-value {
        font-size: 34px;
    }

    .fact-index {
        margin-bottom: 14px;
    }

    .block-head {
        align-items: flex-start;
    }

    .block-more {
        padding-top: 18px;
        white-space: nowrap;
    }

    .story-feature-media {
        min-height: 390px;
    }

    .story-feature-copy {
        padding: 24px;
    }

    .story-side {
        grid-template-columns: 1fr;
    }

    .story-all {
        grid-column: auto;
    }

    .story-compact-link {
        padding: 20px;
    }

    .diary-grid {
        grid-template-columns: 1fr;
    }

    .diary-card {
        min-height: 220px;
    }

    .closing-note {
        margin-top: 64px;
        padding: 28px 24px;
    }
}

@media (max-width: 560px) {
    .hero-title {
        font-size: 40px;
    }

    .hero-pill:not(.hero-pill-primary) {
        display: none;
    }

    .journal-index {
        padding: 22px 18px;
    }

    .index-intro h2 {
        font-size: 25px;
    }

    .index-facts {
        grid-template-columns: 1fr 1fr;
    }

    .story-feature-media {
        min-height: 340px;
    }

    .story-feature-copy strong {
        font-size: 27px;
    }

    .story-feature-intro {
        -webkit-line-clamp: 1;
    }

    .story-meta-line {
        align-items: flex-start;
        flex-direction: column;
        gap: 6px;
    }

    .story-compact-link {
        grid-template-columns: 28px minmax(0, 1fr);
    }

    .story-compact-arrow {
        display: none;
    }

    .hero-counter {
        display: none;
    }

    .hero-meta {
        display: flex;
        justify-content: center;
    }
}
</style>
