<template>
    <yk-space dir="vertical" class="artcle" size="xl">
        <div v-if="loading" class="artcle-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在加载文章...</yk-text>
        </div>

        <div v-else-if="errorMessage" class="artcle-state">
            <yk-empty description="文章加载失败">
                <yk-text type="secondary">{{ errorMessage }}</yk-text>
                <yk-button type="secondary" @click="fetchArticles">重新加载</yk-button>
            </yk-empty>
        </div>

        <yk-empty v-else-if="articleList.length === 0" description="暂无符合条件文章" />

        <template v-else>
            <artcle-item v-for="item in articleList" :key="item.id" :data="item"
                :can-publish="canPublish" :can-edit="canEdit(item)"
                :can-delete="canDelete(item)" @delete="removeArticle"
                @state="updateState" @view="openDetail" />
            <div class="artcle-pagination">
                <yk-pagination :current="page" :page-size="props.pageSize" :total="count"
                    size="m" @change="changePage" />
            </div>
        </template>

        <article-detail-view v-model="detailVisible" :article-id="selectedArticleId"
            @changed="handleDetailChanged" />
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, getCurrentInstance, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ArticleItem, ArticleState } from '../../api/article'
import {
    deleteArticle,
    getArticleErrorMessage,
    getArticles,
    updateArticleStatus,
} from '../../api/article'
import artcleItem from './artcleItem.vue'
// 详情弹窗包含正文渲染与 DOMPurify，打开时再加载
const ArticleDetailView = defineAsyncComponent(() => import('../../views/ArticleDetailView.vue'))
import { useSubsetStore } from '../../store/subset'

type Props = {
    pageSize?: number
    subsetId?: number
    uncategorized?: boolean
    labelName?: string
    serchTerm?: string
    state?: ArticleState | ''
}

const props = withDefaults(defineProps<Props>(), {
    pageSize: 6,
    subsetId: -1,
    uncategorized: false,
    labelName: '',
    serchTerm: '',
    state: '',
})

type StateUpdateEvent = {
    id: number
    state: ArticleState
}

type MessageOptions = {
    type: 'primary' | 'warning' | 'error'
    message: string
}

type MessageProxy = {
    $message?: (options: MessageOptions) => void
}

const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined
const subsetStore = useSubsetStore()
const route = useRoute()
const router = useRouter()
const articleList = ref<ArticleItem[]>([])
const count = ref(0)
const page = ref(1)
const loading = ref(false)
const errorMessage = ref('')
const detailVisible = ref(false)
const selectedArticleId = ref<number | null>(null)

const currentUser = (() => {
    try {
        const saved = localStorage.getItem('userInfo')
        return saved ? JSON.parse(saved) as { id?: number; user_type?: string } : null
    } catch {
        return null
    }
})()

const currentRole = currentUser?.user_type || ''
const canPublish = computed(() => ['admin', 'editor'].includes(currentRole))

const showMessage = (type: MessageOptions['type'], message: string): void => {
    proxy?.$message?.({ type, message })
}

const canEdit = (article: ArticleItem): boolean => {
    if (['admin', 'editor'].includes(currentRole)) return true
    return currentRole === 'normal' &&
        Number(article.userId) === Number(currentUser?.id) &&
        ['draft', 'rejected'].includes(article.state)
}

const canDelete = (article: ArticleItem): boolean => {
    if (['admin', 'editor'].includes(currentRole)) return true
    return currentRole === 'normal' &&
        Number(article.userId) === Number(currentUser?.id)
}

const fetchArticles = async (): Promise<void> => {
    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getArticles({
            page: page.value,
            pageSize: props.pageSize,
            state: props.state || undefined,
            classify: 'article',
            subsetId: props.subsetId > 0 ? props.subsetId : undefined,
            uncategorized: props.uncategorized || undefined,
            label: props.labelName.trim() || undefined,
            keyword: props.serchTerm.trim() || undefined,
        })

        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '文章加载失败')
        }

        articleList.value = result.data.list
        count.value = result.data.total

        if (result.data.list.length === 0 && page.value > 1) {
            page.value = 1
            await fetchArticles()
            return
        }
    } catch (error) {
        articleList.value = []
        count.value = 0
        errorMessage.value = error instanceof Error && !getArticleErrorMessage(error, '')
            ? error.message
            : getArticleErrorMessage(error, '文章加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

const changePage = (nextPage: number): void => {
    if (nextPage === page.value) return
    page.value = nextPage
    void fetchArticles()
}

const openDetail = (id: number): void => {
    selectedArticleId.value = id
    detailVisible.value = true
}

const handleDetailChanged = (): void => {
    void fetchArticles()
    void subsetStore.fetchStateSummary()
    void subsetStore.fetchSubsets()
}

const removeArticle = async (id: number): Promise<void> => {
    try {
        const result = await deleteArticle(id)
        if (result.code !== 200) throw new Error(result.message || '删除失败')

        showMessage('primary', '文章已删除')

        if (articleList.value.length === 1 && page.value > 1) {
            page.value -= 1
        }

        await fetchArticles()
        await Promise.all([subsetStore.fetchStateSummary(), subsetStore.fetchSubsets()])
    } catch (error) {
        showMessage('error', getArticleErrorMessage(error, '删除失败，请稍后重试'))
    }
}

const updateState = async (event: StateUpdateEvent): Promise<void> => {
    try {
        const result = await updateArticleStatus(event.id, event.state)
        if (result.code !== 200) throw new Error(result.message || '状态修改失败')

        showMessage('primary', result.message || '文章状态已更新')
        await fetchArticles()
        await Promise.all([subsetStore.fetchStateSummary(), subsetStore.fetchSubsets()])
    } catch (error) {
        showMessage('error', getArticleErrorMessage(error, '状态修改失败，请稍后重试'))
    }
}

watch(
    () => [props.subsetId, props.uncategorized, props.labelName, props.serchTerm, props.state],
    () => {
        page.value = 1
        void fetchArticles()
    },
    { immediate: true }
)

// 从总览页点评论跳转过来时（?open=id）自动打开详情。
// 详情弹窗按 ID 自己拉数据，不依赖当前页是否包含这一行；用完即清，避免翻页后重复弹出。
watch(() => route.query.open, raw => {
    const targetId = typeof raw === 'string' ? Number(raw) : null
    if (!Number.isFinite(targetId) || !targetId) return

    openDetail(targetId)
    void router.replace({ query: { ...route.query, open: undefined } })
}, { immediate: true })
</script>

<style lang="less" scoped>
.artcle {
    width: 100%;

    &-state {
        width: 100%;
        min-height: 220px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
        border-radius: @radius-m;
        background: @bg-color-l;
    }

    &-pagination {
        display: flex;
        width: 100%;
        padding: @space-s 0 @space-xl;
        align-items: center;
        justify-content: flex-end;
    }
}
</style>
