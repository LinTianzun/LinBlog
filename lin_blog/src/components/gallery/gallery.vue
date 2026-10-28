<template>
    <div ref="rootRef" class="gallery">
        <div class="gallery-content">
            <div v-if="loading && galleryList.length === 0" class="gallery-state">
                <yk-spinner size="m" />
                <yk-text type="secondary">正在加载图库...</yk-text>
            </div>

            <div v-else-if="errorMessage" class="gallery-state">
                <yk-empty description="图库加载失败">
                    <yk-text type="secondary">{{ errorMessage }}</yk-text>
                    <yk-button type="secondary" @click="fetchGalleries">重新加载</yk-button>
                </yk-empty>
            </div>

            <yk-empty v-else-if="galleryList.length === 0" description="暂无图库作品" />

            <div v-else class="gallery-content-files" :class="{ 'is-refreshing': loading }">
                <galleryItem v-for="item in galleryList" :key="item.id" :data="item"
                    @delete="removeGallery" @view="openDetail">
                </galleryItem>
            </div>
        </div>
        <div v-if="count > effectivePageSize" class="gallery-pagination">
            <yk-pagination :current="page" :page-size="effectivePageSize" @change="changePage" :total="count"
                size="m" />
        </div>
    </div>

    <!-- 后台图库详情：点卡片打开，含图片、简介与评论区 -->
    <galleryDetailView v-model="detailVisible" :gallery-id="detailId" @changed="fetchGalleries" />
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, watch, getCurrentInstance, type ComponentPublicInstance } from 'vue'
import type { ArticleItem, ArticleState } from '../../api/article.ts'
import {
    deleteArticle,
    getArticleErrorMessage,
    getArticles,
} from '../../api/article.ts'
import galleryItem from './galleryItem.vue'
import galleryDetailView from './galleryDetailView.vue'
import { useRoute, useRouter } from 'vue-router'
import { useResponsiveGridPageSize } from '../../utils/responsivePageSize.ts'

const props = defineProps({
    pageSize: {
        type: Number,
        default: undefined,
    },
    subsetId: {
        type: Number,
        default: -1,
    },
    uncategorized: {
        type: Boolean,
        default: false,
    },
    serchTerm: {
        type: String,
        default: '',
    },
    state: {
        type: String as () => ArticleState | '',
        default: '',
    },
})

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type GalleryComponentInstance = ComponentPublicInstance & {
    $message?: (options: MessageOptions) => void
}

const proxy = getCurrentInstance()?.proxy as GalleryComponentInstance | null | undefined
const rootRef = ref<HTMLElement | null>(null)
const router = useRouter()
const route = useRoute()
const responsivePageSize = useResponsiveGridPageSize(rootRef, {
    minCardWidth: 238,
    gap: 24,
    rows: 3,
    horizontalPadding: 48,
})
const effectivePageSize = computed(
    () => props.pageSize ?? responsivePageSize.value
)

// 图库列表
const galleryList = ref<ArticleItem[]>([])

// 图库总数
const count = ref(0)
const page = ref(1)
const loading = ref(false)
const errorMessage = ref('')
let requestedPageSize = 0

// 详情弹窗
const detailVisible = ref(false)
const detailId = ref<number | null>(null)

const openDetail = (id: number): void => {
    detailId.value = id
    detailVisible.value = true
}

// 获取图库
const fetchGalleries = async (): Promise<void> => {
    requestedPageSize = effectivePageSize.value
    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getArticles({
            page: page.value,
            pageSize: effectivePageSize.value,
            state: props.state || undefined,
            classify: 'image',
            subsetId: props.subsetId > 0 ? props.subsetId : undefined,
            uncategorized: props.uncategorized || undefined,
            keyword: props.serchTerm.trim() || undefined,
        })

        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '图库加载失败')
        }

        galleryList.value = result.data.list
        count.value = result.data.total

        if (result.data.list.length === 0 && page.value > 1) {
            page.value = 1
            await fetchGalleries()
            return
        }
    } catch (error) {
        galleryList.value = []
        count.value = 0
        errorMessage.value = getArticleErrorMessage(error, '图库加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

// 分页
const changePage = (nextPage: number): void => {
    if (nextPage === page.value) return
    page.value = nextPage
    void fetchGalleries()
}

// 删除
const removeGallery = async (id: number): Promise<void> => {
    try {
        const result = await deleteArticle(id)
        if (result.code !== 200) throw new Error(result.message || '删除失败')

        proxy?.$message?.({ type: 'primary', message: '删除完成' })

        if (galleryList.value.length === 1 && page.value > 1) {
            page.value -= 1
        }

        await fetchGalleries()
    } catch (error) {
        proxy?.$message?.({ type: 'error', message: getArticleErrorMessage(error, '删除失败，请稍后重试') })
    }
}

onMounted(() => {
    void fetchGalleries()
})

// 从总览页点评论跳转过来时（?open=id）自动打开详情。
// 详情弹窗按 ID 自己拉数据，不依赖当前页是否包含这一行；用完即清，避免翻页后重复弹出。
watch(() => route.query.open, raw => {
    const targetId = typeof raw === 'string' ? Number(raw) : null
    if (!Number.isFinite(targetId) || !targetId) return

    openDetail(targetId)
    void router.replace({ query: { ...route.query, open: undefined } })
}, { immediate: true })

watch(
    () => [props.subsetId, props.uncategorized, props.serchTerm, props.state],
    () => {
        page.value = 1
        void fetchGalleries()
    }
)

watch(effectivePageSize, size => {
    // 初始化时尺寸测量和 onMounted 会先后触发，避免同一页大小重复请求
    if (size === requestedPageSize) return
    page.value = 1
    void fetchGalleries()
})
</script>

<style lang="less" scoped>
.gallery {
    width: 100%;
    background: @bg-color-l;
    padding: 32px 24px 24px;
    border-radius: @radius-m;

    &-content {
        display: inline;

        &-files {
            display: grid;
            // 流体列：大屏时卡片撑满可用宽度，不再固定 240px 居中留白
            grid-template-columns: repeat(auto-fill, minmax(238px, 1fr));
            row-gap: 32px;
            column-gap: 24px;
            transition: opacity 160ms ease;

            &.is-refreshing {
                opacity: 0.72;
                pointer-events: none;
            }
        }
    }

    &-state {
        width: 100%;
        min-height: 320px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
    }

    &-pagination {
        display: flex;
        width: 100%;
        padding: @space-s 0;
        align-items: center;
        justify-content: flex-end;
    }
}
</style>
