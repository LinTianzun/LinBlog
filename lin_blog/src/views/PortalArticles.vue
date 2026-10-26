<template>
    <PortalLayout active-path="/portal/articles">
        <section class="page-head">
            <h1 class="page-title">文章</h1>
            <p class="page-lead">
                技术长文与生活记录，共 {{ archiveTotal }} 篇。可以按分类、标签筛选，或直接搜索关键词。
            </p>

            <div class="filter-bar">
                <div class="filter-search">
                    <!-- yk-input-search 内部自持 value 且不支持 v-model，无法回填 URL 关键词，
                         这里改用 yk-input + append 按钮，保证输入与筛选状态双向可控 -->
                    <yk-input v-model="keywordInput" placeholder="搜索标题或正文" :limit="100" clearable
                        @keydown.enter="applySearch" @clear="clearKeyword">
                        <template #append>
                            <yk-button type="primary" aria-label="搜索" @click="applySearch">
                                <IconSearchOutline />
                            </yk-button>
                        </template>
                    </yk-input>
                </div>
                <div class="filter-pills">
                    <button type="button" class="pill" :class="{ active: filters.subsetId === null }"
                        @click="selectSubset(null)">
                        全部
                    </button>
                    <button v-for="subset in subsetList" :key="subset.id" type="button" class="pill"
                        :class="{ active: filters.subsetId === subset.id }" @click="selectSubset(subset.id)">
                        {{ subset.name }}
                        <span>{{ subset.value }}</span>
                    </button>
                </div>
            </div>

            <div class="sort-bar">
                <button type="button" class="sort-btn" :class="{ active: filters.sort === 'latest' }"
                    @click="setSort('latest')">
                    最新
                </button>
                <button type="button" class="sort-btn" :class="{ active: filters.sort === 'hot' }"
                    @click="setSort('hot')">
                    最热
                </button>
            </div>

            <div v-if="labelList.length" class="filter-labels">
                <button v-for="label in labelList" :key="label.id" type="button" class="label-pill"
                    :class="{ active: filters.label === label.name }" @click="selectLabel(label.name)">
                    {{ label.name }}
                </button>
            </div>
        </section>

        <section class="list-area">
            <div class="list-head">
                <h2 class="list-heading">{{ activeHeading }}</h2>
                <button v-if="hasFilter" type="button" class="list-reset" @click="resetFilters">
                    清除筛选
                </button>
            </div>

            <div v-if="loading" class="list-state">
                <yk-spinner size="m" />
            </div>

            <div v-else-if="articles.length" class="post-list">
                <article v-for="(article, i) in articles" :key="article.id" class="post-row"
                    :style="{ '--stagger': `${Math.min(i, 8) * 40}ms` }">
                    <button type="button" class="post-link" @click="openArticle(article.id)">
                        <time class="post-date">{{ formatDate(article.publishedAt || article.createdAt) }}</time>
                        <h3 class="post-title">{{ article.title }}</h3>
                        <p class="post-introduce">{{ article.introduce || '点击阅读全文' }}</p>
                        <div class="post-meta">
                            <span v-if="article.subsetName" class="post-chip">{{ article.subsetName }}</span>
                            <span v-for="label in articleLabels(article)" :key="label" class="post-label">
                                {{ label }}
                            </span>
                            <span><IconEyeOutline />{{ article.views }}</span>
                            <span><IconLikeOutline />{{ article.likes }}</span>
                            <span><IconCommentOutline />{{ article.comments }}</span>
                        </div>
                    </button>
                </article>

                <div v-if="total > filters.pageSize" class="list-pagination">
                    <yk-pagination :current="filters.page" :total="total" :page-size="filters.pageSize"
                        @change="changePage" />
                </div>
            </div>

            <div v-else class="list-state">
                <yk-empty :description="hasFilter ? '没有符合条件的内容' : '这里还没有已发布的文章'" />
                <yk-button v-if="hasFilter" type="text" size="s" @click="resetFilters">
                    清除筛选条件
                </yk-button>
            </div>
        </section>

        <PortalArticleDetail :open="detailVisible" :article="activeArticle" @close="closeArticle"
            @interaction-change="handleInteractionChange" @view-counted="handleViewCounted" />
    </PortalLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PortalLayout from '../components/portal/PortalLayout.vue'
import PortalArticleDetail from '../components/portal/PortalArticleDetail.vue'
import {
    getPublicArticles,
    getPublicArticleById,
    getPublicSubsets,
    getPublicLabels,
    type PortalSort,
    type PortalSubset,
    type PortalLabel
} from '../api/portal'
import { parseArticleLabels, type ArticleItem } from '../api/article'

const route = useRoute()
const router = useRouter()

const articles = ref<ArticleItem[]>([])
const total = ref(0)
// 全站文章数：筛选时 total 会变成命中数，页头说明需要稳定的总量
const archiveTotal = ref(0)
const loading = ref(false)
const subsetList = ref<PortalSubset[]>([])
const labelList = ref<PortalLabel[]>([])

const detailVisible = ref(false)
const activeArticle = ref<ArticleItem | null>(null)

const filters = reactive({
    page: 1,
    pageSize: 10,
    keyword: '',
    subsetId: null as number | null,
    label: '',
    sort: 'latest' as PortalSort
})

// 输入框独立于已生效的筛选条件，回车/点按钮才提交
const keywordInput = ref('')

const hasFilter = computed(() =>
    Boolean(filters.keyword || filters.label || filters.subsetId !== null)
)

const activeHeading = computed(() => {
    if (filters.keyword) return `“${filters.keyword}” 的搜索结果`
    if (filters.label) return `标签 · ${filters.label}`
    const subset = subsetList.value.find(item => item.id === filters.subsetId)
    if (subset) return subset.name
    return '全部文章'
})

const articleLabels = (article: ArticleItem): string[] =>
    parseArticleLabels(article.label).slice(0, 3)

const formatDate = (value: string): string => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN')
}

const loadArticles = async () => {
    loading.value = true
    try {
        const result = await getPublicArticles({
            page: filters.page,
            pageSize: filters.pageSize,
            keyword: filters.keyword || undefined,
            subsetId: filters.subsetId || undefined,
            label: filters.label || undefined,
            sort: filters.sort
        })
        if (result.code === 200) {
            articles.value = result.data?.list || []
            total.value = result.data?.total || 0
        }
    } catch {
        articles.value = []
        total.value = 0
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

// 页头展示的全站文章数：单独取一次未筛选的总量，避免被搜索/标签筛选改写
const loadArchiveTotal = async () => {
    try {
        const result = await getPublicArticles({ page: 1, pageSize: 1 })
        if (result.code === 200) archiveTotal.value = result.data?.total || 0
    } catch {
        // 统计失败不影响列表本身
    }
}

// 筛选条件同步到地址栏，方便分享与刷新保持上下文
const syncQuery = () => {
    const query: Record<string, string> = {}
    if (filters.keyword) query.keyword = filters.keyword
    if (filters.label) query.label = filters.label
    if (filters.subsetId !== null) query.subset = String(filters.subsetId)
    if (filters.page > 1) query.page = String(filters.page)
    if (filters.sort !== 'latest') query.sort = filters.sort
    void router.replace({ path: '/portal/articles', query })
}

// 排序切换：最新按发布时间，最热按浏览量
const setSort = (sort: PortalSort) => {
    if (filters.sort === sort) return
    filters.sort = sort
    filters.page = 1
    syncQuery()
    void loadArticles()
}

const resetFilters = () => {
    filters.keyword = ''
    keywordInput.value = ''
    filters.label = ''
    filters.subsetId = null
    filters.page = 1
    syncQuery()
    void loadArticles()
}

const selectSubset = (id: number | null) => {
    filters.subsetId = id
    filters.page = 1
    syncQuery()
    void loadArticles()
}

const selectLabel = (name: string) => {
    filters.label = filters.label === name ? '' : name
    filters.page = 1
    syncQuery()
    void loadArticles()
}

const applySearch = () => {
    filters.keyword = keywordInput.value.trim()
    filters.page = 1
    syncQuery()
    void loadArticles()
}

const clearKeyword = () => {
    keywordInput.value = ''
    if (!filters.keyword) return
    filters.keyword = ''
    filters.page = 1
    syncQuery()
    void loadArticles()
}

const changePage = (page: number) => {
    filters.page = page
    syncQuery()
    void loadArticles()
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

const handleInteractionChange = (payload: { likes: number; comments: number }) => {
    if (!activeArticle.value) return
    activeArticle.value = {
        ...activeArticle.value,
        likes: payload.likes,
        comments: payload.comments
    }
    const target = articles.value.find(item => item.id === activeArticle.value?.id)
    if (target) {
        target.likes = payload.likes
        target.comments = payload.comments
    }
}

// 详情弹窗回读的真实浏览量写回列表，避免 +1 后列表与详情不一致
const handleViewCounted = (payload: { views: number }) => {
    if (!activeArticle.value) return
    activeArticle.value = { ...activeArticle.value, views: payload.views }
    const target = articles.value.find(item => item.id === activeArticle.value?.id)
    if (target) target.views = payload.views
}

onMounted(async () => {
    // 支持从首页带参数跳转：?subset=3 / ?label=xxx / ?keyword=xxx
    const query = route.query
    if (typeof query.subset === 'string') filters.subsetId = Number(query.subset) || null
    if (typeof query.label === 'string') filters.label = query.label
    if (typeof query.keyword === 'string') filters.keyword = query.keyword
    if (query.sort === 'hot') filters.sort = 'hot'
    keywordInput.value = filters.keyword
    if (typeof query.page === 'string') filters.page = Number(query.page) || 1

    await loadFilters()
    await Promise.all([loadArticles(), loadArchiveTotal()])

    // 支持直接打开某篇文章：?open=12
    if (typeof query.open === 'string') {
        const id = Number(query.open)
        if (id) void openArticle(id)
    }
})
</script>

<style lang="less" scoped>
.page-head {
    padding: 64px 0 0;
}

.page-title {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: clamp(34px, 4vw, 52px);
    font-weight: 600;
    line-height: 1.2;
    color: @font-color-l;
}

.page-lead {
    max-width: 46ch;
    margin: 16px 0 0;
    font-size: 16px;
    line-height: 1.85;
    color: @font-color-s;
}

.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px;
    margin-top: 32px;
    padding: 20px 0;
    border-top: 1px solid @line-color-s;
    border-bottom: 1px solid @line-color-s;
}

.filter-search {
    flex: 1 1 260px;
    min-width: 220px;
    max-width: 340px;
}

.filter-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.pill {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 7px 16px;
    border: 1px solid @line-color-s;
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
    color: @font-color-m;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;

    span {
        font-size: 11px;
        color: @font-color-s;
        font-variant-numeric: tabular-nums;
    }

    &:hover {
        border-color: @pcolor;
        color: @pcolor;
    }

    &.active {
        border-color: @pcolor;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;
    }
}

.filter-labels {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
}

.sort-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 16px;
}

.sort-btn {
    padding: 5px 14px;
    border: 1px solid @line-color-s;
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
    color: @font-color-m;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;

    &:hover {
        border-color: @pcolor;
        color: @pcolor;
    }

    &.active {
        border-color: @pcolor;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;
    }
}

.label-pill {
    padding: 5px 13px;
    border: none;
    border-radius: 999px;
    background: @bg-color-l;
    font-size: 13px;
    color: @font-color-m;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;

    &:hover {
        color: @pcolor;
    }

    &.active {
        background: @pcolor;
        color: #fff;
    }
}

.list-area {
    margin-top: 48px;
}

.list-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
}

.list-heading {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: 24px;
    font-weight: 600;
    color: @font-color-l;
}

.list-reset {
    border: none;
    background: transparent;
    font-size: 13px;
    color: @font-color-s;
    cursor: pointer;

    &:hover {
        color: @pcolor;
    }
}

.list-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 300px;
}

.post-list {
    display: flex;
    flex-direction: column;
}

.post-row {
    border-bottom: 1px solid @line-color-s;
    animation: post-in 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    animation-delay: var(--stagger, 0ms);

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
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
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

.post-label {
    padding: 2px 9px;
    border: 1px solid @line-color-s;
    border-radius: 999px;
    font-size: 12px;
}

.post-row:hover .post-title {
    color: @pcolor;
}

.list-pagination {
    display: flex;
    justify-content: flex-end;
    padding-top: 28px;
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

@media (max-width: 720px) {
    .page-head {
        padding-top: 40px;
    }

    .filter-search {
        max-width: none;
    }

    .post-link {
        grid-template-columns: 1fr;
        row-gap: 6px;
    }

    .post-date {
        grid-row: auto;
    }
}
</style>
