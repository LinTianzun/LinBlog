<!--
    后台随笔评论列表：只负责把随笔评论接口接到共用列表上。
    排版与文章评论完全一致，差异仅在数据源与删除接口。
-->
<template>
    <ContentCommentList :fetcher="fetcher" :remover="remover" :target-id="diaryId"
        :page-size="pageSize" :max-height="maxHeight" @changed="onChanged" />
</template>

<script lang="ts" setup>
import { getCurrentInstance, type ComponentPublicInstance } from 'vue'
import ContentCommentList from '../content/ContentCommentList.vue'
import type { DiaryComment } from '../../api/portal.ts'
import { getDiaryComments } from '../../api/portal.ts'
import { deleteInteractionComment } from '../../api/comment.ts'

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type MessageProxy = ComponentPublicInstance & {
    $message?: (options: MessageOptions) => void
}

const props = withDefaults(defineProps<{
    diaryId: number
    pageSize?: number
    maxHeight?: number
}>(), {
    pageSize: 20,
    maxHeight: 320,
})

const emits = defineEmits<{
    (event: 'changed'): void
}>()

const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined

const fetcher = async (params: { page: number; pageSize: number }) => {
    const result = await getDiaryComments(props.diaryId, params.page, params.pageSize)
    if (result.code !== 200 || !result.data) {
        throw new Error(result.message || '评论加载失败')
    }
    return { list: result.data.list as DiaryComment[], total: result.data.total }
}

// 随笔评论走 /public/comment/delete（commentType=diary），管理员可删任意评论
const remover = async (id: number) => {
    const result = await deleteInteractionComment({
        commentType: 'diary',
        commentId: Number(id),
    })
    if (result.code !== 200) throw new Error(result.message || '删除失败')
    proxy?.$message?.({ type: 'primary', message: '删除成功' })
}

const onChanged = (): void => {
    emits('changed')
}
</script>
