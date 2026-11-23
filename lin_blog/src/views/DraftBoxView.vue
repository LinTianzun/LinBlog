<template>
    <yk-space dir="vertical" size="l" class="admin-page draft-page">
        <top-title name="草稿箱" description="未发布内容的统一入口 · 继续编辑 · 直接发布" :is-search="true"
            @search="handleSearch">
            <template #custom>
                <yk-space align="center" size="m">
                    <yk-button v-if="canCreateArticle" type="secondary" size="s" @click="goCreate('article')">
                        写文章
                    </yk-button>
                    <yk-button v-if="canCreateGallery" type="secondary" size="s" @click="goCreate('image')">
                        传图集
                    </yk-button>
                    <yk-button type="secondary" size="s" :disabled="loading" @click="loadDrafts">
                        <IconRefreshOutline /> 刷新
                    </yk-button>
                </yk-space>
            </template>
        </top-title>

        <DraftSummaryCards :counts="draftCounts" />

        <section class="draft-panel draft-filter-panel">
            <div class="draft-filter-row">
                <span class="draft-filter-label">类型</span>
                <yk-radio-group v-model="classifyFilter" type="button" :solid="true" @change="reload">
                    <yk-radio value="">全部</yk-radio>
                    <yk-radio value="article">博客文章</yk-radio>
                    <yk-radio value="image">摄影图库</yk-radio>
                </yk-radio-group>
                <span class="draft-filter-spacer" />
                <yk-text type="third">
                    只收录从未发布的内容；已发布文章的未上线修改请回编辑页处理
                </yk-text>
            </div>
        </section>

        <div v-if="actionError" class="draft-error" role="alert">
            <span>{{ actionError }}</span>
            <button type="button" aria-label="关闭提示" @click="actionError = ''">×</button>
        </div>

        <div v-if="loading && !items.length" class="draft-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在读取草稿...</yk-text>
        </div>

        <div v-else-if="errorMessage" class="draft-state is-error">
            <yk-empty :description="errorMessage" />
            <yk-button type="primary" @click="loadDrafts">重新加载</yk-button>
        </div>

        <template v-else>
            <yk-empty v-if="!items.length" description="这里还没有草稿，去写点什么吧" />

            <div v-else class="draft-list" :class="{ 'is-refreshing': loading }">
                <DraftCard v-for="item in items" :key="item.id" :item="item" :acting="actingId === item.id"
                    :can-publish="canPublish(item.classify)" @edit="openEditor" @publish="askPublish" />

                <div class="draft-pagination">
                    <AdminPager v-model:page="page" v-model:page-size="pageSize" :total="total"
                        :page-size-options="[10, 20, 50]" :show-page-size="true" :show-total="true"
                        :disabled="loading" @change="handlePagerChange" />
                </div>
            </div>
        </template>

        <yk-modal :model-value="publishTarget !== null" title="立即发布草稿" size="s"
            :closeable="!acting" @update:model-value="closePublish">
            <div class="draft-dialog">
                <p class="draft-dialog-copy">
                    发布后内容会立即出现在门户，若已安排排期会同步清除。
                </p>
                <blockquote v-if="publishTarget">{{ publishTarget.title }}</blockquote>
                <div class="draft-dialog-actions">
                    <yk-button size="s" :disabled="acting" @click="closePublish()">返回</yk-button>
                    <yk-button size="s" type="primary" :loading="acting" @click="confirmPublish">
                        确认发布
                    </yk-button>
                </div>
            </div>
        </yk-modal>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IconRefreshOutline } from '@yike-design/ui/es/components/svg-icon'
import TopTitle from '../components/bar/TopTitle.vue'
import AdminPager from '../components/common/AdminPager.vue'
import DraftCard from '../components/draft/DraftCard.vue'
import DraftSummaryCards from '../components/draft/DraftSummaryCards.vue'
import {
    getArticleErrorMessage,
    getArticleStateSummary,
    getArticles,
    updateArticleStatus,
    type ArticleClassify,
    type ArticleItem,
} from '../api/article'
import { useSessionStore } from '../store/session'
import {
    buildDraftListParams,
    draftPublishPermission,
    resolveDraftCounts,
    type DraftCounts,
} from '../utils/draftBox'

const router = useRouter()
const session = useSessionStore()
const instance = getCurrentInstance()
const proxy = instance?.proxy as { $message?: (options: {
    type: 'primary' | 'success' | 'warning' | 'error'
    message: string
}) => void } | null

const items = ref<ArticleItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const classifyFilter = ref<'' | ArticleClassify>('')
const keyword = ref('')
const loading = ref(false)
const acting = ref(false)
const actingId = ref(0)
const errorMessage = ref('')
const actionError = ref('')
const draftCounts = ref<DraftCounts>({ article: 0, gallery: 0, total: 0 })
const publishTarget = ref<ArticleItem | null>(null)

const canCreateArticle = computed(() =>
    session.canAny(['article.create', 'article.manageOwn', 'article.manageAll'])
)
const canCreateGallery = computed(() =>
    session.canAny(['gallery.create', 'gallery.manageOwn', 'gallery.manageAll'])
)

const canPublish = (classify: ArticleClassify): boolean =>
    session.can(draftPublishPermission(classify))

const showMessage = (type: 'primary' | 'success' | 'warning' | 'error', message: string): void => {
    proxy?.$message?.({ type, message })
}

const describeError = (error: unknown, fallback: string): string => {
    const responseMessage = getArticleErrorMessage(error, '')
    if (responseMessage) return responseMessage
    return error instanceof Error && error.message ? error.message : fallback
}

const loadSummary = async (): Promise<void> => {
    try {
        const [articleResult, galleryResult] = await Promise.all([
            getArticleStateSummary('article'),
            getArticleStateSummary('image'),
        ])
        draftCounts.value = resolveDraftCounts(articleResult.data, galleryResult.data)
    } catch {
        // 统计失败不影响列表，保留 0 避免页面报错
    }
}

const loadDrafts = async (): Promise<void> => {
    loading.value = true
    errorMessage.value = ''
    try {
        const result = await getArticles(buildDraftListParams({
            page: page.value,
            pageSize: pageSize.value,
            classify: classifyFilter.value,
            keyword: keyword.value,
        }))
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '草稿列表加载失败')
        }
        items.value = result.data.list
        total.value = result.data.total
        actionError.value = ''
        void loadSummary()
    } catch (error) {
        items.value = []
        total.value = 0
        errorMessage.value = describeError(error, '草稿列表加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

const reload = (): void => {
    page.value = 1
    void loadDrafts()
}

const handleSearch = (value: unknown): void => {
    keyword.value = String(value ?? '').trim()
    reload()
}

const handlePagerChange = (): void => {
    void loadDrafts()
}

const openEditor = (item: ArticleItem): void => {
    void router.push(item.classify === 'image' ? `/editgallery/${item.id}` : `/editarticle/${item.id}`)
}

const goCreate = (classify: ArticleClassify): void => {
    void router.push(classify === 'image' ? '/editgallery' : '/editarticle')
}

const askPublish = (item: ArticleItem): void => {
    publishTarget.value = item
}

const closePublish = (open?: boolean): void => {
    if (open === true || acting.value) return
    publishTarget.value = null
}

const confirmPublish = async (): Promise<void> => {
    const target = publishTarget.value
    if (!target || acting.value) return

    acting.value = true
    actingId.value = target.id
    actionError.value = ''
    try {
        const result = await updateArticleStatus(target.id, 'published')
        if (result.code !== 200) throw new Error(result.message || '发布失败')
        publishTarget.value = null
        showMessage('success', `「${target.title}」已发布`)
        await loadDrafts()
    } catch (error) {
        actionError.value = describeError(error, '发布草稿失败，请稍后重试')
    } finally {
        acting.value = false
        actingId.value = 0
    }
}

onMounted(() => {
    void loadDrafts()
})
</script>

<style lang="less" scoped>
    .draft-page {
        width: 100%;
    }

    .draft-panel {
        display: block;
        width: 100%;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: var(--admin-radius, 18px);
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm);
    }

    .draft-filter-panel {
        padding: 12px 16px;
    }

    .draft-filter-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 14px;
    }

    .draft-filter-label {
        color: var(--gray6);
        font-size: 12px;
        font-weight: 650;
    }

    .draft-filter-spacer {
        flex: 1;
    }

    .draft-error {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 11px 14px;
        border: 1px solid color-mix(in srgb, @ecolor 34%, transparent);
        border-radius: var(--admin-radius-sm, 12px);
        background: color-mix(in srgb, @ecolor 9%, transparent);
        color: @ecolor;
        font-size: 13px;

        button {
            border: 0;
            background: transparent;
            color: inherit;
            font-size: 18px;
            cursor: pointer;
        }
    }

    .draft-state {
        display: flex;
        min-height: 240px;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 12px;
        border: 1px dashed var(--admin-line, var(--gray1));
        border-radius: var(--admin-radius, 18px);
        background: var(--admin-surface-soft, var(--bgColor1));
    }

    .draft-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        transition: opacity 160ms ease;

        &.is-refreshing {
            opacity: 0.58;
        }
    }

    .draft-pagination {
        padding-top: 4px;
    }

    .draft-dialog {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .draft-dialog-copy {
        margin: 0;
        color: var(--gray7);
        font-size: 13px;
        line-height: 1.6;
    }

    .draft-dialog blockquote {
        margin: 0;
        padding: 10px 12px;
        border-left: 3px solid var(--pcolor);
        background: var(--admin-surface-soft, var(--bgColor1));
        color: var(--gray8);
        font-size: 13px;
    }

    .draft-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    @media (max-width: 900px) {
        .draft-filter-spacer {
            display: none;
        }
    }
</style>
