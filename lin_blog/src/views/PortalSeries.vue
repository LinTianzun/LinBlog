<template>
    <PortalLayout active-path="/portal/series">
        <PortalPageHeader index="05" kicker="COLLECTIONS & SERIES" title="系列"
            :description="`把同一主题下的文章按顺序串起来读，共 ${collections.length} 个系列。`"
            aside-label="THEMATIC INDEX" :aside-value="`${collections.length} 个系列`"
            aside-note="适合从第一篇开始，顺着一条完整的思路读到最后。">
            <div v-if="activeCollection" class="series-head-tools">
                <button type="button" class="series-back" @click="closeCollection">
                    <IconLeftOutline />
                    返回系列总览
                </button>
            </div>
        </PortalPageHeader>

        <section class="series-area">
            <div v-if="loadingList" class="series-state">
                <yk-spinner size="m" />
            </div>

            <div v-else-if="listError" class="series-state">
                <yk-empty description="系列加载失败，请稍后再试" />
                <yk-button type="text" size="s" @click="loadCollections">重新加载</yk-button>
            </div>

            <div v-else-if="loadingDetail" class="series-state">
                <yk-spinner size="m" />
            </div>

            <template v-else-if="activeCollection">
                <header class="series-detail-head portal-reveal">
                    <div class="series-detail-cover" :class="{ 'is-empty': !seriesCover }">
                        <img v-if="seriesCover" :src="seriesCover" :alt="activeCollection.name" />
                        <span v-else>{{ activeCollection.name.trim().charAt(0) || '系' }}</span>
                    </div>
                    <div class="series-detail-copy">
                        <span class="series-kicker">COLLECTION · {{ activeCollection.publishedCount }} ARTICLES</span>
                        <h2>{{ activeCollection.name }}</h2>
                        <p>{{ activeCollection.description || '沿着这个系列，一篇一篇读下去。' }}</p>
                        <span class="series-detail-meta">
                            按顺序阅读 · {{ activeCollection.publishedCount }} 篇已发布
                        </span>
                    </div>
                </header>

                <div v-if="loadingDetail" class="series-state">
                    <yk-spinner size="m" />
                </div>
                <ol v-else class="series-article-list">
                    <li v-for="(article, index) in activeCollection.articles" :key="article.id"
                        class="series-article" :style="{ '--stagger': `${Math.min(index, 8) * 45}ms` }">
                        <button type="button" class="series-article-button" @click="openArticle(article.id)">
                            <span class="series-article-index">{{ String(index + 1).padStart(2, '0') }}</span>
                            <span class="series-article-main">
                                <span class="series-article-meta">
                                    {{ formatDate(article.publishedAt || article.createdAt) }}
                                    <template v-if="article.subsetName"> · {{ article.subsetName }}</template>
                                </span>
                                <strong>{{ article.title }}</strong>
                                <span class="series-article-intro">{{ article.introduce || '点击阅读全文' }}</span>
                            </span>
                            <span class="series-article-go">
                                阅读
                                <IconRightOutline />
                            </span>
                        </button>
                    </li>
                </ol>
            </template>

            <div v-else-if="collections.length > 0" class="series-grid">
                <button v-for="(collection, index) in collections" :key="collection.id" type="button"
                    class="series-card portal-reveal" :style="{ '--stagger': `${Math.min(index, 8) * 55}ms` }"
                    @click="openCollection(collection.id)">
                    <span class="series-card-cover" :class="{ 'is-empty': !collection.cover }">
                        <img v-if="collection.cover" :src="collection.cover" :alt="collection.name" />
                        <span v-else>{{ collection.name.trim().charAt(0) || '系' }}</span>
                    </span>
                    <span class="series-card-body">
                        <span class="series-card-kicker">{{ collection.publishedCount }} 篇 · COLLECTION</span>
                        <strong>{{ collection.name }}</strong>
                        <span class="series-card-desc">{{ collection.description || '按主题串联的文章系列。' }}</span>
                        <span class="series-card-foot">
                            开始阅读
                            <IconRightOutline />
                        </span>
                    </span>
                </button>
            </div>

            <div v-else class="series-state">
                <yk-empty description="还没有公开的系列，先去文章页逛逛吧" />
                <RouterLink class="series-empty-link" to="/portal/articles">去看全部文章</RouterLink>
            </div>
        </section>

        <PortalArticleDetail :open="detailVisible" :article="activeArticle" @close="closeArticle"
            @open-related="openArticle" @interaction-change="handleInteractionChange"
            @view-counted="handleViewCounted" />
    </PortalLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PortalLayout from '../components/portal/PortalLayout.vue'
import PortalPageHeader from '../components/portal/PortalPageHeader.vue'
import PortalArticleDetail from '../components/portal/PortalArticleDetail.vue'
import {
    getPublicCollectionById,
    getPublicCollections,
    type CollectionDetail,
    type CollectionSummary,
} from '../api/collection'
import { getPublicArticleById } from '../api/portal'
import { articleSeoConfig, applyPortalSeo, portalItemUrl, type PortalSeoConfig } from '../utils/portalSeo'
import type { ArticleItem } from '../api/article'

const route = useRoute()
const router = useRouter()

const collections = ref<CollectionSummary[]>([])
const activeCollection = ref<CollectionDetail | null>(null)
const activeArticle = ref<ArticleItem | null>(null)
const detailVisible = ref(false)
const loadingList = ref(false)
const loadingDetail = ref(false)
const listError = ref(false)

const seriesCover = computed(() => {
    if (!activeCollection.value) return ''
    return activeCollection.value.cover || activeCollection.value.articles[0]?.cover || ''
})

const formatDate = (value?: string | null): string => {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN')
}

const seriesSeo = (collection?: CollectionDetail | null): PortalSeoConfig => {
    if (!collection) {
        return {
            title: '内容系列',
            description: '按主题串联的文章系列，从第一篇开始顺序阅读。',
            url: new URL('/portal/series', window.location.origin).toString(),
            type: 'website',
        }
    }

    const url = new URL('/portal/series', window.location.origin)
    url.searchParams.set('collection', String(collection.id))
    return {
        title: collection.name,
        description: collection.description || `按顺序阅读「${collection.name}」系列。`,
        url: url.toString(),
        image: collection.cover || collection.articles[0]?.cover || '',
        type: 'website',
    }
}

const loadCollections = async (): Promise<void> => {
    loadingList.value = true
    listError.value = false
    try {
        const result = await getPublicCollections()
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '系列加载失败')
        }
        collections.value = result.data.list
    } catch {
        collections.value = []
        listError.value = true
    } finally {
        loadingList.value = false
    }
}

const loadCollection = async (id: number): Promise<void> => {
    loadingDetail.value = true
    try {
        const result = await getPublicCollectionById(id)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '系列详情加载失败')
        }
        activeCollection.value = result.data
        applyPortalSeo(seriesSeo(result.data))
    } catch {
        activeCollection.value = null
        listError.value = true
    } finally {
        loadingDetail.value = false
    }
}

const syncQuery = (collectionId: number | null = activeCollection.value?.id ?? null,
    openId: number | null = activeArticle.value?.id ?? null): void => {
    const query: Record<string, string> = {}
    if (collectionId) query.collection = String(collectionId)
    if (openId) query.open = String(openId)
    void router.replace({ path: '/portal/series', query })
}

const openCollection = (id: number): void => {
    listError.value = false
    loadingDetail.value = true
    activeCollection.value = null
    void router.push({ path: '/portal/series', query: { collection: String(id) } })
}

const closeCollection = (): void => {
    activeCollection.value = null
    activeArticle.value = null
    detailVisible.value = false
    applyPortalSeo(seriesSeo())
    void router.push({ path: '/portal/series' })
}

const openArticle = async (id: number, sync = true): Promise<void> => {
    try {
        const result = await getPublicArticleById(id)
        if (result.code === 200 && result.data) {
            activeArticle.value = result.data
            detailVisible.value = true
            applyPortalSeo(articleSeoConfig(result.data, portalItemUrl('article', id)))
            if (sync) syncQuery(activeCollection.value?.id ?? null, id)
        }
    } catch {
        detailVisible.value = false
    }
}

const closeArticle = (sync = true): void => {
    detailVisible.value = false
    activeArticle.value = null
    applyPortalSeo(seriesSeo(activeCollection.value))
    if (sync) syncQuery(activeCollection.value?.id ?? null, null)
}

const handleInteractionChange = (payload: { likes: number; comments: number }): void => {
    if (!activeArticle.value) return
    activeArticle.value = {
        ...activeArticle.value,
        likes: payload.likes,
        comments: payload.comments,
    }
    const target = activeCollection.value?.articles.find(item => item.id === activeArticle.value?.id)
    if (target) {
        target.likes = payload.likes
        target.comments = payload.comments
    }
}

const handleViewCounted = (payload: { views: number }): void => {
    if (!activeArticle.value) return
    activeArticle.value = { ...activeArticle.value, views: payload.views }
    const target = activeCollection.value?.articles.find(item => item.id === activeArticle.value?.id)
    if (target) target.views = payload.views
}

onMounted(async () => {
    applyPortalSeo(seriesSeo())
    await loadCollections()

    const collectionId = Number(route.query.collection)
    if (Number.isSafeInteger(collectionId) && collectionId > 0) {
        await loadCollection(collectionId)
    }

    const openId = Number(route.query.open)
    if (Number.isSafeInteger(openId) && openId > 0) {
        await openArticle(openId, false)
    }
})

watch(() => route.query.collection, async (value) => {
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) {
        if (activeCollection.value) {
            activeCollection.value = null
            applyPortalSeo(seriesSeo())
        }
        return
    }
    if (activeCollection.value?.id !== id) {
        if (detailVisible.value) closeArticle(false)
        await loadCollection(id)
    }
})

watch(() => route.query.open, (value) => {
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) {
        if (detailVisible.value) closeArticle(false)
        return
    }
    if (activeArticle.value?.id !== id) void openArticle(id, false)
})
</script>

<style lang="less" scoped>
.series-area {
    min-height: 46vh;
    padding: clamp(30px, 5vw, 54px) 0 clamp(64px, 9vw, 110px);
}

.series-head-tools {
    display: flex;
    align-items: center;
    gap: 12px;
}

.series-back {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 12px;
    border: 1px solid var(--portal-surface-border);
    border-radius: 999px;
    color: var(--portal-text-secondary);
    background: var(--portal-surface);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;

    &:hover {
        color: var(--portal-accent-strong);
        border-color: var(--portal-accent-soft);
        transform: translateX(-2px);
    }
}

.series-state {
    display: flex;
    min-height: 280px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: var(--portal-text-tertiary);
}

.series-empty-link {
    color: var(--portal-accent-strong);
    font-size: 13px;
    text-decoration: none;

    &:hover {
        text-decoration: underline;
    }
}

.series-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: clamp(16px, 2.4vw, 26px);
}

.series-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--portal-surface-border);
    border-radius: var(--portal-radius-card);
    color: inherit;
    background: var(--portal-surface);
    box-shadow: var(--portal-shadow-soft);
    text-align: left;
    cursor: pointer;
    transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
    animation: series-rise 0.5s ease both;
    animation-delay: var(--stagger, 0ms);

    &:hover {
        border-color: var(--portal-accent-soft);
        box-shadow: var(--portal-shadow-hover);
        transform: translateY(-4px);
    }
}

.series-card-cover {
    display: grid;
    width: 100%;
    aspect-ratio: 16 / 10;
    place-items: center;
    overflow: hidden;
    color: var(--portal-accent-strong);
    background:
        radial-gradient(circle at 20% 20%, var(--portal-accent-soft), transparent 55%),
        var(--portal-surface-strong);
    font-family: var(--portal-serif);
    font-size: clamp(40px, 6vw, 72px);

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.5s ease;
    }

    .series-card:hover & img {
        transform: scale(1.035);
    }
}

.series-card-body {
    display: flex;
    min-height: 190px;
    flex-direction: column;
    gap: 9px;
    padding: 20px 21px 18px;
}

.series-card-kicker,
.series-kicker {
    color: var(--portal-accent-strong);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
}

.series-card-body > strong {
    color: var(--portal-text-primary);
    font-family: var(--portal-serif);
    font-size: clamp(20px, 2.4vw, 27px);
    font-weight: 600;
    line-height: 1.25;
}

.series-card-desc {
    display: -webkit-box;
    overflow: hidden;
    color: var(--portal-text-secondary);
    font-size: 13px;
    line-height: 1.7;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
}

.series-card-foot {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: auto;
    padding-top: 8px;
    color: var(--portal-accent-strong);
    font-size: 12px;
    font-weight: 600;
}

.series-detail-head {
    display: grid;
    grid-template-columns: minmax(220px, 340px) minmax(0, 1fr);
    gap: clamp(24px, 4vw, 54px);
    align-items: center;
    margin-bottom: clamp(32px, 5vw, 56px);
    padding-bottom: clamp(26px, 4vw, 44px);
    border-bottom: 1px solid var(--portal-line-soft);
}

.series-detail-cover {
    display: grid;
    width: 100%;
    aspect-ratio: 4 / 3;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--portal-surface-border);
    border-radius: var(--portal-radius-card);
    color: var(--portal-accent-strong);
    background:
        radial-gradient(circle at 25% 20%, var(--portal-accent-soft), transparent 58%),
        var(--portal-surface-strong);
    box-shadow: var(--portal-shadow-hover);
    font-family: var(--portal-serif);
    font-size: clamp(54px, 8vw, 96px);

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
}

.series-detail-copy h2 {
    margin: 10px 0 14px;
    color: var(--portal-text-primary);
    font-family: var(--portal-serif);
    font-size: clamp(34px, 5.6vw, 64px);
    font-weight: 500;
    line-height: 1.08;
}

.series-detail-copy p {
    max-width: 680px;
    margin: 0;
    color: var(--portal-text-secondary);
    font-size: clamp(14px, 1.5vw, 16px);
    line-height: 1.9;
}

.series-detail-meta {
    display: block;
    margin-top: 18px;
    color: var(--portal-text-tertiary);
    font-size: 11px;
    letter-spacing: 0.05em;
}

.series-article-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    margin: 0;
    list-style: none;
    border-top: 1px solid var(--portal-line-soft);
}

.series-article {
    border-bottom: 1px solid var(--portal-line-soft);
    animation: series-rise 0.45s ease both;
    animation-delay: var(--stagger, 0ms);
}

.series-article-button {
    display: grid;
    width: 100%;
    grid-template-columns: 52px minmax(0, 1fr) auto;
    gap: clamp(14px, 2vw, 26px);
    align-items: center;
    padding: clamp(18px, 2.6vw, 28px) 8px;
    border: 0;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.2s ease, padding 0.2s ease;

    &:hover {
        padding-left: 16px;
        background: color-mix(in srgb, var(--portal-accent-soft) 38%, transparent);

        .series-article-go {
            color: var(--portal-accent-strong);
            transform: translateX(3px);
        }
    }
}

.series-article-index {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 1px solid var(--portal-surface-border);
    border-radius: 50%;
    color: var(--portal-accent-strong);
    background: var(--portal-surface);
    font-family: var(--portal-serif);
    font-size: 13px;
}

.series-article-main {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;

    strong {
        color: var(--portal-text-primary);
        font-family: var(--portal-serif);
        font-size: clamp(18px, 2.3vw, 25px);
        font-weight: 550;
        line-height: 1.35;
    }
}

.series-article-meta {
    color: var(--portal-text-tertiary);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.series-article-intro {
    overflow: hidden;
    color: var(--portal-text-secondary);
    font-size: 13px;
    line-height: 1.65;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.series-article-go {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--portal-text-tertiary);
    font-size: 12px;
    transition: color 0.2s ease, transform 0.2s ease;
}

@keyframes series-rise {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (max-width: 760px) {
    .series-detail-head {
        grid-template-columns: 1fr;
    }

    .series-detail-cover {
        max-width: 420px;
    }

    .series-article-button {
        grid-template-columns: 38px minmax(0, 1fr);
    }

    .series-article-index {
        width: 34px;
        height: 34px;
        font-size: 11px;
    }

    .series-article-go {
        display: none;
    }

    .series-article-intro {
        white-space: normal;
    }
}
</style>
