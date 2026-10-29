<!--
    后台评论列表：文章 / 图库 / 随笔详情共用。

    与前台共用 ContentCommentThread 的排版，差异仅在交互权限：
    后台是管理视图，只有删除（按权限矩阵判定），没有点赞、回复、举报入口，
    并额外保留分页与信息密度更高的时间格式。
-->
<template>
    <div class="cc-list">
        <div v-if="loading" class="cc-list-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在加载评论...</yk-text>
        </div>

        <div v-else-if="errorMessage" class="cc-list-state">
            <yk-empty description="评论加载失败">
                <yk-text type="secondary">{{ errorMessage }}</yk-text>
                <yk-button type="secondary" @click="loadComments">重新加载</yk-button>
            </yk-empty>
        </div>

        <yk-empty v-else-if="!threads.length" description="还没有评论" />

        <yk-scrollbar v-else class="cc-list-scroll" :style="{ maxHeight: `${maxHeight}px` }">
            <div class="cc-list-body">
                <ContentCommentThread v-for="thread in threads" :key="thread.root.id"
                    :root="thread.root" :replies="thread.replies"
                    :expanded="isExpanded(thread.root.id)" :can-delete="true"
                    :can-confirm-delete="true"
                    :delete-confirming="deleteConfirmId === thread.root.id"
                    :delete-confirming-reply-id="deleteConfirmId" @toggle="toggleReplies(thread.root.id)"
                    @delete="requestDelete(thread.root.id)" @delete-reply="requestDelete">
                </ContentCommentThread>
            </div>
        </yk-scrollbar>

        <div class="cc-list-pagination">
            <AdminPager v-model:page="page" :page-size="pageSize" :total="count" size="s"
                :show-total="true" :disabled="loading" @change="handlePagerChange" />
        </div>
    </div>
</template>

<script lang="ts" setup generic="T extends ContentComment">
import { computed, ref, watch } from 'vue'
import type { ContentComment } from './comment.ts'
import { buildCommentThreads } from './comment.ts'
import ContentCommentThread from './ContentCommentThread.vue'
import AdminPager from '../common/AdminPager.vue'
import { getRequestErrorMessage } from '../../api/comment.ts'

const props = withDefaults(defineProps<{
    // 数据获取交给外部注入：文章评论与随笔评论走不同接口/表
    fetcher: (params: { page: number; pageSize: number }) => Promise<{
        list: T[]
        total: number
    }>
    // 删除交给外部注入：文章评论与随笔评论走不同删除接口
    remover: (id: number) => Promise<unknown>
    // 目标 id 变化时重新加载（打开另一篇内容时）
    targetId: number
    pageSize?: number
    maxHeight?: number
}>(), {
    pageSize: 20,
    maxHeight: 320,
})

const emits = defineEmits<{
    (event: 'changed'): void
}>()

const count = ref(0)
const page = ref(1)
const loading = ref(false)
const errorMessage = ref('')
const comments = ref<T[]>([])
// 二级回复默认收起，避免长列表一眼铺满
const expandedThreads = ref<Set<number>>(new Set())
// 删除需二次确认：首次点击标记待确认，再点一次才真正删除
const deleteConfirmId = ref<number | null>(null)

const threads = computed(() => buildCommentThreads(comments.value))

const isExpanded = (commentId: number) => expandedThreads.value.has(commentId)

const toggleReplies = (commentId: number) => {
    const next = new Set(expandedThreads.value)
    if (next.has(commentId)) next.delete(commentId)
    else next.add(commentId)
    expandedThreads.value = next
}

const loadComments = async (): Promise<void> => {
    loading.value = true
    errorMessage.value = ''

    try {
        const result = await props.fetcher({ page: page.value, pageSize: props.pageSize })
        comments.value = result.list
        count.value = result.total

        if (result.list.length === 0 && page.value > 1) {
            page.value = 1
            await loadComments()
        }
    } catch (error) {
        comments.value = []
        count.value = 0
        errorMessage.value = getRequestErrorMessage(error, '评论加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

// 分页：页码已由 v-model 同步，这里只按最新页码拉数据
const handlePagerChange = (): void => {
    void loadComments()
}

// 首次点击标记待确认，再次点击才真正删除，避免误删
const requestDelete = (id: number): void => {
    if (deleteConfirmId.value !== id) {
        deleteConfirmId.value = id
        return
    }
    void removeComment(id)
}

const removeComment = async (id: number): Promise<void> => {
    deleteConfirmId.value = null
    try {
        await props.remover(id)
        // 删除一级评论会级联删掉回复，直接刷新列表最稳
        await loadComments()
        emits('changed')
    } catch (error) {
        errorMessage.value = getRequestErrorMessage(error, '删除失败，请稍后重试')
    }
}

watch(() => props.targetId, () => {
    page.value = 1
    expandedThreads.value = new Set()
    deleteConfirmId.value = null
    errorMessage.value = ''
    void loadComments()
}, { immediate: true })
</script>

<style lang="less" scoped>
.cc-list {
    display: flex;
    width: 100%;
    min-width: 0;
    flex-direction: column;
    gap: @space-m;

    &-state {
        display: flex;
        min-height: 180px;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
    }

    &-scroll {
        width: 100%;
    }

    &-body {
        display: flex;
        width: 100%;
        flex-direction: column;
        padding-right: @space-s;
    }

    &-pagination {
        display: flex;
        justify-content: flex-end;
    }
}
</style>
