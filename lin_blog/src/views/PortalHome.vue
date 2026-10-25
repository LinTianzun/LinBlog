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
                    <yk-button type="secondary" size="s" @click="goAdmin">进入后台</yk-button>
                </nav>
            </div>
        </header>

        <section class="hero">
            <div class="hero-inner">
                <h1>写字的人，也在好好生活</h1>
                <p>这里收录技术与日常的 long-form 思考，欢迎慢慢逛。</p>
                <div class="hero-stats">
                    <div>
                        <strong>{{ total }}</strong>
                        <span>篇文章</span>
                    </div>
                    <div>
                        <strong>{{ subsetList.length }}</strong>
                        <span>个分类</span>
                    </div>
                    <div>
                        <strong>{{ labelList.length }}</strong>
                        <span>个标签</span>
                    </div>
                </div>
            </div>
        </section>

        <main class="portal-main">
            <aside class="portal-aside">
                <div class="panel">
                    <div class="panel-title">搜索</div>
                    <yk-input-search v-model="filters.keyword" placeholder="搜索文章标题或内容" @search="loadArticles" />
                </div>
                <div class="panel">
                    <div class="panel-title">分类</div>
                    <div class="filter-list">
                        <button type="button" class="filter-item" :class="{ active: !filters.subsetId }"
                            @click="selectSubset(null)">
                            全部
                        </button>
                        <button v-for="subset in subsetList" :key="subset.id" type="button" class="filter-item"
                            :class="{ active: filters.subsetId === subset.id }" @click="selectSubset(subset.id)">
                            {{ subset.name }}
                            <span>{{ subset.value }}</span>
                        </button>
                    </div>
                </div>
                <div class="panel">
                    <div class="panel-title">标签</div>
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
                    <PortalArticleCard v-for="article in articles" :key="article.id" :article="article"
                        @select="openArticle" />
                    <div class="pagination-row">
                        <yk-pagination :current="filters.page" :total="total" :page-size="filters.pageSize"
                            @change="changePage" />
                    </div>
                </template>
                <div v-else class="state-tip empty">
                    <yk-empty description="这里还没有已发布的文章" />
                </div>
            </section>
        </main>

        <footer class="portal-footer">
            © {{ new Date().getFullYear() }} 林知雨博客 · Vue 3 + Yike Design
        </footer>

        <PortalArticleDetail :open="detailVisible" :article="activeArticle" @close="closeArticle" />
    </div>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue'
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

const filters = reactive({
    page: 1,
    pageSize: 10,
    keyword: '',
    subsetId: null as number | null,
    label: '' as string
})

const goAdmin = () => router.push('/overView')

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
})
</script>

<style lang="less" scoped>
.portal-home {
    min-height: 100vh;
    background:
        radial-gradient(900px 420px at 85% -80px, rgba(43, 90, 237, 0.16), transparent 65%),
        radial-gradient(700px 360px at 8% 12%, rgba(25, 184, 155, 0.12), transparent 60%),
        @bg-color-s;
}

.portal-header {
    position: sticky;
    top: 0;
    z-index: 20;
    backdrop-filter: blur(14px);
    background: rgba(255, 255, 255, 0.72);
    border-bottom: 1px solid @line-color-s;
    .header-inner {
        max-width: 1160px;
        margin: 0 auto;
        padding: 14px 28px;
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
            width: 42px;
            height: 26px;
        }

        .brand-text {
            display: flex;
            flex-direction: column;
            line-height: 1.25;

            strong {
                font-size: 17px;
                color: @font-color-l;
            }

            span {
                font-size: @size-ss;
                color: @font-color-s;
            }
        }
    }
}

.hero {
    color: #fff;
    background:
        radial-gradient(600px 260px at 82% 10%, rgba(255, 255, 255, 0.18), transparent 60%),
        linear-gradient(125deg, #22406f 0%, #2b5aed 55%, #19b89b 130%);

    .hero-inner {
        max-width: 1160px;
        margin: 0 auto;
        padding: 84px 28px 68px;

        h1 {
            margin: 0 0 12px;
            font-size: clamp(30px, 4vw, 46px);
            letter-spacing: 1px;
        }

        p {
            margin: 0 0 30px;
            max-width: 560px;
            font-size: 16px;
            opacity: 0.86;
        }
    }

    .hero-stats {
        display: flex;
        gap: 40px;

        div {
            display: flex;
            flex-direction: column;
        }

        strong {
            font-size: 28px;
        }

        span {
            font-size: @size-s;
            opacity: 0.78;
        }
    }
}

.portal-main {
    max-width: 1160px;
    margin: -32px auto 0;
    padding: 0 28px 48px;
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
}

.portal-aside {
    position: sticky;
    top: 86px;
    display: flex;
    flex-direction: column;
    gap: 16px;

    .panel {
        padding: 18px;
        border-radius: 14px;
        background: @bg-color-l;
        box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
    }

    .panel-title {
        margin-bottom: 12px;
        font-size: @size-s;
        font-weight: 600;
        color: @font-color-m;
    }

    .filter-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .filter-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: @font-color-m;
        text-align: left;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;

        span {
            font-size: @size-ss;
            color: @font-color-s;
        }

        &:hover {
            background: @bg-color-m;
        }

        &.active {
            background: var(--pcolor1);
            color: @pcolor;
            font-weight: 600;

            span {
                color: @pcolor;
            }
        }
    }

    .label-cloud {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;

        button {
            padding: 4px 10px;
            border: 1px solid @line-color-m;
            border-radius: 999px;
            background: transparent;
            color: @font-color-s;
            cursor: pointer;

            &.active {
                border-color: @pcolor;
                background: var(--pcolor1);
                color: @pcolor;
            }
        }
    }
}

.portal-list {
    min-height: 320px;
    display: flex;
    flex-direction: column;
    gap: 16px;

    .state-tip {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 320px;

        &.empty {
            background: @bg-color-l;
            border-radius: 16px;
            box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
        }
    }

    .pagination-row {
        display: flex;
        justify-content: center;
        padding: 8px 0;
    }
}

.portal-footer {
    padding: 24px 0 32px;
    text-align: center;
    color: @font-color-s;
    font-size: @size-s;
}

@media (max-width: 900px) {
    .portal-main {
        grid-template-columns: 1fr;
    }

    .portal-aside {
        position: static;
    }
}

@media (max-width: 560px) {
    .hero .hero-inner {
        padding: 56px 22px 52px;
    }

    .hero .hero-stats {
        gap: 24px;
    }

    .portal-main {
        padding: 0 18px 36px;
    }
}
</style>

<!-- 非 scoped：根节点 data-theme 无法命中 scoped 选择器；用 .portal-home 祖先提升特异性覆盖 scoped 白底 -->
<style lang="less">
[data-theme='dark'] .portal-home .portal-header {
    background: rgba(18, 22, 30, 0.72);
}
</style>
