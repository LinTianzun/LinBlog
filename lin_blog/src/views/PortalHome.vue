<template>
    <div class="portal-home">
        <header class="portal-header">
            <div class="header-inner">
                <div class="brand" @click="resetFilters">
                    <img :src="unityLogo" alt="林知雨博客" />
                    <div class="brand-text">
                        <strong>林知雨</strong>
                        <span>记录代码与生活</span>
                    </div>
                </div>
                <nav class="header-actions">
                    <button type="button" class="admin-entry" @click="goAdmin">
                        进入后台
                        <IconRightOutline />
                    </button>
                </nav>
            </div>
        </header>

        <section class="hero">
            <div class="hero-glow hero-glow-a" aria-hidden="true" />
            <div class="hero-glow hero-glow-b" aria-hidden="true" />
            <div class="hero-grid" aria-hidden="true" />
            <div class="hero-inner">
                <div class="hero-copy">
                    <span class="hero-kicker">LIN ZHIYU · JOURNAL</span>
                    <h1>写字的人，<br />也在好好生活</h1>
                    <p>这里收录技术与日常的长思考，慢慢逛，常有新得。</p>
                    <div class="hero-actions">
                        <yk-button type="primary" size="m" @click="scrollToList">开始阅读</yk-button>
                        <yk-button type="secondary" size="m" @click="showAll">全部文章</yk-button>
                    </div>
                </div>
                <div class="hero-stats">
                    <div class="stat">
                        <strong>{{ total }}</strong>
                        <span>篇文章</span>
                    </div>
                    <div class="stat">
                        <strong>{{ subsetList.length }}</strong>
                        <span>个分类</span>
                    </div>
                    <div class="stat">
                        <strong>{{ labelList.length }}</strong>
                        <span>个标签</span>
                    </div>
                </div>
            </div>
        </section>

        <main class="portal-main" ref="listRef">
            <aside class="portal-aside">
                <div class="panel">
                    <div class="panel-title">
                        <IconSearchOutline />搜索
                    </div>
                    <div class="panel-search">
                        <yk-input-search v-model="filters.keyword" placeholder="标题或正文关键字" @search="loadArticles" />
                    </div>
                </div>
                <div class="panel">
                    <div class="panel-title">
                        <IconFolderOpenOutline />分类
                    </div>
                    <div class="filter-list">
                        <button type="button" class="filter-item" :class="{ active: !filters.subsetId }"
                            @click="selectSubset(null)">
                            全部
                            <span>{{ total }}</span>
                        </button>
                        <button v-for="subset in subsetList" :key="subset.id" type="button" class="filter-item"
                            :class="{ active: filters.subsetId === subset.id }" @click="selectSubset(subset.id)">
                            {{ subset.name }}
                            <span>{{ subset.value }}</span>
                        </button>
                    </div>
                </div>
                <div class="panel">
                    <div class="panel-title">
                        <IconTagOutline />标签
                    </div>
                    <div class="label-cloud">
                        <button v-for="label in labelList" :key="label.id" type="button"
                            :class="{ active: filters.label === label.name }" @click="selectLabel(label.name)">
                            {{ label.name }}
                        </button>
                    </div>
                </div>
            </aside>

            <section class="portal-list">
                <div v-if="loading" class="state-tip"><yk-spinner size="m" /></div>
                <template v-else-if="articles.length">
                    <div class="list-head">
                        <h2>{{ activeHeading }}</h2>
                        <span>{{ total }} 篇</span>
                    </div>
                    <PortalArticleCard v-for="(article, i) in articles" :key="article.id" :article="article"
                        :index="i" @select="openArticle" />
                    <div class="pagination-row">
                        <yk-pagination :current="filters.page" :total="total" :page-size="filters.pageSize"
                            @change="changePage" />
                    </div>
                </template>
                <div v-else class="state-tip empty">
                    <yk-empty description="这里还没有已发布的文章" />
                    <yk-button type="text" size="s" @click="resetFilters">清除筛选条件</yk-button>
                </div>
            </section>
        </main>

        <footer class="portal-footer">
            <span class="footer-brand">林知雨</span>
            <span>© {{ new Date().getFullYear() }} · 用心记录代码与生活</span>
            <span class="footer-tech">Vue 3 + Yike Design</span>
        </footer>

        <PortalArticleDetail :open="detailVisible" :article="activeArticle" @close="closeArticle" />
    </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import unityLogo from '../assets/svg/unity.svg'
import PortalArticleCard from '../components/portal/PortalArticleCard.vue'
import PortalArticleDetail from '../components/portal/PortalArticleDetail.vue'
import {
    getPublicArticles,
    getPublicArticleById,
    getPublicSubsets,
    getPublicLabels,
    type PortalSubset,
    type PortalLabel
} from '../api/portal'
import type { ArticleItem } from '../api/article'

const router = useRouter()
const loading = ref(false)
const articles = ref<ArticleItem[]>([])
const total = ref(0)
const subsetList = ref<PortalSubset[]>([])
const labelList = ref<PortalLabel[]>([])
const detailVisible = ref(false)
const activeArticle = ref<ArticleItem | null>(null)
const listRef = ref<HTMLElement | null>(null)
// 门户挂载期间临时抵消全局顶栏预留高度
let appEl: HTMLElement | null = null

const filters = reactive({
    page: 1,
    pageSize: 10,
    keyword: '',
    subsetId: null as number | null,
    label: '' as string
})

const goAdmin = () => router.push('/overView')

const scrollToList = () => {
    listRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 清除全部筛选条件并回到列表顶部
const showAll = () => {
    resetFilters()
    scrollToList()
}

// 列表区标题跟随当前筛选条件变化，让页面有明确的"我在看什么"反馈
const activeHeading = computed(() => {
    if (filters.keyword) return `“${filters.keyword}” 的搜索结果`
    if (filters.label) return `标签 · ${filters.label}`
    const subset = subsetList.value.find(item => item.id === filters.subsetId)
    if (subset) return subset.name
    return '最新发布'
})

const loadArticles = async () => {
    loading.value = true
    try {
        const result = await getPublicArticles({
            page: filters.page,
            pageSize: filters.pageSize,
            keyword: filters.keyword || undefined,
            subsetId: filters.subsetId || undefined,
            label: filters.label || undefined
        })
        if (result.code === 200) {
            articles.value = result.data?.list || []
            total.value = result.data?.total || 0
        }
    } finally {
        loading.value = false
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

const resetFilters = () => {
    filters.keyword = ''
    filters.subsetId = null
    filters.label = ''
    filters.page = 1
    void loadArticles()
}

const selectSubset = (id: number | null) => {
    filters.subsetId = id
    filters.page = 1
    void loadArticles()
}

const selectLabel = (name: string) => {
    filters.label = filters.label === name ? '' : name
    filters.page = 1
    void loadArticles()
}

const changePage = (page: number) => {
    filters.page = page
    void loadArticles()
}

const openArticle = async (id: number) => {
    detailVisible.value = true
    try {
        const result = await getPublicArticleById(id)
        if (result.code === 200) activeArticle.value = result.data || null
    } catch {
        detailVisible.value = false
    }
}

const closeArticle = () => {
    detailVisible.value = false
    activeArticle.value = null
}

onMounted(() => {
    void loadArticles()
    void loadFilters()
    // 全局 #app 为后台固定顶栏预留了 64px，门户自带顶栏需抵消，否则顶部出现死区
    appEl = document.getElementById('app')
    appEl?.classList.add('is-portal')
})

onUnmounted(() => {
    appEl?.classList.remove('is-portal')
    appEl = null
})
</script>

<style lang="less" scoped>
// 门户页字体：标题用衬线体拉开气质，正文沿用系统栈
@portal-serif: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', Georgia, 'Times New Roman', serif;
@portal-sans: 'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

.portal-home {
    min-height: 100vh;
    font-family: @portal-sans;
    background:
        radial-gradient(820px 380px at 88% -120px, var(--pcolor1), transparent 62%),
        radial-gradient(620px 320px at 4% 8%, var(--pcolor1), transparent 58%),
        @bg-color-s;
}

// ---------- 顶栏 ----------
.portal-header {
    position: sticky;
    top: 0;
    z-index: 20;
    backdrop-filter: blur(16px) saturate(160%);
    background: var(--portal-header-bg);
    border-bottom: 1px solid @line-color-s;

    .header-inner {
        max-width: 1180px;
        margin: 0 auto;
        padding: 12px 28px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;

        img {
            width: 40px;
            height: 25px;
            filter: var(--portal-logo-filter);
            transition: filter 0.3s ease;
        }

        .brand-text {
            display: flex;
            flex-direction: column;
            line-height: 1.2;

            strong {
                font-family: @portal-serif;
                font-size: 18px;
                letter-spacing: 1px;
                color: @font-color-l;
            }

            span {
                font-size: @size-ss;
                color: @font-color-s;
            }
        }
    }

    .admin-entry {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 14px;
        border: 1px solid @line-color-m;
        border-radius: @radius-r;
        background: transparent;
        color: @font-color-m;
        font-size: @size-s;
        cursor: pointer;
        transition: border-color 0.2s ease, color 0.2s ease, gap 0.2s ease;

        &:hover {
            gap: 8px;
            border-color: @pcolor;
            color: @pcolor;
        }
    }
}

// ---------- Hero ----------
.hero {
    position: relative;
    overflow: hidden;
    color: #fff;
    // 主色由主题变量驱动，切换预设时 hero 自动跟随
    background:
        radial-gradient(120% 150% at 88% 8%, var(--pcolor6) 0%, transparent 55%),
        linear-gradient(128deg, var(--pcolor10) 0%, var(--pcolor) 52%, var(--pcolor8) 100%);

    .hero-glow,
    .hero-grid {
        position: absolute;
        pointer-events: none;
    }

    .hero-glow-a {
        width: 420px;
        height: 420px;
        top: -190px;
        right: 6%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.26), transparent 66%);
        filter: blur(6px);
        animation: hero-float 11s ease-in-out infinite;
    }

    .hero-glow-b {
        width: 300px;
        height: 300px;
        bottom: -160px;
        left: 12%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.16), transparent 68%);
        animation: hero-float 14s ease-in-out infinite reverse;
    }

    // 细网格纹理，避免大面积纯色显得空洞
    .hero-grid {
        inset: 0;
        background-image:
            linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
        background-size: 46px 46px;
        mask-image: radial-gradient(120% 90% at 70% 0%, #000 20%, transparent 72%);
    }

    .hero-inner {
        position: relative;
        z-index: 1;
        max-width: 1180px;
        margin: 0 auto;
        padding: 78px 28px 96px;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 40px;
    }

    .hero-kicker {
        display: inline-block;
        margin-bottom: 16px;
        padding: 4px 12px;
        border: 1px solid rgba(255, 255, 255, 0.32);
        border-radius: @radius-r;
        font-size: 11px;
        letter-spacing: 2.4px;
        opacity: 0.9;
        animation: hero-rise 0.7s ease both;
    }

    h1 {
        margin: 0 0 14px;
        font-family: @portal-serif;
        font-size: clamp(32px, 4.4vw, 50px);
        font-weight: 700;
        line-height: 1.28;
        letter-spacing: 2px;
        text-shadow: 0 2px 18px rgba(12, 20, 40, 0.18);
        animation: hero-rise 0.7s 0.08s ease both;
    }

    .hero-copy p {
        margin: 0 0 28px;
        max-width: 480px;
        font-size: 15px;
        line-height: 1.85;
        opacity: 0.84;
        animation: hero-rise 0.7s 0.16s ease both;
    }

    .hero-actions {
        display: flex;
        gap: 12px;
        animation: hero-rise 0.7s 0.24s ease both;

        :deep(.yk-button--primary) {
            border-color: rgba(255, 255, 255, 0.5);
            background: #fff;
            color: var(--pcolor);
            font-weight: 600;
        }

        :deep(.yk-button--secondary) {
            border-color: rgba(255, 255, 255, 0.42);
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
        }
    }

    .hero-stats {
        display: flex;
        gap: 14px;
        animation: hero-rise 0.7s 0.3s ease both;

        .stat {
            min-width: 104px;
            padding: 16px 20px;
            border: 1px solid rgba(255, 255, 255, 0.22);
            border-radius: @radius-l;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(8px);
            text-align: center;
        }

        strong {
            display: block;
            font-family: @portal-serif;
            font-size: 30px;
            line-height: 1.1;
            font-variant-numeric: tabular-nums;
        }

        span {
            display: block;
            margin-top: 4px;
            font-size: @size-ss;
            opacity: 0.8;
        }
    }
}

// ---------- 主体 ----------
.portal-main {
    position: relative;
    z-index: 2;
    max-width: 1180px;
    margin: -56px auto 0;
    padding: 0 28px 56px;
    display: grid;
    grid-template-columns: 258px minmax(0, 1fr);
    gap: 22px;
    align-items: start;
}

.portal-aside {
    position: sticky;
    top: 82px;
    display: flex;
    flex-direction: column;
    gap: 14px;

    .panel {
        padding: 16px;
        border: 1px solid @line-color-s;
        border-radius: @radius-xl;
        background: @bg-color-l;
        box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
    }

    .panel-title {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 12px;
        font-size: @size-s;
        font-weight: 600;
        letter-spacing: 0.6px;
        color: @font-color-m;

        :deep(svg) {
            color: @pcolor;
        }
    }

    // yk-input-search 根节点是 inline-flex，且 __inner 使用 width:inherit，
    // 与 append 按钮并排时会溢出面板；这里用自有包裹元素强制撑满并让输入区可收缩
    .panel-search {
        width: 100%;

        :deep(.yk-input) {
            display: flex;
            width: 100%;
        }

        :deep(.yk-input__inner) {
            flex: 1 1 auto;
            width: auto;
            min-width: 0;
        }

        :deep(.yk-input__append) {
            flex: 0 0 auto;
        }
    }

    .filter-list {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .filter-item {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px 8px 14px;
        border: none;
        border-radius: @radius-m;
        background: transparent;
        color: @font-color-m;
        font-size: @size-s;
        text-align: left;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;

        // 选中态左侧小圆点
        &::after {
            content: '';
            position: absolute;
            left: 4px;
            top: 50%;
            width: 3px;
            height: 3px;
            border-radius: 50%;
            background: @pcolor;
            opacity: 0;
            transform: translateY(-50%);
            transition: opacity 0.2s ease;
        }

        span {
            min-width: 20px;
            padding: 0 6px;
            border-radius: @radius-r;
            background: @bg-color-m;
            font-size: @size-ss;
            font-variant-numeric: tabular-nums;
            text-align: center;
            color: @font-color-s;
        }

        &:hover {
            background: @bg-color-m;
        }

        &.active {
            background: var(--pcolor1);
            color: @pcolor;
            font-weight: 600;

            &::after {
                opacity: 1;
            }

            span {
                background: var(--pcolor2);
                color: @pcolor;
            }
        }
    }

    .label-cloud {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;

        button {
            padding: 4px 11px;
            border: 1px solid @line-color-m;
            border-radius: @radius-r;
            background: transparent;
            color: @font-color-s;
            font-size: @size-ss;
            cursor: pointer;
            transition: all 0.2s ease;

            &:hover {
                border-color: var(--pcolor4);
                color: @pcolor;
            }

            &.active {
                border-color: @pcolor;
                background: @pcolor;
                color: #fff;
            }
        }
    }
}

.portal-list {
    min-height: 360px;
    display: flex;
    flex-direction: column;
    gap: 16px;

    .list-head {
        // 与侧栏面板同款卡片外观：列表区顶部压在 hero 上时仍有一致底色，避免文字直接落在渐变上
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        padding: 15px 20px;
        border: 1px solid @line-color-s;
        border-radius: @radius-xl;
        background: @bg-color-l;
        box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);

        h2 {
            margin: 0;
            font-family: @portal-serif;
            font-size: 19px;
            font-weight: 700;
            letter-spacing: 0.8px;
            color: @font-color-l;
        }

        span {
            font-size: @size-s;
            font-variant-numeric: tabular-nums;
            color: @font-color-s;
        }
    }

    .state-tip {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 340px;
        border: 1px solid @line-color-s;
        border-radius: @radius-xl;
        background: @bg-color-l;
        box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
    }

    .pagination-row {
        display: flex;
        justify-content: center;
        padding: 12px 0 0;
    }
}

.portal-footer {
    max-width: 1180px;
    margin: 0 auto;
    padding: 22px 28px 34px;
    border-top: 1px solid @line-color-s;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: @font-color-s;
    font-size: @size-ss;

    .footer-brand {
        font-family: @portal-serif;
        font-size: 15px;
        letter-spacing: 1.5px;
        color: @font-color-m;
    }

    .footer-tech {
        opacity: 0.75;
    }
}

@keyframes hero-rise {
    from {
        opacity: 0;
        transform: translateY(16px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes hero-float {

    0%,
    100% {
        transform: translate3d(0, 0, 0);
    }

    50% {
        transform: translate3d(0, -22px, 0);
    }
}

@media (prefers-reduced-motion: reduce) {

    .hero *,
    .hero-glow {
        animation: none !important;
    }
}

@media (max-width: 1000px) {
    .hero .hero-inner {
        flex-direction: column;
        align-items: flex-start;
        padding-bottom: 84px;
    }

    .hero-stats {
        width: 100%;
    }
}

@media (max-width: 900px) {
    .portal-main {
        grid-template-columns: 1fr;
        margin-top: -40px;
    }

    .portal-aside {
        position: static;
    }
}

@media (max-width: 560px) {
    .hero .hero-inner {
        padding: 54px 20px 70px;
    }

    .hero-stats {
        gap: 10px;

        .stat {
            flex: 1;
            min-width: 0;
            padding: 12px 8px;
        }

        strong {
            font-size: 24px;
        }
    }

    .portal-main {
        padding: 0 16px 40px;
    }

    .portal-footer {
        flex-direction: column;
        text-align: center;
        gap: 6px;
    }
}
</style>

<!-- 非 scoped：根节点 data-theme 无法命中 scoped 选择器；此处仅做明暗底色变量注入 -->
<style lang="less">
#app.is-portal {
    padding-top: 0;
}

.portal-home {
    --portal-header-bg: rgba(255, 255, 255, 0.74);
    --portal-logo-filter: none;
}

[data-theme='dark'] .portal-home {
    --portal-header-bg: rgba(18, 22, 30, 0.72);
    // 深色下把黑色 logo 反白，避免与深色顶栏融为一体
    --portal-logo-filter: brightness(0) invert(1);
}

[data-theme='dark'] .portal-home {
    --portal-header-bg: rgba(18, 22, 30, 0.72);
}
</style>
