<template>
    <PortalLayout>
        <!-- 首屏：左文右图，标题跨过照片上缘 -->
        <section class="hero">
            <div class="hero-inner">
                <div class="hero-copy">
                    <p class="hero-eyebrow">林知雨的记录</p>
                    <h1 class="hero-title">
                        写字的人，<br />
                        也在好好生活
                    </h1>
                    <p class="hero-lead">
                        技术长文、摄影图库、带天气的随笔——同一个人的三种记录方式，都收在这里。
                    </p>
                    <div class="hero-links">
                        <RouterLink class="hero-link" to="/portal/articles">读文章</RouterLink>
                        <RouterLink class="hero-link" to="/portal/gallery">看照片</RouterLink>
                        <RouterLink class="hero-link" to="/portal/diary">翻随笔</RouterLink>
                    </div>
                </div>
                <div class="hero-figure" aria-hidden="true">
                    <div class="hero-print is-tall" />
                    <div class="hero-print is-small" />
                </div>
            </div>
            <dl class="hero-facts">
                <div>
                    <dt>{{ stats.articles }}</dt>
                    <dd>篇文章</dd>
                </div>
                <div>
                    <dt>{{ stats.galleries }}</dt>
                    <dd>组图库</dd>
                </div>
                <div>
                    <dt>{{ stats.diaries }}</dt>
                    <dd>篇随笔</dd>
                </div>
                <div>
                    <dt>{{ stats.categories }}</dt>
                    <dd>个分类</dd>
                </div>
            </dl>
        </section>

        <!-- 分类索引：一眼看完全部分类分布 -->
        <section class="block">
            <h2 class="block-title">分类索引</h2>
            <nav class="index-list" aria-label="文章分类">
                <RouterLink v-for="subset in subsetList" :key="subset.id" class="index-item"
                    :to="`/portal/articles?subset=${subset.id}`">
                    <span class="index-name">{{ subset.name }}</span>
                    <span class="index-count">{{ subset.value }}</span>
                </RouterLink>
                <p v-if="!subsetList.length" class="index-empty">还没有分类</p>
            </nav>
        </section>

        <!-- 最新文章 -->
        <section class="block">
            <div class="block-head">
                <h2 class="block-title">最新发布</h2>
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
                        <time class="post-date">{{ formatDate(article.publishedAt || article.createdAt) }}</time>
                        <h3 class="post-title">{{ article.title }}</h3>
                        <p class="post-introduce">{{ article.introduce || '点击阅读全文' }}</p>
                        <div class="post-meta">
                            <span v-if="article.subsetName" class="post-chip">{{ article.subsetName }}</span>
                            <span><IconEyeOutline />{{ article.views }}</span>
                            <span><IconLikeOutline />{{ article.likes }}</span>
                        </div>
                    </button>
                </article>
            </div>
            <div v-else class="block-state">
                <yk-empty description="这里还没有已发布的文章" />
            </div>
        </section>

        <!-- 摄影图库预览 -->
        <section class="block">
            <div class="block-head">
                <h2 class="block-title">摄影图库</h2>
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
        <section class="block">
            <div class="block-head">
                <h2 class="block-title">随笔随记</h2>
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

        <!-- 标签云 -->
        <section class="block">
            <h2 class="block-title">标签</h2>
            <div class="tag-cloud">
                <RouterLink v-for="label in labelList" :key="label.id" class="tag-item"
                    :to="`/portal/articles?label=${encodeURIComponent(label.name)}`">
                    {{ label.name }}
                    <span>{{ label.value }}</span>
                </RouterLink>
                <p v-if="!labelList.length" class="index-empty">还没有标签</p>
            </div>
        </section>

        <PortalArticleDetail :open="articleVisible" :article="activeArticle" @close="closeArticle"
            @interaction-change="handleInteractionChange" @view-counted="handleViewCounted" />
        <PortalDiaryDetail :open="diaryVisible" :item="activeDiary" @close="closeDiary"
            @view-counted="handleDiaryViewCounted" />
    </PortalLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import PortalLayout from '../components/portal/PortalLayout.vue'
import PortalPhotoWall, { type WallPrint } from '../components/portal/PortalPhotoWall.vue'
import PortalArticleDetail from '../components/portal/PortalArticleDetail.vue'
import PortalDiaryDetail from '../components/portal/PortalDiaryDetail.vue'
import {
    getPublicArticles,
    getPublicArticleById,
    getPublicSubsets,
    getPublicLabels,
    getPublicDiaries,
    type PortalDiary,
    type PortalSubset,
    type PortalLabel
} from '../api/portal'
import { parseGalleryContent, type ArticleItem } from '../api/article'
import { weathers } from '../utils/weather'

const articleList = ref<ArticleItem[]>([])
const articleLoading = ref(false)
const galleryList = ref<ArticleItem[]>([])
const galleryLoading = ref(false)
const diaryList = ref<PortalDiary[]>([])
const diaryLoading = ref(false)
const subsetList = ref<PortalSubset[]>([])
const labelList = ref<PortalLabel[]>([])

const articleVisible = ref(false)
const activeArticle = ref<ArticleItem | null>(null)
const diaryVisible = ref(false)
const activeDiary = ref<PortalDiary | null>(null)

const totalArticles = ref(0)
const totalDiaries = ref(0)

const stats = computed(() => ({
    articles: totalArticles.value,
    galleries: galleryList.value.length,
    diaries: totalDiaries.value,
    categories: subsetList.value.length
}))

// 图库橱窗的排版：大图、小图、竖图交错落位
const galleryPrints = computed<WallPrint[]>(() => galleryList.value.map((item, index) => {
    const images = parseGalleryContent(item.content)
    const cover = item.cover || images[0] || ''
    const pattern = [
        { span: 'wide' as const, offset: 0 as const },
        { span: 'portrait' as const, offset: 1 as const },
        { span: 'small' as const, offset: 2 as const },
        { span: 'portrait' as const, offset: 0 as const },
        { span: 'wide' as const, offset: 1 as const },
        { span: 'small' as const, offset: 0 as const }
    ]
    const slot = pattern[index % pattern.length]
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
        span: slot.span,
        offset: slot.offset
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

const loadArticles = async () => {
    articleLoading.value = true
    try {
        const result = await getPublicArticles({ page: 1, pageSize: 6 })
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
        const result = await getPublicArticles({ page: 1, pageSize: 6, classify: 'image' })
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
        const result = await getPublicDiaries({ page: 1, pageSize: 6 })
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

const loadFilters = async () => {
    const [subsetResult, labelResult] = await Promise.allSettled([
        getPublicSubsets(),
        getPublicLabels()
    ])
    if (subsetResult.status === 'fulfilled' && subsetResult.value.code === 200) {
        subsetList.value = (subsetResult.value.data?.list || []).filter(item => item.value > 0)
    }
    if (labelResult.status === 'fulfilled' && labelResult.value.code === 200) {
        labelList.value = (labelResult.value.data?.list || []).filter(item => item.value > 0)
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
    articleVisible.value = true
    try {
        const result = await getPublicArticleById(id)
        if (result.code === 200) activeArticle.value = result.data || null
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
    void loadFilters()
})
</script>

<style lang="less" scoped>
// ---------- 首屏 ----------
.hero {
    padding: 72px 0 0;
}

.hero-inner {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    column-gap: 24px;
    align-items: end;
}

.hero-copy {
    grid-column: 1 / span 6;
    padding-bottom: 8px;
}

.hero-eyebrow {
    margin: 0 0 18px;
    font-size: 12px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: @pcolor;
}

.hero-title {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: clamp(38px, 4.6vw, 64px);
    font-weight: 600;
    line-height: 1.16;
    letter-spacing: 0.01em;
    color: @font-color-l;
}

.hero-lead {
    max-width: 40ch;
    margin: 22px 0 0;
    font-size: 16px;
    line-height: 1.85;
    color: @font-color-s;
}

.hero-links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 30px;
}

.hero-link {
    padding: 9px 20px;
    border: 1px solid @line-color-s;
    border-radius: 999px;
    font-size: 14px;
    color: @font-color-l;
    text-decoration: none;
    transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;

    &:hover {
        border-color: @pcolor;
        color: @pcolor;
        background: var(--pcolor1);
    }
}

.hero-figure {
    grid-column: 8 / span 5;
    position: relative;
    min-height: 340px;
}

// 首屏的两块"照片"用主题色排印占位，不引入无意义的灰块
.hero-print {
    position: absolute;
    border-radius: 2px;

    &.is-tall {
        top: 0;
        right: 0;
        width: 62%;
        aspect-ratio: 4 / 5;
        background: @pcolor;
    }

    &.is-small {
        bottom: 6%;
        left: 0;
        width: 34%;
        aspect-ratio: 1 / 1;
        background: @pcolor-8;
    }
}

.hero-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 44px;
    margin: 56px 0 0;
    padding: 26px 0 0;
    border-top: 1px solid @line-color-s;

    div {
        display: flex;
        align-items: baseline;
        gap: 8px;
    }

    dt {
        font-family: var(--portal-serif);
        font-size: 30px;
        font-weight: 600;
        line-height: 1;
        color: @font-color-l;
        font-variant-numeric: tabular-nums;
    }

    dd {
        margin: 0;
        font-size: 14px;
        color: @font-color-s;
    }
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

.block-title {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: clamp(26px, 2.6vw, 34px);
    font-weight: 600;
    line-height: 1.3;
    color: @font-color-l;
}

.block-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    color: @font-color-s;
    text-decoration: none;
    transition: color 0.2s ease;

    &:hover {
        color: @pcolor;
    }
}

.block-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
}

// ---------- 分类索引 ----------
.index-list {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

.index-item {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    padding: 12px 20px;
    border: 1px solid @line-color-s;
    border-radius: 2px;
    text-decoration: none;
    transition: border-color 0.2s ease, background-color 0.2s ease;

    &:hover {
        border-color: @pcolor;
        background: var(--pcolor1);
    }

    .index-name {
        font-family: var(--portal-serif);
        font-size: 17px;
        font-weight: 600;
        color: @font-color-l;
    }

    .index-count {
        font-size: 13px;
        color: @font-color-s;
        font-variant-numeric: tabular-nums;
    }
}

.index-empty {
    margin: 0;
    font-size: 14px;
    color: @font-color-s;
}

// ---------- 文章列表 ----------
.post-list {
    display: flex;
    flex-direction: column;
}

.post-row {
    border-bottom: 1px solid @line-color-s;
    animation: post-in 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;

    &:last-child {
        border-bottom: none;
    }
}

.post-link {
    display: grid;
    grid-template-columns: 110px 1fr;
    column-gap: 28px;
    width: 100%;
    padding: 24px 0;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    text-decoration: none;
    transition: background-color 0.2s ease;
}

.post-date {
    grid-row: 1 / span 3;
    font-size: 13px;
    color: @font-color-s;
    font-variant-numeric: tabular-nums;
    padding-top: 4px;
}

.post-title {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: 20px;
    font-weight: 600;
    line-height: 1.5;
    color: @font-color-l;
    transition: color 0.2s ease;
}

.post-introduce {
    margin: 6px 0 0;
    font-size: 14px;
    line-height: 1.75;
    color: @font-color-s;
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
    color: @font-color-s;

    span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
}

.post-chip {
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--pcolor1);
    color: @pcolor;
    font-weight: 500;
}

.post-row:hover {
    .post-title {
        color: @pcolor;
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
    border: 1px solid @line-color-s;
    border-radius: 2px;
    background: @bg-color-l;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.2s ease, transform 0.25s ease;

    &:hover {
        border-color: @pcolor;
        transform: translateY(-3px);
    }
}

.diary-weather {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: @font-color-s;

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
    color: @font-color-l;
}

.diary-text {
    flex: 1;
    font-size: 14px;
    line-height: 1.8;
    color: @font-color-s;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.diary-date {
    font-size: 12px;
    color: @font-color-s;
    font-variant-numeric: tabular-nums;
}

// ---------- 标签云 ----------
.tag-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.tag-item {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    background: @bg-color-l;
    border: 1px solid @line-color-s;
    font-size: 13px;
    color: @font-color-m;
    text-decoration: none;
    transition: border-color 0.2s ease, color 0.2s ease;

    span {
        font-size: 11px;
        color: @font-color-s;
        font-variant-numeric: tabular-nums;
    }

    &:hover {
        border-color: @pcolor;
        color: @pcolor;
    }
}

@keyframes post-in {
    from {
        opacity: 0;
        transform: translateY(12px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (max-width: 900px) {
    .hero {
        padding-top: 44px;
    }

    .hero-copy {
        grid-column: 1 / span 12;
    }

    .hero-figure {
        grid-column: 1 / span 12;
        min-height: 260px;
        margin-top: 32px;
    }

    .hero-facts {
        gap: 28px;
        margin-top: 40px;
    }

    .block {
        margin-top: 64px;
    }

    .post-link {
        grid-template-columns: 1fr;
        row-gap: 6px;
    }

    .post-date {
        grid-row: auto;
    }
}

@media (max-width: 560px) {
    .hero-title {
        font-size: 34px;
    }

    .hero-facts {
        gap: 20px 28px;

        dt {
            font-size: 24px;
        }
    }

    .diary-grid {
        grid-template-columns: 1fr;
    }
}
</style>
